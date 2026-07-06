/* quizpfad.js – Spiellogik */

// XSS-Schutz: color aus Remote-State klemmen (State ist per Code beschreibbar)
function _qpSafeColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#888'; }
function _qpSanitizeTeams(st) {
  if (st && Array.isArray(st.teams)) st.teams.forEach(t => { if (t && 'color' in t) t.color = _qpSafeColor(t.color); });
  return st;
}

// ── QpStorage ────────────────────────────────────────────────
const QpStorage = {
  _code: null, _serverOk: null,
  setCode(c)   { this._code = c ? c.toUpperCase() : null; },
  getCode()    { return this._code; },
  generateCode() {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:4}, () => ch[Math.floor(Math.random()*ch.length)]).join('');
  },
  async checkServer() {
    if (window.location.protocol === 'file:') return false;
    // Positiv dauerhaft cachen; negativ nur 15s — ein einzelner Timeout im
    // Schul-WLAN darf das Gerät nicht dauerhaft offline schalten
    if (this._serverOk === true) return true;
    if (this._serverOk === false && Date.now() - (this._serverCheckedAt || 0) < 15000) return false;
    try {
      await fetch('../api.php?f=qp-game&code=PING', {method:'HEAD', signal:AbortSignal.timeout(2000)});
      this._serverOk = true;
    } catch { this._serverOk = false; this._serverCheckedAt = Date.now(); }
    return this._serverOk;
  },
  _ser(gs)  { return {...gs, usedQuestionIds: [...(gs.usedQuestionIds instanceof Set ? gs.usedQuestionIds : (gs.usedQuestionIds||[]))]};},
  _deser(d) { return _qpSanitizeTeams({...d, usedQuestionIds: new Set(d.usedQuestionIds||[])});},
  async save(gs) {
    if (!this._code) return;
    const code = this._code; // gegen Code-Wechsel während await binden
    const full = this._ser(gs);
    localStorage.setItem('qp_gs_'+code, JSON.stringify(full));
    if (await this.checkServer()) {
      // takenTeams nur über mutate() schreiben (Server merged das Feld)
      const { takenTeams, ...payload } = full;
      try { await fetch('../api.php?f=qp-game&code='+code, {method:'POST', body:JSON.stringify(payload), headers:{'Content-Type':'application/json'}}); } catch {}
    }
  },
  // Optimistisches Speichern mit Compare-and-Swap (nur für umkämpfte Pfade wie
  // Beitritt/Kick): sendet _baseRev; bei 409 lädt der Server den aktuellen
  // Stand nach und wir mergen erneut, statt fremde Änderungen zu überschreiben.
  async mutate(code, fn, tries = 6) {
    code = (code||this._code||'').toUpperCase();
    if (!code) return null;
    let state = await this.load(code);
    if (!state) return null;
    for (let i = 0; i < tries; i++) {
      const draft = this._deser(JSON.parse(JSON.stringify(this._ser(state))));
      fn(draft);
      if (!(await this.checkServer())) {
        localStorage.setItem('qp_gs_'+code, JSON.stringify(this._ser(draft)));
        return draft;
      }
      const payload = this._ser(draft);
      payload._baseRev = state._rev || 0;
      try {
        const r = await fetch('../api.php?f=qp-game&code='+code, {
          method:'POST', body:JSON.stringify(payload), headers:{'Content-Type':'application/json'}
        });
        if (r.status === 409) {
          const cur = await r.json();
          if (cur && cur.meta) { state = this._deser(cur); continue; }
          return null;
        }
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (j.rev) draft._rev = j.rev;
          localStorage.setItem('qp_gs_'+code, JSON.stringify(this._ser(draft)));
          return draft;
        }
      } catch {}
      return null;
    }
    return null;
  },
  async load(code) {
    code = (code||this._code||'').toUpperCase();
    if (!code) return null;
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=qp-game&code='+code); if (r.ok) { const d=await r.json(); if(d&&d.meta) return this._deser(d); } } catch {}
    const s = localStorage.getItem('qp_gs_'+code);
    if (s) try { return this._deser(JSON.parse(s)); } catch {}
    return null;
  },
  async loadGamesRegistry() {
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=qp-games'); if (r.ok) return await r.json(); } catch {}
    const reg = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('qp_gs_')) {
        const code = k.slice('qp_gs_'.length);
        try { const d = JSON.parse(localStorage.getItem(k)); if (d&&d.meta) reg[code] = { title: d.meta.title||'QuizPfad', status: d.phase||'setup', updatedAt: d.meta.createdAt||'' }; } catch {}
      }
    }
    return reg;
  },
  async deleteGame(code) {
    localStorage.removeItem('qp_gs_' + code.toUpperCase());
    if (await this.checkServer())
      try { await fetch('../api.php?f=qp-game&code='+code, {method:'DELETE', headers:{'X-Admin-Key': 'LP-Spiele-2026'}}); } catch {}
  },
  subscribe(code, cb) {
    code = code.toUpperCase();
    let stopped = false, src = null, timer = null, lastJson = '';
    // Nur bei tatsächlicher Änderung weiterreichen (verhindert Dauer-Re-Renders)
    const emit = (raw) => {
      if (raw === lastJson) return;
      lastJson = raw;
      try { const d = JSON.parse(raw); if (d && d.meta) cb(this._deser(d)); } catch {}
    };
    const startSSE = () => {
      if (stopped) return;
      src = new EventSource('../api.php?f=qp-sse&code='+code);
      src.onmessage = e => { if(!stopped) emit(e.data); };
      src.addEventListener('reconnect', () => { src&&src.close(); src=null; if(!stopped) setTimeout(startSSE,500); });
      src.onerror = () => { src&&src.close(); src=null; if(!stopped) startPoll(); };
    };
    const startPoll = () => {
      if(stopped||timer) return;
      const fn = async () => { if(stopped) return; try { const r=await fetch('../api.php?f=qp-game&code='+code); if(r.ok) emit(await r.text()); } catch {} };
      fn(); timer = setInterval(fn, 1000);
    };
    const startLocalPoll = () => {
      if(stopped||timer) return; let last='';
      timer = setInterval(() => { if(stopped) return; const s=localStorage.getItem('qp_gs_'+code); if(s&&s!==last){last=s;try{const d=JSON.parse(s);if(d&&d.meta)cb(this._deser(d));}catch{}} }, 300);
    };
    (async () => { if (await this.checkServer()) startSSE(); else startLocalPoll(); })();
    return { unsubscribe() { stopped=true; src&&src.close(); timer&&clearInterval(timer); } };
  }
};

// ── Multi-Correct Helpers ────────────────────────────────────
function isMcCorrect(q, selectedArr) {
  const correct = (Array.isArray(q.correctIndices) && q.correctIndices.length > 0)
    ? [...q.correctIndices].sort((a,b)=>a-b) : [q.correctIndex ?? q.richtig ?? 0];
  const sel = [...selectedArr].sort((a,b)=>a-b);
  return correct.length === sel.length && correct.every((v,i) => v === sel[i]);
}
function correctSet(q) {
  return new Set((Array.isArray(q.correctIndices) && q.correctIndices.length > 0)
    ? q.correctIndices : [q.correctIndex ?? q.richtig ?? 0]);
}

// ── Difficulty System ────────────────────────────────────────
const DIFFICULTY_FIELDS = {
  100: [1, 1],
  200: [1, 2],
  300: [2, 3],
  400: [3, 4],
  500: [4, 5]
};

const DIFFICULTY_RANGE_LABELS = {
  100: '1 Feld',
  200: '1–2 Felder',
  300: '2–3 Felder',
  400: '3–4 Felder',
  500: '4–5 Felder'
};

function difficultyAdvance(difficulty) {
  const range = DIFFICULTY_FIELDS[difficulty] || [1, 1];
  return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
}

// ── Constants ────────────────────────────────────────────────
const COLS = 6;
const DEFAULT_COLORS = ['#0077bb','#ee7733','#cc3311','#009988','#aa3377','#ddaa33','#555555','#332288'];

const BONUS_TYPES = [
  { id: 'advance',  icon: '⬆️', name: 'Vorziehen!',     color: '#2ecc71', desc: 'Das Team rückt 2 Felder vor!' },
  { id: 'setback',  icon: '⬇️', name: 'Zurücksetzen!',  color: '#e74c3c', desc: 'Das Team wird 2 Felder zurückgesetzt!' },
  { id: 'extra',    icon: '🎲', name: 'Extrarunde!',     color: '#f4a261', desc: 'Das Team darf sofort nochmal!' },
  { id: 'joker',    icon: '🃏', name: 'Joker-Feld!',     color: '#9b59b6', desc: 'Das Team erhält einen Joker (1× Frage überspringen).' },
  { id: 'duel',     icon: '⚔️', name: 'Teamduell!',      color: '#e67e22', desc: 'Zwei Teams treten gegeneinander an!' }
];

// ── State ────────────────────────────────────────────────────
let fragenBank = null;
let teams = [];
let board = [];
let fieldCount = 30;
let currentTeamIdx = 0;
let round = 1;
let gameOver = false;
let pendingBonus = null;
let pendingQuestionResult = null;
let usedQuestionIds = new Set();
let duelOpponentIdx = null;
let selectedCategoryIds = new Set();
let activeFragenBank = null;
let qpLiveQ = null;
let gameCreatedAt = null;
let takenTeams = [];
let qpSub = null;
let lastSeenLqId = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadFragen();
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) await _gsEnter(urlCode.toUpperCase());
  else showGameSelector();
});

async function loadFragen() {
  let rqData = null;
  try {
    if (window.location.protocol !== 'file:') {
      try {
        const r = await fetch('../api.php?f=questions');
        if (r.ok) { const d = await r.json(); if (d.categories && d.categories.length) rqData = d; }
      } catch {}
    }
    if (!rqData) {
      const r = await fetch('../data/questions.json');
      if (r.ok) { const d = await r.json(); if (d.categories && d.categories.length) rqData = d; }
    }
  } catch {}
  if (!rqData) {
    const ls = localStorage.getItem('rq_questions');
    if (ls) try { const d = JSON.parse(ls); if (d.categories && d.categories.length) rqData = d; } catch {}
  }
  if (rqData) {
    fragenBank = convertRQtoQuizPfad(rqData);
    renderCategorySelector();
    return;
  }
  document.getElementById('setup-error').textContent =
    'Keine Fragen geladen. Bitte Fragen in der zentralen Fragendatenbank anlegen.';
}

// ── Game Management ───────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildCurrentGameState() {
  return {
    meta: { gameCode: QpStorage.getCode() || '', title: 'QuizPfad', createdAt: gameCreatedAt || new Date().toISOString() },
    phase: gameOver ? 'finished' : (board.length > 0 ? 'playing' : 'setup'),
    teams, board, fieldCount, currentTeamIdx, round, usedQuestionIds,
    activeCategoryIds: [...selectedCategoryIds],
    takenTeams: takenTeams || [],
    liveQuestion: qpLiveQ
  };
}

async function showGameSelector() {
  showScreen('game-selector');
  const list = document.getElementById('gs-game-list');
  list.innerHTML = '<p class="gs-empty">Lade Spiele…</p>';
  const registry = await QpStorage.loadGamesRegistry();
  const entries = Object.entries(registry);
  if (entries.length === 0) { list.innerHTML = '<p class="gs-empty">Noch keine Spiele vorhanden.</p>'; return; }
  entries.sort((a,b) => (b[1].updatedAt||b[1].createdAt||'').localeCompare(a[1].updatedAt||a[1].createdAt||''));
  list.innerHTML = entries.map(([code, info]) => {
    const statusLabel = {playing:'🟢 Läuft', finished:'🏁 Beendet'}[info.status] || '⚙ Setup';
    const date = info.updatedAt ? new Date(info.updatedAt).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    const ts = info.updatedAt||info.createdAt;
    let expiryHint = '';
    if (ts) { const rem = 24*3600000-(Date.now()-new Date(ts).getTime()); if(rem>0){const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000); expiryHint=` · ${h}h ${m}m übrig`;} }
    return `<div class="gs-game-card" onclick="window._gsEnter('${code}')">
      <div class="gs-game-code">${code}</div>
      <div class="gs-game-info">
        <div class="gs-game-title">${escapeHtml(info.title||'QuizPfad')}</div>
        <div class="gs-game-meta">${statusLabel} · ${date}${expiryHint}</div>
      </div>
      <div class="gs-game-actions">
        <button class="gs-btn-delete" onclick="event.stopPropagation();window._gsDelete('${code}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function joinAsStudent() {
  const input = document.getElementById('gs-code-input');
  const errEl = document.getElementById('gs-join-error');
  const code = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (errEl) errEl.textContent = '';
  if (!code || code.length < 4) { if (errEl) errEl.textContent = 'Bitte 4-stelligen Code eingeben.'; return; }
  window.location.href = 'view.html?code=' + code;
}

async function createNewGame() {
  const code = QpStorage.generateCode();
  QpStorage.setCode(code);
  gameCreatedAt = new Date().toISOString();
  board = []; teams = []; usedQuestionIds = new Set(); gameOver = false; qpLiveQ = null; takenTeams = [];
  await QpStorage.save({
    meta: { gameCode: code, title: 'QuizPfad', createdAt: gameCreatedAt },
    phase: 'setup', teams: [], board: [], fieldCount: 30, currentTeamIdx: 0, round: 1,
    usedQuestionIds: new Set(), activeCategoryIds: [], takenTeams: [], liveQuestion: null
  });
  window.history.replaceState({}, '', 'index.html?code=' + code);
  if (!fragenBank) await loadFragen();
  renderTeamCountSelector(4);
  showScreen('setup-screen');
  showCodeBanner();
}

async function _gsEnter(code) {
  QpStorage.setCode(code);
  const gs = await QpStorage.load(code);
  if (!gs) { alert('Spiel nicht gefunden.'); showGameSelector(); return; }
  window.history.replaceState({}, '', 'index.html?code=' + code);
  gameCreatedAt = gs.meta.createdAt || new Date().toISOString();
  if (!fragenBank) await loadFragen();
  if (gs.phase === 'playing' && gs.board && gs.board.length > 0) {
    teams = gs.teams || [];
    board = gs.board;
    fieldCount = gs.fieldCount || gs.board.length;
    currentTeamIdx = gs.currentTeamIdx || 0;
    round = gs.round || 1;
    gameOver = false;
    takenTeams = gs.takenTeams || [];
    usedQuestionIds = gs.usedQuestionIds instanceof Set ? gs.usedQuestionIds : new Set(gs.usedQuestionIds || []);
    qpLiveQ = gs.liveQuestion || null;
    if (gs.activeCategoryIds && gs.activeCategoryIds.length) {
      selectedCategoryIds = new Set(gs.activeCategoryIds);
      activeFragenBank = {
        kategorien: fragenBank ? fragenBank.kategorien.filter(k => selectedCategoryIds.has(k.id)) : [],
        fragen: fragenBank ? fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie)) : []
      };
    }
    showScreen('game-screen');
    renderBoard();
    renderSidebar();
    updateTurnBanner();
    showCodeBanner();
    startSSESubscription(code);
    // Restore open question modal if pending
    if (qpLiveQ && !qpLiveQ.resolved) {
      showQuestionModalFromState(qpLiveQ);
    } else if (qpLiveQ && qpLiveQ.resolved) {
      // Lehrkraft-Reload während bereits beantworteter Frage: den
      // ausstehenden Zug direkt abschließen, sonst bleibt qpLiveQ für
      // immer gesetzt und die Schwierigkeits-Buttons sind dauerhaft gesperrt
      pendingQuestionResult = {
        question: qpLiveQ.question, resolved: true,
        correct: qpLiveQ.correct, advanceAmount: qpLiveQ.advanceAmount
      };
      continueAfterQuestion();
    }
  } else if (gs.phase === 'finished') {
    showGameSelector();
  } else {
    renderTeamCountSelector(4);
    showScreen('setup-screen');
    showCodeBanner();
  }
}

async function _gsDelete(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await QpStorage.deleteGame(code);
  showGameSelector();
}
window._gsEnter  = _gsEnter;
window._gsDelete = _gsDelete;

function showCodeBanner() {
  const code = QpStorage.getCode(); if (!code) return;
  const existing = document.getElementById('code-banner');
  if (existing) { existing.querySelector('.code-val').textContent = code; return; }
  const b = document.createElement('div');
  b.id = 'code-banner';
  b.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999;background:var(--bg-sidebar,#fff);color:var(--text-primary,#333);border-radius:12px;padding:10px 16px;font-size:.85rem;box-shadow:0 2px 12px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px;border:1px solid var(--border);';
  b.innerHTML = '<span>📱 Schüler:</span><strong class="code-val" style="font-size:1.2rem;letter-spacing:2px">'+code+'</strong>' +
    '<a href="view.html?code='+code+'" target="_blank" style="color:var(--accent);font-size:.8rem;text-decoration:none">Ansicht ↗</a>' +
    '<a href="board.html?code='+code+'" target="_blank" style="color:var(--accent-teal,#2a9d8f);font-size:.8rem;text-decoration:none">Tafel ↗</a>';
  document.body.appendChild(b);
}

function resetToSelector() {
  if (qpSub) { qpSub.unsubscribe(); qpSub = null; }
  QpStorage.setCode(null);
  window.history.replaceState({}, '', 'index.html');
  const banner = document.getElementById('code-banner'); if (banner) banner.remove();
  showGameSelector();
}

// ── SSE Subscription ─────────────────────────────────────────
function startSSESubscription(code) {
  if (qpSub) qpSub.unsubscribe();
  qpSub = QpStorage.subscribe(code || QpStorage.getCode(), function onRemoteUpdate(newGs) {
    if (gameOver) return;
    if (!newGs || !newGs.teams) return;

    // Sync takenTeams
    const oldTaken = JSON.stringify(takenTeams);
    takenTeams = newGs.takenTeams || [];
    if (JSON.stringify(takenTeams) !== oldTaken) {
      renderSidebar();
    }

    const remoteLq = newGs.liveQuestion;

    // Student answered MC question remotely
    if (remoteLq && remoteLq.resolved && remoteLq.correct !== null) {
      if (!qpLiveQ || !qpLiveQ.resolved) {
        // Sync state
        teams = newGs.teams;
        usedQuestionIds = newGs.usedQuestionIds;
        qpLiveQ = remoteLq;
        applyRemoteAnswer(remoteLq);
      }
      return;
    }

    // Question cleared (nextTurn happened remotely)
    if (!remoteLq && qpLiveQ && qpLiveQ.resolved) {
      teams = newGs.teams;
      board = newGs.board || board;
      currentTeamIdx = newGs.currentTeamIdx;
      round = newGs.round;
      qpLiveQ = null;
      gameOver = newGs.phase === 'finished';
      renderBoard();
      renderSidebar();
      updateTurnBanner();
      if (gameOver) {
        // b ist ein Index — Startwert 0 ist falsy, daher direkt vergleichen
        const winner = teams.reduce((b,t,i) => t.position > teams[b].position ? i : b, 0);
        setTimeout(() => showWinner(winner), 600);
      }
    }
  });
}

function applyRemoteAnswer(lq) {
  if (lq.question.typ === 'offen') return; // offene Fragen wertet die Lehrkraft im Modal

  const modal = document.getElementById('question-modal');
  const modalOpen = modal.classList.contains('open');

  // Spiellogik unabhängig von der Modal-Sichtbarkeit ausführen — sonst
  // friert das Spiel ein, wenn das Modal (z.B. nach Reload) zu ist
  const team = teams[lq.teamIdx];
  if (lq.correct && team) team.correctCount = (team.correctCount || 0) + 1;
  else if (team) team.wrongCount = (team.wrongCount || 0) + 1;

  if (pendingQuestionResult) {
    pendingQuestionResult.resolved = true;
    pendingQuestionResult.correct = lq.correct;
  } else {
    pendingQuestionResult = { question: lq.question, resolved: true, correct: lq.correct, advanceAmount: lq.advanceAmount };
  }

  if (!modalOpen) {
    continueAfterQuestion();
    return;
  }

  const allBtns = document.querySelectorAll('#q-options .answer-btn');
  allBtns.forEach(b => b.classList.add('disabled'));
  const cs = correctSet(lq.question);
  allBtns.forEach((b, i) => {
    if (cs.has(i)) b.classList.add('correct');
    else if (i === lq.selectedMcIndex && !lq.correct) b.classList.add('wrong');
  });

  const resultEl = document.getElementById('q-result');
  resultEl.textContent = lq.correct ? '✓ Richtig!' : '✗ Falsch!';
  resultEl.className = 'modal-result visible ' + (lq.correct ? 'correct-result' : 'wrong-result');

  const explEl = document.getElementById('q-explanation');
  if (lq.question.erklaerung) {
    document.getElementById('q-explanation-text').textContent = lq.question.erklaerung;
    explEl.classList.add('visible');
  }

  document.getElementById('q-continue').classList.add('visible');

  setTimeout(() => {
    if (document.getElementById('question-modal').classList.contains('open')) {
      continueAfterQuestion();
    }
  }, 1500);
}

// ── Convert Risiko-Quiz → QuizPfad ────────────────────────────
function convertRQtoQuizPfad(rqData) {
  const kategorien = [];
  const fragen = [];
  const colors = ['#332288','#88ccee','#44aa99','#117733','#999933','#ddcc77','#cc6677','#882255','#aa4499','#0077bb'];
  let colorIdx = 0;

  function collectLeafCategories(node, path, parentIcon) {
    const subs = node.subcategories || [];
    const hasQuestions = node.questions && node.questions.length > 0;
    const isLeaf = !subs.length;

    if (hasQuestions && isLeaf) {
      const katId = node.id;
      const katName = path.join(' › ');
      if (!kategorien.find(k => k.id === katId)) {
        kategorien.push({ id: katId, name: katName, icon: parentIcon || '📚', farbe: colors[colorIdx++ % colors.length] });
      }

      node.questions.forEach(q => {
        const diff = q.difficulty || 100;
        const schwierigkeit = diff <= 200 ? 'leicht' : diff <= 300 ? 'mittel' : 'schwer';
        let typ, antworten, richtig, correctIndices = null;

        if (q.type === 'mc' && q.options && q.options.length > 0) {
          typ = 'multiple_choice';
          antworten = q.options.slice();
          richtig = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
          if (Array.isArray(q.correctIndices) && q.correctIndices.length > 0) correctIndices = q.correctIndices.slice();
        } else {
          typ = 'offen';
          antworten = [];
          richtig = -1;
        }

        const frageObj = {
          id: q.id,
          kategorie: katId,
          difficulty: diff,
          schwierigkeit,
          frage: q.question || '',
          typ,
          antworten,
          richtig,
          erklaerung: q.answer || q.hint || ''
        };
        if (correctIndices) frageObj.correctIndices = correctIndices;
        fragen.push(frageObj);
      });
      return;
    }

    subs.forEach(sub => collectLeafCategories(sub, [...path, sub.name], parentIcon));
  }

  const icons = ['🧪','🧬','⚗️','🔬','🌍','📐','💡','🎯'];
  (rqData.categories || []).forEach((cat, i) => {
    const icon = icons[i % icons.length];
    if ((!cat.subcategories || cat.subcategories.length === 0) && cat.questions && cat.questions.length > 0) {
      collectLeafCategories(cat, [cat.name], icon);
    } else {
      (cat.subcategories || []).forEach(sub => collectLeafCategories(sub, [cat.name, sub.name], icon));
    }
  });

  return { kategorien, fragen };
}

// ── Category Selector ─────────────────────────────────────────
function renderCategorySelector() {
  if (!fragenBank || !fragenBank.kategorien.length) return;
  const section = document.getElementById('category-section');
  section.style.display = '';
  const list = document.getElementById('cat-select-list');
  list.innerHTML = '';
  selectedCategoryIds.clear();
  fragenBank.kategorien.forEach(k => selectedCategoryIds.add(k.id));

  fragenBank.kategorien.forEach(kat => {
    const qCount = fragenBank.fragen.filter(q => q.kategorie === kat.id).length;
    const item = document.createElement('div');
    item.className = 'cat-select-item selected';
    item.dataset.catId = kat.id;
    item.innerHTML =
      '<div class="cat-select-color" style="background:' + kat.farbe + ';"></div>' +
      '<span class="cat-select-icon">' + kat.icon + '</span>' +
      '<span class="cat-select-name">' + escapeHtml(kat.name) + '</span>' +
      '<span class="cat-select-count">' + qCount + ' Fragen</span>' +
      '<div class="cat-select-check">✓</div>';
    item.onclick = () => {
      if (selectedCategoryIds.has(kat.id)) { selectedCategoryIds.delete(kat.id); item.classList.remove('selected'); }
      else { selectedCategoryIds.add(kat.id); item.classList.add('selected'); }
      updateCatSelectInfo();
    };
    list.appendChild(item);
  });
  updateCatSelectInfo();
}

function toggleAllCategories(selectAll) {
  document.querySelectorAll('.cat-select-item').forEach(item => {
    selectedCategoryIds[selectAll ? 'add' : 'delete'](item.dataset.catId);
    item.classList[selectAll ? 'add' : 'remove']('selected');
  });
  updateCatSelectInfo();
}

function updateCatSelectInfo() {
  const el = document.getElementById('cat-select-info');
  if (!el) return;
  const total = fragenBank.kategorien.length;
  const selected = selectedCategoryIds.size;
  const qCount = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie)).length;
  const btn = document.getElementById('btn-start');
  const teamCount = document.querySelectorAll('.team-config-row').length || 2;
  const calcField = calculateFieldCount(
    fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie)),
    teamCount
  );

  if (selected === 0 || qCount === 0) {
    el.className = 'cat-select-info warning';
    el.textContent = 'Keine Kategorie ausgewählt!';
    if (btn) btn.disabled = true;
    return;
  }
  const ok = qCount >= 10;
  if (ok) {
    el.className = 'cat-select-info';
    el.textContent = `✅ ${selected}/${total} Kategorien · ${qCount} Fragen · Pfad: ~${calcField} Felder`;
  } else {
    el.className = 'cat-select-info warning';
    el.textContent = `❌ Nur ${qCount} Fragen – mindestens 10 benötigt.`;
  }
  if (btn) btn.disabled = !ok;
}

// ── Setup Screen ─────────────────────────────────────────────
function calculateFieldCount(fragen, numTeams) {
  const total = fragen.length;
  const raw = Math.floor(total * 1.5 / Math.max(1, numTeams));
  return Math.max(12, Math.min(60, Math.round(raw / COLS) * COLS));
}

function getAvailableDifficulties() {
  if (!activeFragenBank) return [];
  const avail = new Set();
  activeFragenBank.fragen.filter(q => !usedQuestionIds.has(q.id)).forEach(q => avail.add(q.difficulty));
  return [100, 200, 300, 400, 500].filter(d => avail.has(d));
}

function pickQuestionByDifficulty(difficulty) {
  if (!activeFragenBank) return null;
  const pool = activeFragenBank.fragen.filter(q => q.difficulty === difficulty && !usedQuestionIds.has(q.id));
  if (!pool.length) return null;
  const q = pool[Math.floor(Math.random() * pool.length)];
  usedQuestionIds.add(q.id);
  return q;
}

function renderTeamCountSelector(selected) {
  const row = document.getElementById('team-count-row');
  row.innerHTML = '';
  for (let i = 1; i <= 8; i++) {
    const btn = document.createElement('button');
    btn.className = 'team-count-btn' + (i === selected ? ' selected' : '');
    btn.textContent = i;
    btn.onclick = () => { renderTeamCountSelector(i); renderTeamConfig(i); updateCatSelectInfo(); };
    row.appendChild(btn);
  }
  renderTeamConfig(selected);
}

function renderTeamConfig(count) {
  const list = document.getElementById('team-config-list');
  const existing = [];
  list.querySelectorAll('.team-config-row').forEach(row => {
    existing.push({ name: row.querySelector('input[type="text"]').value, color: row.querySelector('input[type="color"]').value });
  });
  list.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const name = (existing[i] && existing[i].name) || ('Team ' + (i + 1));
    const color = (existing[i] && existing[i].color) || DEFAULT_COLORS[i] || DEFAULT_COLORS[0];
    const row = document.createElement('div');
    row.className = 'team-config-row';
    row.innerHTML =
      '<div class="team-color-dot" style="background:' + color + ';" onclick="this.nextElementSibling.click()"></div>' +
      '<input type="color" value="' + color + '" onchange="this.previousElementSibling.style.background=this.value">' +
      '<input type="text" value="' + name + '" maxlength="20" placeholder="Teamname">';
    list.appendChild(row);
  }
}

function startGame() {
  if (!fragenBank || !fragenBank.fragen || fragenBank.fragen.length === 0) {
    document.getElementById('setup-error').textContent = 'Keine Fragen geladen!'; return;
  }
  if (selectedCategoryIds.size === 0) {
    document.getElementById('setup-error').textContent = 'Bitte mindestens eine Kategorie auswählen!'; return;
  }

  activeFragenBank = {
    kategorien: fragenBank.kategorien.filter(k => selectedCategoryIds.has(k.id)),
    fragen: fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie))
  };

  if (activeFragenBank.fragen.length < 10) {
    document.getElementById('setup-error').textContent = 'Mindestens 10 Fragen benötigt.'; return;
  }

  teams = [];
  document.querySelectorAll('.team-config-row').forEach((row, i) => {
    teams.push({
      name: row.querySelector('input[type="text"]').value || ('Team ' + (i + 1)),
      color: row.querySelector('input[type="color"]').value,
      position: 0, correctCount: 0, wrongCount: 0, hasJoker: false, jokerUsed: false
    });
  });
  if (teams.length === 0) return;

  fieldCount = calculateFieldCount(activeFragenBank.fragen, teams.length);
  board = generateBoard(fieldCount);
  currentTeamIdx = 0;
  round = 1;
  gameOver = false;
  usedQuestionIds.clear();
  duelOpponentIdx = null;
  takenTeams = [];
  qpLiveQ = null;

  showScreen('game-screen');
  renderBoard();
  renderSidebar();
  updateTurnBanner();

  if (!gameCreatedAt) gameCreatedAt = new Date().toISOString();
  QpStorage.save(buildCurrentGameState());
  startSSESubscription();
}

// ── Board Generation ─────────────────────────────────────────
function generateBoard(fc) {
  const fields = [];
  const kats = activeFragenBank.kategorien;
  const seed = Date.now();

  for (let i = 0; i < fc; i++) {
    if (i === 0) {
      fields.push({ type: 'start', label: 'Start', icon: '🏁', color: '#2a9d8f' });
    } else if (i === fc - 1) {
      fields.push({ type: 'goal', label: 'Ziel', icon: '🏆', color: '#e76f51' });
    } else {
      const kat = kats[(i - 1) % kats.length];
      fields.push({ type: 'category', kategorieId: kat.id, label: kat.name, icon: kat.icon, color: kat.farbe, bonus: null });
    }
  }

  const bonusCandidates = [];
  for (let i = 3; i < fc - 2; i++) bonusCandidates.push(i);
  shuffleArray(bonusCandidates, seed);

  const bonusDist = [
    { type: 'advance', count: 2 }, { type: 'setback', count: 2 },
    { type: 'extra',   count: 2 }, { type: 'joker',   count: 2 }, { type: 'duel', count: 2 }
  ];
  let idx = 0;
  for (const bd of bonusDist) {
    for (let c = 0; c < bd.count && idx < bonusCandidates.length; c++) {
      fields[bonusCandidates[idx]].bonus = bd.type; idx++;
    }
  }

  for (let i = 1; i < fc; i++) {
    if (fields[i].bonus === 'setback' && fields[i - 1].bonus === 'setback') {
      for (let j = 3; j < fc - 2; j++) {
        if (j !== i && j !== i - 1 && fields[j].bonus && fields[j].bonus !== 'setback' &&
            (!fields[j - 1] || fields[j - 1].bonus !== 'setback') &&
            (!fields[j + 1] || fields[j + 1].bonus !== 'setback')) {
          const tmp = fields[i].bonus; fields[i].bonus = fields[j].bonus; fields[j].bonus = tmp; break;
        }
      }
    }
  }
  return fields;
}

function shuffleArray(arr, seed) {
  let s = seed || 1;
  function rng() { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Board Rendering ──────────────────────────────────────────
function renderBoard() {
  const fc = board.length;
  const grid = document.getElementById('board-grid');
  grid.innerHTML = '';

  for (let row = 0; row < Math.ceil(fc / COLS); row++) {
    const reversed = row % 2 === 1;
    for (let col = 0; col < COLS; col++) {
      const actualCol = reversed ? (COLS - 1 - col) : col;
      const fieldIdx = row * COLS + actualCol;

      if (fieldIdx >= fc) {
        const empty = document.createElement('div'); empty.style.visibility = 'hidden'; grid.appendChild(empty); continue;
      }

      const field = board[fieldIdx];
      const div = document.createElement('div');
      div.className = 'board-field';
      div.id = 'field-' + fieldIdx;

      if (field.type === 'start') div.classList.add('start-field');
      if (field.type === 'goal') div.classList.add('goal-field');
      if (field.bonus) div.classList.add('bonus-field');
      if (field.type === 'category') { div.classList.add('cat-field'); div.style.background = field.color; }

      if (fieldIdx < fc - 1) {
        const isEvenRow = row % 2 === 0;
        if (isEvenRow) div.classList.add(col < COLS - 1 ? 'connect-right' : 'connect-down');
        else div.classList.add(col > 0 ? 'connect-left' : 'connect-down');
      }

      // Highlight landing field when active question exists
      if (qpLiveQ && !qpLiveQ.resolved && !gameOver) {
        const activeTeam = teams[currentTeamIdx];
        const landingField = Math.min(activeTeam.position + qpLiveQ.advanceAmount, fc - 1);
        if (fieldIdx === landingField) div.classList.add('next-field');
      }

      const numEl = document.createElement('div');
      numEl.className = 'field-number';
      numEl.textContent = fieldIdx;
      div.appendChild(numEl);

      if (field.bonus) {
        const bt = BONUS_TYPES.find(b => b.id === field.bonus);
        if (bt) { const badge = document.createElement('div'); badge.className = 'bonus-badge'; badge.textContent = bt.icon; div.appendChild(badge); }
      }
      const iconEl = document.createElement('div');
      iconEl.className = 'field-icon';
      iconEl.textContent = field.icon;
      div.appendChild(iconEl);

      const piecesDiv = document.createElement('div');
      piecesDiv.className = 'field-pieces';
      teams.forEach((team, ti) => {
        if (team.position === fieldIdx) {
          const p = document.createElement('div');
          p.className = 'piece'; p.style.background = team.color; p.textContent = ti + 1;
          piecesDiv.appendChild(p);
        }
      });
      div.appendChild(piecesDiv);
      grid.appendChild(div);
    }
  }
}

// ── Sidebar Rendering ────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('team-list');
  list.innerHTML = '';
  const taken = new Set(takenTeams || []);

  teams.forEach((team, i) => {
    const card = document.createElement('div');
    card.className = 'team-card' + (i === currentTeamIdx ? ' active-turn' : '');

    const isTaken = taken.has(i);
    const connDot = isTaken ? '<span class="team-conn-dot" title="Gerät verbunden">●</span>' : '';

    const piece = document.createElement('div');
    piece.className = 'team-piece'; piece.style.background = team.color; piece.textContent = i + 1;

    const info = document.createElement('div');
    info.className = 'team-info';
    info.innerHTML =
      `<div class="team-name">${connDot}${escapeHtml(team.name)}</div>` +
      `<div class="team-pos">Feld ${team.position}/${board.length - 1}</div>`;

    card.appendChild(piece);
    card.appendChild(info);

    if (team.hasJoker || team.jokerUsed) {
      const badges = document.createElement('div');
      badges.className = 'team-badges';
      const jb = document.createElement('span');
      jb.className = 'badge-joker' + (team.jokerUsed ? ' used' : '');
      jb.textContent = '🃏';
      badges.appendChild(jb);
      card.appendChild(badges);
    }

    if (isTaken) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'team-kick-btn'; kickBtn.title = 'Gerät trennen';
      kickBtn.textContent = '✕';
      kickBtn.onclick = e => { e.stopPropagation(); kickTeam(i); };
      card.appendChild(kickBtn);
    }

    list.appendChild(card);
  });

  const jokerBtn = document.getElementById('btn-joker');
  const activeTeam = teams[currentTeamIdx];
  if (activeTeam && activeTeam.hasJoker && !activeTeam.jokerUsed && !gameOver) {
    jokerBtn.style.display = 'block'; jokerBtn.disabled = false;
  } else {
    jokerBtn.style.display = 'none';
  }

  document.getElementById('round-info').textContent = 'Runde ' + round;
  renderDifficultyPicker();
  renderLegend();
}

// ── Difficulty Picker ────────────────────────────────────────
function renderDifficultyPicker() {
  const container = document.getElementById('diff-btns');
  if (!container) return;
  container.innerHTML = '';

  const avail = getAvailableDifficulties();
  const blocked = !!qpLiveQ || gameOver;

  [100, 200, 300, 400, 500].forEach(d => {
    const btn = document.createElement('button');
    btn.className = 'diff-btn diff-btn-' + d;
    btn.disabled = blocked || !avail.includes(d);
    btn.innerHTML = `<span class="diff-pts">${d}</span><span class="diff-adv">${DIFFICULTY_RANGE_LABELS[d]}</span>`;
    btn.onclick = () => teacherPicksDifficulty(d);
    container.appendChild(btn);
  });

  const allGone = avail.length === 0 && !gameOver;
  if (allGone) {
    const msg = document.createElement('div');
    msg.className = 'diff-exhausted';
    msg.textContent = '⚠ Keine Fragen mehr verfügbar';
    container.appendChild(msg);
  }
}

function teacherPicksDifficulty(difficulty) {
  if (gameOver || qpLiveQ) return;
  const q = pickQuestionByDifficulty(difficulty);
  if (!q) { renderDifficultyPicker(); return; }

  const advance = difficultyAdvance(difficulty);
  qpLiveQ = {
    id: q.id + '_' + Date.now(),
    teamIdx: currentTeamIdx,
    difficulty,
    question: q,
    advanceAmount: advance,
    resolved: false,
    correct: null,
    selectedMcIndex: null
  };

  QpStorage.save(buildCurrentGameState());
  renderDifficultyPicker();
  showQuestionModalFromState(qpLiveQ);
}

function updateTurnBanner() {
  const banner = document.getElementById('active-team-banner');
  const team = teams[currentTeamIdx];
  if (!team) return;
  banner.style.background = team.color;
  banner.style.color = '#fff';
  banner.textContent = team.name + ' ist dran!';
}

// ── Question Modal ───────────────────────────────────────────
function showQuestionModalFromState(lq) {
  showQuestionModal(lq.question, lq);
}

function showQuestionModal(question, lq) {
  const modal = document.getElementById('question-modal');
  const kat = activeFragenBank ? activeFragenBank.kategorien.find(k => k.id === question.kategorie) : null;

  document.getElementById('q-cat-icon').textContent = kat ? kat.icon : '❓';
  document.getElementById('q-cat-name').textContent = kat ? kat.name : '';

  const advance = lq ? lq.advanceAmount : 1;
  const diff = lq ? lq.difficulty : question.difficulty;
  document.getElementById('q-difficulty').textContent =
    `${diff || '?'} Pkt. · ${advance} Feld${advance !== 1 ? 'er' : ''} bei ✓`;

  document.getElementById('q-text').textContent = question.frage;

  const hintEl = document.getElementById('q-hint');
  if (question.erklaerung && question.typ === 'offen') {
    hintEl.textContent = ''; hintEl.style.display = 'none';
  } else {
    hintEl.style.display = 'none';
  }

  const resultEl = document.getElementById('q-result');
  resultEl.className = 'modal-result'; resultEl.textContent = '';

  const explEl = document.getElementById('q-explanation');
  explEl.classList.remove('visible');
  document.getElementById('q-explanation-text').textContent = question.erklaerung || '';
  document.getElementById('q-continue').classList.remove('visible');

  const optionsDiv = document.getElementById('q-options');
  const openDiv = document.getElementById('q-open-actions');
  optionsDiv.innerHTML = ''; optionsDiv.style.display = 'none'; openDiv.style.display = 'none';

  pendingQuestionResult = { question, lq, resolved: false };

  if (question.typ === 'offen') {
    openDiv.style.display = 'flex';
  } else {
    optionsDiv.style.display = 'flex';
    const isMulti = Array.isArray(question.correctIndices) && question.correctIndices.length > 0;
    if (!isMulti) {
      question.antworten.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn'; btn.textContent = ans;
        btn.onclick = () => selectAnswer(btn, i, question);
        optionsDiv.appendChild(btn);
      });
    } else {
      const pending = new Set();
      const allBtns = [];
      question.antworten.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn'; btn.textContent = ans;
        btn.addEventListener('click', () => {
          if (pendingQuestionResult && pendingQuestionResult.resolved) return;
          if (pending.has(i)) { pending.delete(i); btn.classList.remove('mc-selected-pending'); }
          else { pending.add(i); btn.classList.add('mc-selected-pending'); }
        });
        allBtns.push(btn); optionsDiv.appendChild(btn);
      });
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'answer-btn mc-confirm-btn'; confirmBtn.textContent = '✓ Bestätigen';
      confirmBtn.addEventListener('click', () => {
        if (pendingQuestionResult && pendingQuestionResult.resolved) return;
        const sel = [...pending];
        const ok = isMcCorrect(question, sel);
        const cs = correctSet(question);
        allBtns.forEach(b => b.classList.add('disabled'));
        confirmBtn.classList.add('disabled');
        allBtns.forEach((b, i) => { if (cs.has(i)) b.classList.add('correct'); else if (pending.has(i)) b.classList.add('wrong'); });
        resolveQuestion(ok);
      });
      optionsDiv.appendChild(confirmBtn);
    }
  }

  modal.classList.add('open');
}

function selectAnswer(btn, selectedIdx, question) {
  if (pendingQuestionResult && pendingQuestionResult.resolved) return;
  const correct = selectedIdx === question.richtig;
  const allBtns = document.querySelectorAll('#q-options .answer-btn');
  const cs = correctSet(question);
  allBtns.forEach(b => b.classList.add('disabled'));
  btn.classList.add(correct ? 'correct' : 'wrong');
  allBtns.forEach((b, i) => { if (cs.has(i)) b.classList.add('correct'); });
  resolveQuestion(correct, selectedIdx);
}

function resolveOpen(correct) {
  if (pendingQuestionResult && pendingQuestionResult.isDuel) {
    document.getElementById('q-open-actions').style.display = 'none';
    resolveDuelAnswer(correct); return;
  }
  document.getElementById('q-open-actions').style.display = 'none';
  resolveQuestion(correct);
}

function resolveQuestion(correct, selectedMcIndex) {
  if (!pendingQuestionResult || pendingQuestionResult.resolved) return;
  pendingQuestionResult.resolved = true;
  pendingQuestionResult.correct = correct;

  const team = teams[currentTeamIdx];
  const resultEl = document.getElementById('q-result');
  if (correct) { team.correctCount++; resultEl.textContent = '✓ Richtig!'; resultEl.className = 'modal-result visible correct-result'; }
  else { team.wrongCount++; resultEl.textContent = '✗ Falsch!'; resultEl.className = 'modal-result visible wrong-result'; }

  const explEl = document.getElementById('q-explanation');
  if (pendingQuestionResult.question.erklaerung) explEl.classList.add('visible');
  document.getElementById('q-continue').classList.add('visible');

  if (qpLiveQ) {
    qpLiveQ.resolved = true;
    qpLiveQ.correct = correct;
    if (selectedMcIndex !== undefined) qpLiveQ.selectedMcIndex = selectedMcIndex;
  }
  QpStorage.save(buildCurrentGameState());
}

function continueAfterQuestion() {
  if (pendingQuestionResult && pendingQuestionResult.isDuel) {
    document.getElementById('question-modal').classList.remove('open');
    const winner = pendingQuestionResult.duelWinner;
    pendingQuestionResult = null;
    qpLiveQ = null; // Duell beendet → Views schließen das Overlay (nextTurn/showWinner speichern)
    if (winner !== null && winner !== undefined) {
      const newPos = Math.min(teams[winner].position + 1, board.length - 1);
      teams[winner].position = newPos;
      renderBoard(); renderSidebar();
      if (newPos >= board.length - 1) { setTimeout(() => showWinner(winner), 600); return; }
    }
    nextTurn(); return;
  }

  document.getElementById('question-modal').classList.remove('open');
  if (!pendingQuestionResult) { nextTurn(); return; }

  const correct = pendingQuestionResult.correct;
  const advance = qpLiveQ ? qpLiveQ.advanceAmount : 1;
  const team = teams[currentTeamIdx];

  if (correct) {
    const nextPos = Math.min(team.position + advance, board.length - 1);
    moveTeam(currentTeamIdx, nextPos);
  } else {
    nextTurn();
  }
}

// ── Movement ─────────────────────────────────────────────────
function moveTeam(teamIdx, newPos) {
  teams[teamIdx].position = newPos;
  renderBoard(); renderSidebar();

  qpLiveQ = null;
  QpStorage.save(buildCurrentGameState());

  if (newPos >= board.length - 1) {
    setTimeout(() => showWinner(teamIdx), 600); return;
  }

  const field = board[newPos];
  if (field.bonus) {
    pendingBonus = { type: field.bonus, teamIdx };
    setTimeout(() => showBonusModal(field.bonus, teamIdx), 400);
  } else {
    nextTurn();
  }
}

// ── Bonus Fields ─────────────────────────────────────────────
function showBonusModal(bonusType, teamIdx) {
  const bt = BONUS_TYPES.find(b => b.id === bonusType);
  if (!bt) { nextTurn(); return; }
  const team = teams[teamIdx];

  document.getElementById('bonus-icon').textContent = bt.icon;
  document.getElementById('bonus-title').textContent = bt.name;
  document.getElementById('bonus-desc').textContent = bt.desc;

  const duelDiv = document.getElementById('duel-teams');
  duelDiv.innerHTML = ''; duelDiv.style.display = 'none'; duelOpponentIdx = null;

  if (bonusType === 'duel' && teams.length > 1) {
    duelDiv.style.display = 'flex';
    document.getElementById('bonus-desc').textContent = team.name + ' fordert ein Team zum Duell! Wer gewinnt, rückt 1 Feld vor.';
    teams.forEach((t, i) => {
      if (i === teamIdx) return;
      const btn = document.createElement('div');
      btn.className = 'duel-team'; btn.textContent = t.name; btn.style.borderColor = t.color;
      btn.onclick = () => { duelDiv.querySelectorAll('.duel-team').forEach(d => d.classList.remove('selected')); btn.classList.add('selected'); duelOpponentIdx = i; };
      duelDiv.appendChild(btn);
    });
  }
  document.getElementById('bonus-modal').classList.add('open');
}

function continueAfterBonus() {
  document.getElementById('bonus-modal').classList.remove('open');
  if (!pendingBonus) { nextTurn(); return; }

  const { type, teamIdx } = pendingBonus;
  const team = teams[teamIdx];
  pendingBonus = null;

  switch (type) {
    case 'advance': { const newPos = Math.min(team.position + 2, board.length - 1); moveTeam(teamIdx, newPos); return; }
    case 'setback': { const newPos = Math.max(team.position - 2, 0); team.position = newPos; renderBoard(); renderSidebar(); nextTurn(); return; }
    case 'extra': { renderBoard(); renderSidebar(); updateTurnBanner(); return; }
    case 'joker': { if (!team.jokerUsed) team.hasJoker = true; renderSidebar(); nextTurn(); return; }
    case 'duel': { if (duelOpponentIdx !== null) startDuel(teamIdx, duelOpponentIdx); else nextTurn(); return; }
  }
  nextTurn();
}

function startDuel(team1Idx, team2Idx) {
  const avail = getAvailableDifficulties();
  if (!avail.length) { nextTurn(); return; }
  const randomDiff = avail[Math.floor(Math.random() * avail.length)];
  const question = pickQuestionByDifficulty(randomDiff);
  if (!question) { nextTurn(); return; }

  const field = board[teams[team1Idx].position];
  pendingQuestionResult = { question, field, resolved: false, isDuel: true, team1Idx, team2Idx, duelPhase: 1 };

  // Duell für Schüler-/Tafelansichten publizieren (read-only: teamIdx -1 →
  // kein Gerät ist "dran") und die gezogene Frage sofort persistieren —
  // sonst zeigen die Views "Warte auf Frage…" und ein Reload vergisst die
  // verbrauchte Frage
  qpLiveQ = {
    id: 'duel-' + Date.now(),
    teamIdx: -1,
    question,
    difficulty: question.difficulty,
    advanceAmount: 1,
    isDuel: true,
    resolved: false, correct: null, selectedMcIndex: null
  };
  QpStorage.save(buildCurrentGameState());

  showDuelQuestion(question, team1Idx, team2Idx, 1);
}

function showDuelQuestion(question, team1Idx, team2Idx, phase) {
  const modal = document.getElementById('question-modal');
  const team = teams[phase === 1 ? team1Idx : team2Idx];

  document.getElementById('q-cat-icon').textContent = '⚔️';
  document.getElementById('q-cat-name').textContent = 'Duell: ' + team.name;
  document.getElementById('q-difficulty').textContent = (question.difficulty || '?') + ' Pkt.';
  document.getElementById('q-text').textContent = question.frage;
  document.getElementById('q-hint').style.display = 'none';

  const resultEl = document.getElementById('q-result');
  resultEl.className = 'modal-result'; resultEl.textContent = '';
  document.getElementById('q-explanation').classList.remove('visible');
  document.getElementById('q-explanation-text').textContent = question.erklaerung || '';
  document.getElementById('q-continue').classList.remove('visible');

  const optionsDiv = document.getElementById('q-options');
  const openDiv = document.getElementById('q-open-actions');
  optionsDiv.innerHTML = ''; optionsDiv.style.display = 'none'; openDiv.style.display = 'none';

  if (question.typ === 'offen') {
    openDiv.style.display = 'flex';
  } else {
    optionsDiv.style.display = 'flex';
    question.antworten.forEach((ans, i) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn'; btn.textContent = ans;
      btn.onclick = () => {
        if (pendingQuestionResult && pendingQuestionResult.resolved) return;
        const correct = i === question.richtig;
        const allBtns = document.querySelectorAll('#q-options .answer-btn');
        const cs = correctSet(question);
        allBtns.forEach(b => b.classList.add('disabled'));
        btn.classList.add(correct ? 'correct' : 'wrong');
        allBtns.forEach((b, j) => { if (cs.has(j)) b.classList.add('correct'); });
        resolveDuelAnswer(correct);
      };
      optionsDiv.appendChild(btn);
    });
  }
  modal.classList.add('open');
}

function resolveDuelAnswer(correct) {
  if (!pendingQuestionResult || !pendingQuestionResult.isDuel) return;
  const pr = pendingQuestionResult;
  const currentDuelTeam = pr.duelPhase === 1 ? pr.team1Idx : pr.team2Idx;
  const resultEl = document.getElementById('q-result');

  if (correct) {
    pr.resolved = true;
    resultEl.textContent = '✓ ' + teams[currentDuelTeam].name + ' gewinnt das Duell!';
    resultEl.className = 'modal-result visible correct-result';
    if (pr.question.erklaerung) document.getElementById('q-explanation').classList.add('visible');
    pr.duelWinner = currentDuelTeam;
    document.getElementById('q-continue').classList.add('visible');
  } else {
    if (pr.duelPhase === 1) {
      resultEl.textContent = '✗ Falsch! ' + teams[pr.team2Idx].name + ' darf antworten…';
      resultEl.className = 'modal-result visible wrong-result';
      pr.duelPhase = 2;
      setTimeout(() => {
        document.getElementById('question-modal').classList.remove('open');
        setTimeout(() => showDuelQuestion(pr.question, pr.team1Idx, pr.team2Idx, 2), 300);
      }, 1500);
    } else {
      pr.resolved = true;
      resultEl.textContent = '✗ Beide Teams falsch!';
      resultEl.className = 'modal-result visible wrong-result';
      if (pr.question.erklaerung) document.getElementById('q-explanation').classList.add('visible');
      pr.duelWinner = null;
      document.getElementById('q-continue').classList.add('visible');
    }
  }
}

// ── Joker ────────────────────────────────────────────────────
function useJoker() {
  const team = teams[currentTeamIdx];
  if (!team.hasJoker || team.jokerUsed || qpLiveQ) return;
  team.jokerUsed = true; team.hasJoker = false;
  const nextPos = Math.min(team.position + 1, board.length - 1);
  moveTeam(currentTeamIdx, nextPos);
}

// ── Turn Management ──────────────────────────────────────────
function nextTurn() {
  if (gameOver) return;
  pendingQuestionResult = null;
  currentTeamIdx = (currentTeamIdx + 1) % teams.length;
  if (currentTeamIdx === 0) round++;
  renderBoard(); renderSidebar(); updateTurnBanner();
  qpLiveQ = null;
  QpStorage.save(buildCurrentGameState());

  // Check if all questions exhausted
  if (getAvailableDifficulties().length === 0) {
    setTimeout(() => {
      if (!gameOver) {
        const winner = teams.reduce((best, t, i) => t.position > teams[best].position ? i : best, 0);
        showWinner(winner);
      }
    }, 500);
  }
}

// ── takenTeams Management ────────────────────────────────────
async function kickTeam(teamId) {
  if (!takenTeams) return;
  // Compare-and-Swap statt Ganzstand-Save: revertiert keine parallel
  // laufenden Züge (Server mergt bei Konflikt und retryt)
  const result = await QpStorage.mutate(QpStorage.getCode(), (draft) => {
    draft.takenTeams = (draft.takenTeams || []).filter(id => id !== teamId);
  });
  if (result) takenTeams = result.takenTeams || [];
  else takenTeams = takenTeams.filter(id => id !== teamId);
  renderSidebar();
}
window.kickTeam = kickTeam;

// ── Legend ───────────────────────────────────────────────────
function renderLegend() {
  const list = document.getElementById('legend-list');
  if (!list || !activeFragenBank) return;
  list.innerHTML = '';
  activeFragenBank.kategorien.forEach(kat => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = '<div class="legend-color" style="background:' + kat.farbe + ';"></div><span class="legend-name">' + kat.icon + ' ' + escapeHtml(kat.name) + '</span>';
    list.appendChild(item);
  });
  BONUS_TYPES.forEach(bt => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = '<div class="legend-color" style="background:var(--bg-field);text-align:center;font-size:0.7rem;line-height:16px;">' + bt.icon + '</div><span class="legend-name">' + bt.name + '</span>';
    list.appendChild(item);
  });
}

// ── Winner Screen ────────────────────────────────────────────
function showWinner(teamIdx) {
  gameOver = true;
  const team = teams[teamIdx];
  document.getElementById('winner-team-name').textContent = team.name;
  document.getElementById('winner-team-name').style.color = team.color;

  const statsDiv = document.getElementById('winner-stats');
  statsDiv.innerHTML = '';
  [{ value: round, label: 'Runden' }, { value: team.correctCount, label: 'Richtige' }, { value: team.wrongCount, label: 'Falsche' }].forEach(s => {
    const div = document.createElement('div');
    div.className = 'winner-stat';
    div.innerHTML = '<div class="winner-stat-value">' + s.value + '</div><div class="winner-stat-label">' + s.label + '</div>';
    statsDiv.appendChild(div);
  });

  const sorted = [...teams].sort((a, b) => b.position - a.position);
  sorted.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'winner-stat';
    div.innerHTML = '<div class="winner-stat-value" style="color:' + t.color + '">' + (i + 1) + '.</div>' +
                    '<div class="winner-stat-label">' + escapeHtml(t.name) + ' (Feld ' + t.position + ')</div>';
    statsDiv.appendChild(div);
  });

  showScreen('winner-screen');
  spawnConfetti();
  QpStorage.save(buildCurrentGameState());
}

function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  const colors = ['#e74c3c','#3498db','#2ecc71','#f4a261','#9b59b6','#e76f51','#f39c12','#1abc9c'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDuration = (2 + Math.random() * 3) + 's';
    c.style.animationDelay = Math.random() * 2 + 's';
    c.style.width = (6 + Math.random() * 8) + 'px';
    c.style.height = (6 + Math.random() * 8) + 'px';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(c);
  }
}

// ── Screen Management ────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function resetToSetup() { resetToSelector(); }

function confirmQuit() {
  if (confirm('Spiel wirklich beenden?')) resetToSelector();
}
