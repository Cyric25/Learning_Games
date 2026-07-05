/* BsStorage — Schiffeversenken-Quiz
   API-Prefix: bs-   localStorage-Prefix: bs_gs_  */

const BsStorage = {
  _code: null, _serverOk: null,

  setCode(c)  { this._code = c ? c.toUpperCase() : null; },
  getCode()   { return this._code; },

  generateCode() {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:4}, () => ch[Math.floor(Math.random()*ch.length)]).join('');
  },

  async checkServer() {
    if (this._serverOk !== null) return this._serverOk;
    if (window.location.protocol === 'file:') { this._serverOk = false; return false; }
    try {
      await fetch('../api.php?f=bs-game&code=PING', {method:'HEAD', signal:AbortSignal.timeout(2000)});
      this._serverOk = true;
    } catch { this._serverOk = false; }
    return this._serverOk;
  },

  _ser(gs)  { return {...gs, usedQuestionIds: [...(gs.usedQuestionIds instanceof Set ? gs.usedQuestionIds : (gs.usedQuestionIds||[]))]}; },
  _deser(d) { return {...d, usedQuestionIds: new Set(d.usedQuestionIds||[])}; },

  async save(gs) {
    if (!this._code) return;
    const json = JSON.stringify(this._ser(gs));
    localStorage.setItem('bs_gs_'+this._code, json);
    if (await this.checkServer())
      try { await fetch('../api.php?f=bs-game&code='+this._code, {method:'POST', body:json, headers:{'Content-Type':'application/json'}}); } catch {}
  },

  // Optimistisches Speichern mit Compare-and-Swap: sendet _baseRev; bei 409
  // (jemand anderes hat zwischenzeitlich geschrieben) liefert der Server den
  // aktuellen Stand zurück. Nur für umkämpfte Schreibpfade (Beitritt/Kick).
  async mutate(code, fn, tries = 6) {
    code = (code||this._code||'').toUpperCase();
    if (!code) return null;
    let state = await this.load(code);
    if (!state) return null;
    for (let i = 0; i < tries; i++) {
      const draft = this._deser(JSON.parse(JSON.stringify(this._ser(state))));
      fn(draft);
      if (!(await this.checkServer())) {
        // Kein Server → lokal speichern, kein Konflikt möglich
        await this.save(draft);
        return draft;
      }
      const payload = this._ser(draft);
      payload._baseRev = state._rev || 0;
      try {
        const r = await fetch('../api.php?f=bs-game&code='+code, {
          method:'POST', body:JSON.stringify(payload), headers:{'Content-Type':'application/json'}
        });
        if (r.status === 409) {
          const cur = await r.json();
          if (cur && cur.meta) { state = this._deser(cur); continue; } // neu mergen
          return null;
        }
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (j.rev) draft._rev = j.rev;
          localStorage.setItem('bs_gs_'+code, JSON.stringify(this._ser(draft)));
          return draft;
        }
      } catch {}
      return null;
    }
    return null; // zu viele Konflikte
  },

  async load(code) {
    code = (code||this._code||'').toUpperCase();
    if (!code) return null;
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=bs-game&code='+code); if (r.ok) { const d=await r.json(); if(d&&d.meta) return this._deser(d); } } catch {}
    const s = localStorage.getItem('bs_gs_'+code);
    if (s) try { return this._deser(JSON.parse(s)); } catch {}
    return null;
  },

  async loadGamesRegistry() {
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=bs-games'); if (r.ok) return await r.json(); } catch {}
    const reg = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('bs_gs_')) {
        const code = k.slice('bs_gs_'.length);
        try { const d = JSON.parse(localStorage.getItem(k)); if (d&&d.meta) reg[code] = { title: d.meta.title||'Spiel', status: d.phase||'setup', updatedAt: d.meta.createdAt||'' }; } catch {}
      }
    }
    return reg;
  },

  async deleteGame(code) {
    localStorage.removeItem('bs_gs_' + code.toUpperCase());
    if (await this.checkServer())
      try { await fetch('../api.php?f=bs-game&code='+code, {method:'DELETE'}); } catch {}
  },

  subscribe(code, cb) {
    code = code.toUpperCase();
    let stopped = false, src = null, timer = null, lastJson = '';
    // Nur bei tatsächlicher Änderung weiterreichen — verhindert, dass der
    // 500ms-Poll bei jedem Tick das komplette Grid neu rendert und den
    // MC-Timer zurücksetzt
    const emit = (raw) => {
      if (raw === lastJson) return;
      lastJson = raw;
      try { const d = JSON.parse(raw); if (d && d.meta) cb(this._deser(d)); } catch {}
    };
    const startSSE = () => {
      if (stopped) return;
      src = new EventSource('../api.php?f=bs-sse&code='+code);
      src.onmessage = e => { if(!stopped) emit(e.data); };
      src.addEventListener('reconnect', () => { src&&src.close(); src=null; if(!stopped) setTimeout(startSSE,500); });
      src.onerror = () => { src&&src.close(); src=null; if(!stopped) startPoll(); };
    };
    const startPoll = () => {
      if(stopped||timer) return;
      const fn = async () => { if(stopped) return; try { const r=await fetch('../api.php?f=bs-game&code='+code); if(r.ok) emit(await r.text()); } catch {} };
      fn(); timer = setInterval(fn, 500);
    };
    const startLocalPoll = () => {
      if(stopped||timer) return; let last='';
      timer = setInterval(() => { if(stopped) return; const s=localStorage.getItem('bs_gs_'+code); if(s&&s!==last){last=s;try{const d=JSON.parse(s);if(d&&d.meta)cb(this._deser(d));}catch{}} }, 500);
    };
    (async () => { if (await this.checkServer()) startSSE(); else startLocalPoll(); })();
    return { unsubscribe() { stopped=true; src&&src.close(); timer&&clearInterval(timer); } };
  }
};
