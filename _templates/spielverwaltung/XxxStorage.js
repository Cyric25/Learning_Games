/* ── XxxStorage ──────────────────────────────────────────────────────
   ERSETZEN:
     Xxx        → PascalCase Spielname (z.B. Leiterspiel)
     PREFIX-    → API-Prefix mit Bindestrich  (z.B. ls-)
     PREFIX_    → localStorage-Prefix         (z.B. ls_)

   Hinweise:
   - Set-Felder (z.B. usedQuestionIds) in _ser/_deser anpassen
   - Bei Spielen ohne Set-Felder: _ser/_deser vereinfachen
   ──────────────────────────────────────────────────────────────── */

const XxxStorage = {
  _code: null, _serverOk: null,

  setCode(c)  { this._code = c ? c.toUpperCase() : null; },
  getCode()   { return this._code; },

  generateCode() {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // kein O/I/0/1
    return Array.from({length:4}, () => ch[Math.floor(Math.random()*ch.length)]).join('');
  },

  async checkServer() {
    if (this._serverOk !== null) return this._serverOk;
    if (window.location.protocol === 'file:') { this._serverOk = false; return false; }
    try {
      await fetch('../api.php?f=PREFIX-game&code=PING', {method:'HEAD', signal:AbortSignal.timeout(2000)});
      this._serverOk = true;
    } catch { this._serverOk = false; }
    return this._serverOk;
  },

  // Set-Felder vor JSON serialisieren / nach JSON wiederherstellen
  _ser(gs)  { return {...gs, usedQuestionIds: [...(gs.usedQuestionIds instanceof Set ? gs.usedQuestionIds : (gs.usedQuestionIds||[]))]}; },
  _deser(d) { return {...d, usedQuestionIds: new Set(d.usedQuestionIds||[])}; },

  async save(gs) {
    if (!this._code) return;
    const json = JSON.stringify(this._ser(gs));
    localStorage.setItem('PREFIX_gs_'+this._code, json);
    if (await this.checkServer())
      try { await fetch('../api.php?f=PREFIX-game&code='+this._code, {method:'POST', body:json, headers:{'Content-Type':'application/json'}}); } catch {}
  },

  async load(code) {
    code = (code||this._code||'').toUpperCase();
    if (!code) return null;
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=PREFIX-game&code='+code); if (r.ok) { const d=await r.json(); if(d&&d.meta) return this._deser(d); } } catch {}
    const s = localStorage.getItem('PREFIX_gs_'+code);
    if (s) try { return this._deser(JSON.parse(s)); } catch {}
    return null;
  },

  async loadGamesRegistry() {
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=PREFIX-games'); if (r.ok) return await r.json(); } catch {}
    const reg = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('PREFIX_gs_')) {
        const code = k.slice('PREFIX_gs_'.length);
        try { const d = JSON.parse(localStorage.getItem(k)); if (d&&d.meta) reg[code] = { title: d.meta.title||'Spiel', status: d.phase||'setup', updatedAt: d.meta.createdAt||'' }; } catch {}
      }
    }
    return reg;
  },

  async deleteGame(code) {
    localStorage.removeItem('PREFIX_gs_' + code.toUpperCase());
    if (await this.checkServer())
      try { await fetch('../api.php?f=PREFIX-game&code='+code, {method:'DELETE'}); } catch {}
  },

  subscribe(code, cb) {
    code = code.toUpperCase();
    let stopped = false, src = null, timer = null;
    const startSSE = () => {
      if (stopped) return;
      src = new EventSource('../api.php?f=PREFIX-sse&code='+code);
      src.onmessage = e => { if(stopped) return; try { const d=JSON.parse(e.data); if(d&&d.meta) cb(this._deser(d)); } catch {} };
      src.addEventListener('reconnect', () => { src&&src.close(); src=null; if(!stopped) setTimeout(startSSE,500); });
      src.onerror = () => { src&&src.close(); src=null; if(!stopped) startPoll(); };
    };
    const startPoll = () => {
      if(stopped||timer) return;
      const fn = async () => { if(stopped) return; try { const r=await fetch('../api.php?f=PREFIX-game&code='+code); if(r.ok){const d=await r.json();if(d&&d.meta)cb(this._deser(d));} } catch {} };
      fn(); timer = setInterval(fn, 1000);
    };
    const startLocalPoll = () => {
      if(stopped||timer) return; let last='';
      timer = setInterval(() => { if(stopped) return; const s=localStorage.getItem('PREFIX_gs_'+code); if(s&&s!==last){last=s;try{const d=JSON.parse(s);if(d&&d.meta)cb(this._deser(d));}catch{}} }, 500);
    };
    (async () => { if (await this.checkServer()) startSSE(); else startLocalPoll(); })();
    return { unsubscribe() { stopped=true; src&&src.close(); timer&&clearInterval(timer); } };
  }
};
