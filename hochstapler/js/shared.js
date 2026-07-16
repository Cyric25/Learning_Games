// shared.js – HsStorage: Spielverwaltung für Hochstapler (Code, CAS, Sync)
// Dokumentiertes Duplikat von just-one/js/shared.js (JoStorage) — nur Prefixe
// und _sanitizeState (votes statt clues) angepasst. Änderungen am
// Storage-Muster müssen in allen Kopien erfolgen (docs/entwicklung.md §2).

const HsStorage = {
  _code: null, _serverOk: null, _viewerId: null,

  setCode(c) { this._code = c ? c.toUpperCase() : null; },
  getCode()  { return this._code; },

  // Eigene playerId des aufrufenden Geräts (nur Schülergerät – die
  // Lehrkraft setzt nie eine, sieht dadurch immer den vollen Zustand;
  // die Tafel setzt den Sentinel '*'). Wird als ?playerId=… mitgeschickt,
  // damit der Server das Geheimwort vor dem/den Hochstapler(n) verbirgt.
  setViewerId(id) { this._viewerId = id || null; },
  _vp() { return this._viewerId ? '&playerId=' + encodeURIComponent(this._viewerId) : ''; },

  generateCode() {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // kein O/I/0/1
    return Array.from({length:4}, () => ch[Math.floor(Math.random()*ch.length)]).join('');
  },

  async checkServer() {
    if (this._serverOk !== null) return this._serverOk;
    if (window.location.protocol === 'file:') { this._serverOk = false; return false; }
    try {
      await fetch('../api.php?f=hs-game&code=PING', {method:'HEAD', signal:AbortSignal.timeout(2000)});
      this._serverOk = true;
    } catch { this._serverOk = false; }
    return this._serverOk;
  },

  // Spielernamen an der Vertrauensgrenze klemmen (Anzeigename kommt von
  // fremden Geräten). Zusätzlich: PHP kodiert ein leeres JSON-Objekt {}
  // beim Speichern/Laden als [] — `currentRound.votes` ist die einzige
  // Dictionary-artige Stelle im Zustand (Schlüssel = playerId) und muss
  // deshalb nach jedem Laden auf ein echtes Objekt zurückgeklemmt werden
  // (sonst verwirft JSON.stringify() gesetzte Stimmen lautlos).
  _sanitizeState(gs) {
    if (Array.isArray(gs.players)) {
      gs.players = gs.players.map(p => ({
        ...p,
        name: String(p.name || '').replace(/[<>]/g, '').slice(0, 30)
      }));
    }
    if (gs.currentRound && Array.isArray(gs.currentRound.votes)) {
      gs.currentRound.votes = {};
    }
    return gs;
  },

  async save(gs) {
    if (!this._code) return;
    const json = JSON.stringify(gs);
    localStorage.setItem('hs_gs_'+this._code, json);
    if (await this.checkServer())
      try { await fetch('../api.php?f=hs-game&code='+this._code, {method:'POST', body:json, headers:{'Content-Type':'application/json'}}); } catch {}
  },

  async load(code) {
    code = (code||this._code||'').toUpperCase();
    if (!code) return null;
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=hs-game&code='+code+this._vp()); if (r.ok) { const d=await r.json(); if(d&&d.meta) return this._sanitizeState(d); } } catch {}
    const s = localStorage.getItem('hs_gs_'+code);
    if (s) try { return this._sanitizeState(JSON.parse(s)); } catch {}
    return null;
  },

  async loadGamesRegistry() {
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=hs-games'); if (r.ok) return await r.json(); } catch {}
    const reg = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('hs_gs_')) {
        const code = k.slice('hs_gs_'.length);
        try { const d = JSON.parse(localStorage.getItem(k)); if (d&&d.meta) reg[code] = { title: d.meta.title||'Spiel', status: d.phase||'setup', updatedAt: d.meta.createdAt||'' }; } catch {}
      }
    }
    return reg;
  },

  async deleteGame(code) {
    code = code.toUpperCase();
    localStorage.removeItem('hs_gs_' + code);
    if (await this.checkServer())
      try { await fetch('../api.php?f=hs-game&code='+code, {method:'DELETE', headers:{'X-Admin-Key':'LP-Spiele-2026'}}); } catch {}
  },

  // Optimistisches Speichern mit Compare-and-Swap (CAS) für umkämpfte Pfade:
  // Beitritt, Kick, Stimmabgabe. fn(draft) darf `false` zurückgeben, um die
  // Aktion abzubrechen (mutate() → null). Bei 409 wird auf dem aktuellen
  // Serverstand neu gemergt (bis zu `tries`-mal).
  async mutate(fn, tries = 6) {
    const code = this._code;
    if (!code) return null;
    let state = await this.load(code);
    if (!state) return null;
    for (let i = 0; i < tries; i++) {
      const draft = JSON.parse(JSON.stringify(state));
      if (fn(draft) === false) return null;
      if (!await this.checkServer()) {
        localStorage.setItem('hs_gs_'+code, JSON.stringify(draft));
        return draft;
      }
      const payload = { ...draft, _baseRev: state._rev || 0 };
      try {
        const r = await fetch('../api.php?f=hs-game&code='+code+this._vp(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (r.status === 409) {
          const cur = await r.json();
          if (cur && cur.meta) { state = this._sanitizeState(cur); continue; } // neu mergen
          return null;
        }
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (j.rev) draft._rev = j.rev;
          localStorage.setItem('hs_gs_'+code, JSON.stringify(draft));
          return this._sanitizeState(draft);
        }
      } catch {}
      return null;
    }
    return null; // zu viele Konflikte
  },

  subscribe(code, cb) {
    code = code.toUpperCase();
    let stopped = false, src = null, timer = null;
    const startSSE = () => {
      if (stopped) return;
      src = new EventSource('../api.php?f=hs-sse&code='+code+this._vp());
      src.onmessage = e => { if(stopped) return; try { const d=JSON.parse(e.data); if(d&&d.meta) cb(this._sanitizeState(d)); } catch {} };
      src.addEventListener('reconnect', () => { src&&src.close(); src=null; if(!stopped) setTimeout(startSSE,500); });
      src.onerror = () => { src&&src.close(); src=null; if(!stopped) startPoll(); };
    };
    const startPoll = () => {
      if(stopped||timer) return;
      const fn = async () => { if(stopped) return; try { const r=await fetch('../api.php?f=hs-game&code='+code+this._vp()); if(r.ok){const d=await r.json();if(d&&d.meta)cb(this._sanitizeState(d));} } catch {} };
      fn(); timer = setInterval(fn, 1000);
    };
    const startLocalPoll = () => {
      if(stopped||timer) return; let last='';
      timer = setInterval(() => { if(stopped) return; const s=localStorage.getItem('hs_gs_'+code); if(s&&s!==last){last=s;try{const d=JSON.parse(s);if(d&&d.meta)cb(this._sanitizeState(d));}catch{}} }, 500);
    };
    (async () => { if (await this.checkServer()) startSSE(); else startLocalPoll(); })();
    return { unsubscribe() { stopped=true; src&&src.close(); timer&&clearInterval(timer); } };
  }
};
