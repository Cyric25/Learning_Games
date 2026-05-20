/* quizpfad.js – Spiellogik */

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
    if (this._serverOk !== null) return this._serverOk;
    if (window.location.protocol === 'file:') { this._serverOk = false; return false; }
    try {
      await fetch('../api.php?f=qp-game&code=PING', {method:'HEAD', signal:AbortSignal.timeout(2000)});
      this._serverOk = true;
    } catch { this._serverOk = false; }
    return this._serverOk;
  },
  _ser(gs)  { return {...gs, usedQuestionIds: [...(gs.usedQuestionIds instanceof Set ? gs.usedQuestionIds : (gs.usedQuestionIds||[]))]};},
  _deser(d) { return {...d, usedQuestionIds: new Set(d.usedQuestionIds||[])};},
  async save(gs) {
    if (!this._code) return;
    const json = JSON.stringify(this._ser(gs));
    localStorage.setItem('qp_gs_'+this._code, json);
    if (await this.checkServer())
      try { await fetch('../api.php?f=qp-game&code='+this._code, {method:'POST', body:json, headers:{'Content-Type':'application/json'}}); } catch {}
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
      try { await fetch('../api.php?f=qp-game&code='+code, {method:'DELETE'}); } catch {}
  },
  subscribe(code, cb) {
    code = code.toUpperCase();
    let stopped = false, src = null, timer = null;
    const startSSE = () => {
      if (stopped) return;
      src = new EventSource('../api.php?f=qp-sse&code='+code);
      src.onmessage = e => { if(stopped) return; try { const d=JSON.parse(e.data); if(d&&d.meta) cb(this._deser(d)); } catch {} };
      src.addEventListener('reconnect', () => { src&&src.close(); src=null; if(!stopped) setTimeout(startSSE,500); });
      src.onerror = () => { src&&src.close(); src=null; if(!stopped) startPoll(); };
    };
    const startPoll = () => {
      if(stopped||timer) return;
      const fn = async () => { if(stopped) return; try { const r=await fetch('../api.php?f=qp-game&code='+code); if(r.ok){const d=await r.json();if(d&&d.meta)cb(this._deser(d));} } catch {} };
      fn(); timer = setInterval(fn, 1000);
    };
    const startLocalPoll = () => {
      if(stopped||timer) return; let last='';
      timer = setInterval(() => { if(stopped) return; const s=localStorage.getItem('qp_gs_'+code); if(s&&s!==last){last=s;try{const d=JSON.parse(s);if(d&&d.meta)cb(this._deser(d));}catch{}} }, 500);
    };
    (async () => { if (await this.checkServer()) startSSE(); else startLocalPoll(); })();
    return { unsubscribe() { stopped=true; src&&src.close(); timer&&clearInterval(timer); } };
  }
};

// ── Multi-Correct Helpers ────────────────────────────────────
function isMcCorrect(q, selectedArr) {
  const correct = (Array.isArray(q.correctIndices) && q.correctIndices.length > 0)
    ? [...q.correctIndices].sort((a,b)=>a-b) : [q.correctIndex ?? 0];
  const sel = [...selectedArr].sort((a,b)=>a-b);
  return correct.length === sel.length && correct.every((v,i) => v === sel[i]);
}
function correctSet(q) {
  return new Set((Array.isArray(q.correctIndices) && q.correctIndices.length > 0)
    ? q.correctIndices : [q.correctIndex ?? 0]);
}

// ── Constants ────────────────────────────────────────────────
const FIELD_COUNT = 30;
const COLS = 6;
// Colorblind-safe team colors (distinguishable with deuteranopia/protanopia)
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

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadFragen();
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) await _gsEnter(urlCode.toUpperCase());
  else showGameSelector();
});

async function loadFragen() {
  // Shared question database (Risiko-Quiz format → QuizPfad format)
  let rqData = null;

  try {
    if (window.location.protocol !== 'file:') {
      try {
        const r = await fetch('../api.php?f=questions');
        if (r.ok) { const d = await r.json(); if (d.categories && d.categories.length) rqData = d; }
      } catch (e) { /* fallback */ }
    }
    if (!rqData) {
      try {
        const r = await fetch('../data/questions.json');
        if (r.ok) { const d = await r.json(); if (d.categories && d.categories.length) rqData = d; }
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  // localStorage fallback (Risiko-Quiz format)
  if (!rqData) {
    const ls = localStorage.getItem('rq_questions');
    if (ls) try { const d = JSON.parse(ls); if (d.categories && d.categories.length) rqData = d; } catch(e) {}
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
    teams, board, currentTeamIdx, round, usedQuestionIds,
    activeCategoryIds: [...selectedCategoryIds],
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
  board = []; teams = []; usedQuestionIds = new Set(); gameOver = false; qpLiveQ = null;
  await QpStorage.save({
    meta: { gameCode: code, title: 'QuizPfad', createdAt: gameCreatedAt },
    phase: 'setup', teams: [], board: [], currentTeamIdx: 0, round: 1,
    usedQuestionIds: new Set(), activeCategoryIds: [], liveQuestion: null
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
    currentTeamIdx = gs.currentTeamIdx || 0;
    round = gs.round || 1;
    gameOver = false;
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
  b.innerHTML = '<span>📱 Schüler:</span><strong class="code-val" style="font-size:1.2rem;letter-spacing:2px">'+code+'</strong><a href="view.html?code='+code+'" target="_blank" style="color:var(--accent);font-size:.8rem;text-decoration:none">Link ↗</a>';
  document.body.appendChild(b);
}

function resetToSelector() {
  QpStorage.setCode(null);
  window.history.replaceState({}, '', 'index.html');
  const banner = document.getElementById('code-banner'); if (banner) banner.remove();
  showGameSelector();
}

// Convert Risiko-Quiz format → QuizPfad format
function convertRQtoQuizPfad(rqData) {
  const kategorien = [];
  const fragen = [];
  // Colorblind-safe category colors (Tol's qualitative palette)
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
        kategorien.push({
          id: katId,
          name: katName,
          icon: parentIcon || '📚',
          farbe: colors[colorIdx++ % colors.length]
        });
      }

      node.questions.forEach(q => {
        const schwierigkeit = q.difficulty <= 200 ? 'leicht' : q.difficulty <= 300 ? 'mittel' : 'schwer';
        let typ, antworten, richtig;

        let correctIndices = null;
        if (q.type === 'mc' && q.options && q.options.length > 0) {
          typ = 'multiple_choice';
          antworten = q.options.slice();
          richtig = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
          if (Array.isArray(q.correctIndices) && q.correctIndices.length > 0) {
            correctIndices = q.correctIndices.slice();
          }
        } else {
          typ = 'offen';
          antworten = [];
          richtig = -1;
        }

        const frageObj = {
          id: q.id,
          kategorie: katId,
          schwierigkeit: schwierigkeit,
          frage: q.question || '',
          typ: typ,
          antworten: antworten,
          richtig: richtig,
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
    // If top-level category has no subcategories, treat it as a leaf
    if ((!cat.subcategories || cat.subcategories.length === 0) && cat.questions && cat.questions.length > 0) {
      collectLeafCategories(cat, [cat.name], icon);
    } else {
      (cat.subcategories || []).forEach(sub => {
        collectLeafCategories(sub, [cat.name, sub.name], icon);
      });
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

  // Select all by default
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
      '<span class="cat-select-name">' + kat.name + '</span>' +
      '<span class="cat-select-count">' + qCount + ' Fragen</span>' +
      '<div class="cat-select-check">✓</div>';
    item.onclick = () => {
      if (selectedCategoryIds.has(kat.id)) {
        selectedCategoryIds.delete(kat.id);
        item.classList.remove('selected');
      } else {
        selectedCategoryIds.add(kat.id);
        item.classList.add('selected');
      }
      updateCatSelectInfo();
    };
    list.appendChild(item);
  });

  updateCatSelectInfo();
}

function toggleAllCategories(selectAll) {
  const items = document.querySelectorAll('.cat-select-item');
  selectedCategoryIds.clear();
  items.forEach(item => {
    if (selectAll) {
      selectedCategoryIds.add(item.dataset.catId);
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
  updateCatSelectInfo();
}

function updateCatSelectInfo() {
  const el = document.getElementById('cat-select-info');
  if (!el) return;
  const total = fragenBank.kategorien.length;
  const selected = selectedCategoryIds.size;
  const qCount = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie)).length;
  const ok = qCount >= 10;
  const btn = document.getElementById('btn-start');

  if (selected === 0 || qCount === 0) {
    el.className = 'cat-select-info warning';
    el.textContent = 'Keine Kategorie ausgewählt!';
    if (btn) btn.disabled = true;
    return;
  }

  if (ok) {
    el.className = 'cat-select-info';
    el.textContent = '✅ ' + selected + ' von ' + total + ' Kategorien gewählt (' + qCount + ' Fragen)';
  } else {
    el.className = 'cat-select-info warning';
    el.textContent = '❌ ' + selected + ' Kategorien gewählt, aber nur ' + qCount + ' Fragen – mindestens 10 benötigt.';
  }
  if (btn) btn.disabled = !ok;
}

// ── Setup Screen ─────────────────────────────────────────────
function renderTeamCountSelector(selected) {
  const row = document.getElementById('team-count-row');
  row.innerHTML = '';
  for (let i = 1; i <= 8; i++) {
    const btn = document.createElement('button');
    btn.className = 'team-count-btn' + (i === selected ? ' selected' : '');
    btn.textContent = i;
    btn.onclick = () => {
      renderTeamCountSelector(i);
      renderTeamConfig(i);
    };
    row.appendChild(btn);
  }
  renderTeamConfig(selected);
}

function renderTeamConfig(count) {
  const list = document.getElementById('team-config-list');
  // Preserve existing names/colors
  const existing = [];
  list.querySelectorAll('.team-config-row').forEach((row, i) => {
    existing.push({
      name: row.querySelector('input[type="text"]').value,
      color: row.querySelector('input[type="color"]').value
    });
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
    document.getElementById('setup-error').textContent = 'Keine Fragen geladen!';
    return;
  }

  if (selectedCategoryIds.size === 0) {
    document.getElementById('setup-error').textContent = 'Bitte mindestens eine Kategorie auswählen!';
    return;
  }

  // Filter fragenBank to selected categories
  activeFragenBank = {
    kategorien: fragenBank.kategorien.filter(k => selectedCategoryIds.has(k.id)),
    fragen: fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie))
  };

  if (activeFragenBank.fragen.length < 10) {
    document.getElementById('setup-error').textContent = 'Mindestens 10 Fragen benötigt – bitte mehr Kategorien auswählen.';
    updateCatSelectInfo();
    return;
  }

  // Build teams
  teams = [];
  document.querySelectorAll('.team-config-row').forEach((row, i) => {
    teams.push({
      name: row.querySelector('input[type="text"]').value || ('Team ' + (i + 1)),
      color: row.querySelector('input[type="color"]').value,
      position: 0, // field index (0 = Start)
      correctCount: 0,
      wrongCount: 0,
      hasJoker: false,
      jokerUsed: false
    });
  });

  if (teams.length === 0) return;

  // Build board
  board = generateBoard();
  currentTeamIdx = 0;
  round = 1;
  gameOver = false;
  usedQuestionIds.clear();
  duelOpponentIdx = null;

  showScreen('game-screen');
  renderBoard();
  renderSidebar();
  updateTurnBanner();

  qpLiveQ = null;
  if (!gameCreatedAt) gameCreatedAt = new Date().toISOString();
  QpStorage.save(buildCurrentGameState());
}

// ── Board Generation ─────────────────────────────────────────
function generateBoard() {
  const fields = [];
  const kats = activeFragenBank.kategorien;
  const seed = Date.now();

  // Assign categories cyclically
  for (let i = 0; i < FIELD_COUNT; i++) {
    if (i === 0) {
      fields.push({ type: 'start', label: 'Start', icon: '🏁', color: '#2a9d8f' });
    } else if (i === FIELD_COUNT - 1) {
      fields.push({ type: 'goal', label: 'Ziel', icon: '🏆', color: '#e76f51' });
    } else {
      const kat = kats[(i - 1) % kats.length];
      fields.push({
        type: 'category',
        kategorieId: kat.id,
        label: kat.name,
        icon: kat.icon,
        color: kat.farbe,
        bonus: null
      });
    }
  }

  // Distribute bonus fields (not on start, goal, or first 2 fields)
  const bonusCandidates = [];
  for (let i = 3; i < FIELD_COUNT - 2; i++) bonusCandidates.push(i);
  shuffleArray(bonusCandidates, seed);

  const bonusDist = [
    { type: 'advance', count: 2 },
    { type: 'setback', count: 2 },
    { type: 'extra',   count: 2 },
    { type: 'joker',   count: 2 },
    { type: 'duel',    count: 2 }
  ];

  let idx = 0;
  for (const bd of bonusDist) {
    for (let c = 0; c < bd.count && idx < bonusCandidates.length; c++) {
      fields[bonusCandidates[idx]].bonus = bd.type;
      idx++;
    }
  }

  // Ensure no consecutive setback fields (swap with a non-setback bonus)
  for (let i = 1; i < FIELD_COUNT; i++) {
    if (fields[i].bonus === 'setback' && fields[i - 1].bonus === 'setback') {
      // Find a non-setback bonus field to swap with
      for (let j = 3; j < FIELD_COUNT - 2; j++) {
        if (j !== i && j !== i - 1 && fields[j].bonus && fields[j].bonus !== 'setback' &&
            (!fields[j - 1] || fields[j - 1].bonus !== 'setback') &&
            (!fields[j + 1] || fields[j + 1].bonus !== 'setback')) {
          const tmp = fields[i].bonus;
          fields[i].bonus = fields[j].bonus;
          fields[j].bonus = tmp;
          break;
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
  const grid = document.getElementById('board-grid');
  grid.innerHTML = '';

  for (let row = 0; row < Math.ceil(FIELD_COUNT / COLS); row++) {
    const reversed = row % 2 === 1;
    for (let col = 0; col < COLS; col++) {
      const actualCol = reversed ? (COLS - 1 - col) : col;
      const fieldIdx = row * COLS + actualCol;

      if (fieldIdx >= FIELD_COUNT) {
        // Empty placeholder
        const empty = document.createElement('div');
        empty.style.visibility = 'hidden';
        grid.appendChild(empty);
        continue;
      }

      const field = board[fieldIdx];
      const div = document.createElement('div');
      div.className = 'board-field';
      div.id = 'field-' + fieldIdx;

      if (field.type === 'start') div.classList.add('start-field');
      if (field.type === 'goal') div.classList.add('goal-field');
      if (field.bonus) div.classList.add('bonus-field');

      // Category fields get solid background color
      if (field.type === 'category') {
        div.classList.add('cat-field');
        div.style.background = field.color;
      }

      // Path connector to next field
      if (fieldIdx < FIELD_COUNT - 1) {
        const isEvenRow = row % 2 === 0;
        if (isEvenRow) {
          div.classList.add(col < COLS - 1 ? 'connect-right' : 'connect-down');
        } else {
          div.classList.add(col > 0 ? 'connect-left' : 'connect-down');
        }
      }

      // Highlight next 2 fields for active team
      const activeTeam = teams[currentTeamIdx];
      if (activeTeam && !gameOver &&
          (fieldIdx === activeTeam.position + 1 || fieldIdx === activeTeam.position + 2) &&
          fieldIdx < FIELD_COUNT) {
        div.classList.add('next-field');
      }

      // Field number
      const numEl = document.createElement('div');
      numEl.className = 'field-number';
      numEl.textContent = fieldIdx;
      div.appendChild(numEl);

      // Icon or bonus symbol (large)
      if (field.bonus) {
        const bt = BONUS_TYPES.find(b => b.id === field.bonus);
        if (bt) {
          const badge = document.createElement('div');
          badge.className = 'bonus-badge';
          badge.textContent = bt.icon;
          div.appendChild(badge);
        }
      }

      const iconEl = document.createElement('div');
      iconEl.className = 'field-icon';
      iconEl.textContent = field.icon;
      div.appendChild(iconEl);

      // Team pieces
      const piecesDiv = document.createElement('div');
      piecesDiv.className = 'field-pieces';
      teams.forEach((team, ti) => {
        if (team.position === fieldIdx) {
          const p = document.createElement('div');
          p.className = 'piece';
          p.style.background = team.color;
          p.textContent = ti + 1;
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
  teams.forEach((team, i) => {
    const card = document.createElement('div');
    card.className = 'team-card' + (i === currentTeamIdx ? ' active-turn' : '');

    const piece = document.createElement('div');
    piece.className = 'team-piece';
    piece.style.background = team.color;
    piece.textContent = i + 1;

    const info = document.createElement('div');
    info.className = 'team-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'team-name';
    nameEl.textContent = team.name;

    const posEl = document.createElement('div');
    posEl.className = 'team-pos';
    posEl.textContent = 'Feld ' + team.position + '/' + (FIELD_COUNT - 1);

    info.appendChild(nameEl);
    info.appendChild(posEl);

    card.appendChild(piece);
    card.appendChild(info);

    // Joker badge
    if (team.hasJoker || team.jokerUsed) {
      const badges = document.createElement('div');
      badges.className = 'team-badges';
      const jb = document.createElement('span');
      jb.className = 'badge-joker' + (team.jokerUsed ? ' used' : '');
      jb.textContent = '🃏';
      badges.appendChild(jb);
      card.appendChild(badges);
    }

    list.appendChild(card);
  });

  // Joker button visibility
  const jokerBtn = document.getElementById('btn-joker');
  const activeTeam = teams[currentTeamIdx];
  if (activeTeam && activeTeam.hasJoker && !activeTeam.jokerUsed && !gameOver) {
    jokerBtn.style.display = 'block';
    jokerBtn.disabled = false;
  } else {
    jokerBtn.style.display = 'none';
  }

  document.getElementById('round-info').textContent = 'Runde ' + round;

  // Render legend
  renderLegend();
}

function renderLegend() {
  const list = document.getElementById('legend-list');
  if (!list || !activeFragenBank) return;
  list.innerHTML = '';

  activeFragenBank.kategorien.forEach(kat => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML =
      '<div class="legend-color" style="background:' + kat.farbe + ';"></div>' +
      '<span class="legend-name">' + kat.icon + ' ' + kat.name + '</span>';
    list.appendChild(item);
  });

  // Bonus legend
  BONUS_TYPES.forEach(bt => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML =
      '<div class="legend-color" style="background:var(--bg-field);text-align:center;font-size:0.7rem;line-height:16px;">' + bt.icon + '</div>' +
      '<span class="legend-name">' + bt.name + '</span>';
    list.appendChild(item);
  });
}

function updateTurnBanner() {
  const banner = document.getElementById('active-team-banner');
  const team = teams[currentTeamIdx];
  banner.style.background = team.color;
  banner.style.color = '#fff';
  banner.textContent = team.name + ' ist dran!';
}

// ── Question Logic ───────────────────────────────────────────
function askQuestion() {
  if (gameOver) return;

  const team = teams[currentTeamIdx];
  const nextPos = Math.min(team.position + 1, FIELD_COUNT - 1);
  const field = board[nextPos];

  // Get a question for this category
  const question = pickQuestion(field.kategorieId);
  if (!question) {
    // No questions left for this category — skip and move
    moveTeam(currentTeamIdx, nextPos);
    return;
  }

  showQuestionModal(question, field);
}

function pickQuestion(kategorieId) {
  if (!activeFragenBank || !activeFragenBank.fragen) return null;

  // Filter by category, exclude already used (no question appears twice in a game)
  let pool = activeFragenBank.fragen.filter(
    q => q.kategorie === kategorieId && !usedQuestionIds.has(q.id)
  );

  // If category is exhausted, try any other category that still has questions
  if (pool.length === 0) {
    pool = activeFragenBank.fragen.filter(q => !usedQuestionIds.has(q.id));
  }

  if (pool.length === 0) return null;

  // Random pick
  const idx = Math.floor(Math.random() * pool.length);
  const q = pool[idx];
  usedQuestionIds.add(q.id);
  return q;
}

function showQuestionModal(question, field) {
  const modal = document.getElementById('question-modal');
  const kat = activeFragenBank.kategorien.find(k => k.id === question.kategorie);

  document.getElementById('q-cat-icon').textContent = kat ? kat.icon : '❓';
  document.getElementById('q-cat-name').textContent = kat ? kat.name : '';
  document.getElementById('q-difficulty').textContent = question.schwierigkeit;
  document.getElementById('q-text').textContent = question.frage;

  // Hint
  const hintEl = document.getElementById('q-hint');
  if (question.hinweis) {
    hintEl.textContent = question.hinweis;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }

  // Reset result & explanation
  const resultEl = document.getElementById('q-result');
  resultEl.className = 'modal-result';
  resultEl.textContent = '';

  const explEl = document.getElementById('q-explanation');
  explEl.classList.remove('visible');
  document.getElementById('q-explanation-text').textContent = question.erklaerung || '';

  document.getElementById('q-continue').classList.remove('visible');

  // Answer options
  const optionsDiv = document.getElementById('q-options');
  const openDiv = document.getElementById('q-open-actions');
  optionsDiv.innerHTML = '';
  optionsDiv.style.display = 'none';
  openDiv.style.display = 'none';

  pendingQuestionResult = null;

  if (question.typ === 'offen') {
    // Teacher decides
    openDiv.style.display = 'flex';
  } else {
    // MC: Single or Multi-Correct
    optionsDiv.style.display = 'flex';
    const isMulti = Array.isArray(question.correctIndices) && question.correctIndices.length > 0;

    if (!isMulti) {
      // Single correct – original behaviour
      question.antworten.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = ans;
        btn.onclick = () => selectAnswer(btn, i, question);
        optionsDiv.appendChild(btn);
      });
    } else {
      // Multi correct – toggle + confirm
      const pending = new Set();
      const allBtns = [];
      question.antworten.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = ans;
        btn.addEventListener('click', () => {
          if (pendingQuestionResult && pendingQuestionResult.resolved) return;
          if (pending.has(i)) { pending.delete(i); btn.classList.remove('mc-selected-pending'); }
          else { pending.add(i); btn.classList.add('mc-selected-pending'); }
        });
        allBtns.push(btn);
        optionsDiv.appendChild(btn);
      });

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'answer-btn mc-confirm-btn';
      confirmBtn.textContent = '✓ Bestätigen';
      confirmBtn.addEventListener('click', () => {
        if (pendingQuestionResult && pendingQuestionResult.resolved) return;
        const sel = [...pending];
        const ok = isMcCorrect(question, sel);
        const cs = correctSet(question);

        // Disable all buttons
        allBtns.forEach(b => b.classList.add('disabled'));
        confirmBtn.classList.add('disabled');

        // Mark correct/wrong
        allBtns.forEach((b, i) => {
          if (cs.has(i)) b.classList.add('correct');
          else if (pending.has(i)) b.classList.add('wrong');
        });

        resolveQuestion(ok);
      });
      optionsDiv.appendChild(confirmBtn);
    }
  }

  // Store question for bonus check
  pendingQuestionResult = { question, field, resolved: false };

  qpLiveQ = { id: question.id, teamIdx: currentTeamIdx, question, resolved: false, correct: null };
  QpStorage.save(buildCurrentGameState());

  modal.classList.add('open');
}

function selectAnswer(btn, selectedIdx, question) {
  if (pendingQuestionResult && pendingQuestionResult.resolved) return;

  const correct = selectedIdx === question.richtig;
  const allBtns = document.querySelectorAll('#q-options .answer-btn');
  const cs = correctSet(question);

  // Disable all
  allBtns.forEach(b => b.classList.add('disabled'));

  // Mark correct/wrong
  btn.classList.add(correct ? 'correct' : 'wrong');
  allBtns.forEach((b, i) => { if (cs.has(i)) b.classList.add('correct'); });

  resolveQuestion(correct);
}

function resolveOpen(correct) {
  document.getElementById('q-open-actions').style.display = 'none';
  resolveQuestion(correct);
}

function resolveQuestion(correct) {
  if (!pendingQuestionResult || pendingQuestionResult.resolved) return;
  pendingQuestionResult.resolved = true;
  pendingQuestionResult.correct = correct;

  const team = teams[currentTeamIdx];
  const resultEl = document.getElementById('q-result');

  if (correct) {
    team.correctCount++;
    resultEl.textContent = '✓ Richtig!';
    resultEl.className = 'modal-result visible correct-result';
  } else {
    team.wrongCount++;
    resultEl.textContent = '✗ Falsch!';
    resultEl.className = 'modal-result visible wrong-result';
  }

  // Show explanation
  const explEl = document.getElementById('q-explanation');
  if (pendingQuestionResult.question.erklaerung) {
    explEl.classList.add('visible');
  }

  document.getElementById('q-continue').classList.add('visible');

  if (qpLiveQ) { qpLiveQ.resolved = true; qpLiveQ.correct = correct; }
  QpStorage.save(buildCurrentGameState());
}

function continueAfterQuestion() {
  document.getElementById('question-modal').classList.remove('open');

  if (!pendingQuestionResult) { nextTurn(); return; }

  const correct = pendingQuestionResult.correct;
  const team = teams[currentTeamIdx];

  if (correct) {
    const nextPos = Math.min(team.position + 2, FIELD_COUNT - 1);
    moveTeam(currentTeamIdx, nextPos);
  } else {
    // Wrong: team stays, next turn
    nextTurn();
  }
}

// ── Movement ─────────────────────────────────────────────────
function moveTeam(teamIdx, newPos) {
  const team = teams[teamIdx];
  team.position = newPos;

  renderBoard();
  renderSidebar();

  qpLiveQ = null;
  QpStorage.save(buildCurrentGameState());

  // Check win
  if (newPos >= FIELD_COUNT - 1) {
    setTimeout(() => showWinner(teamIdx), 600);
    return;
  }

  // Check bonus on new field
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

  // Duel: show team selection
  const duelDiv = document.getElementById('duel-teams');
  duelDiv.innerHTML = '';
  duelDiv.style.display = 'none';
  duelOpponentIdx = null;

  if (bonusType === 'duel' && teams.length > 1) {
    duelDiv.style.display = 'flex';
    document.getElementById('bonus-desc').textContent = team.name + ' fordert ein Team zum Duell! Wer gewinnt, rückt 1 Feld vor.';

    teams.forEach((t, i) => {
      if (i === teamIdx) return;
      const btn = document.createElement('div');
      btn.className = 'duel-team';
      btn.textContent = t.name;
      btn.style.borderColor = t.color;
      btn.onclick = () => {
        duelDiv.querySelectorAll('.duel-team').forEach(d => d.classList.remove('selected'));
        btn.classList.add('selected');
        duelOpponentIdx = i;
      };
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
    case 'advance': {
      const newPos = Math.min(team.position + 2, FIELD_COUNT - 1);
      moveTeam(teamIdx, newPos);
      return; // moveTeam handles next turn
    }
    case 'setback': {
      const newPos = Math.max(team.position - 2, 0);
      team.position = newPos;
      renderBoard();
      renderSidebar();
      nextTurn();
      return;
    }
    case 'extra': {
      // Same team goes again — don't advance currentTeamIdx
      renderBoard();
      renderSidebar();
      updateTurnBanner();
      return;
    }
    case 'joker': {
      if (!team.jokerUsed) {
        team.hasJoker = true;
      }
      renderSidebar();
      nextTurn();
      return;
    }
    case 'duel': {
      if (duelOpponentIdx !== null) {
        startDuel(teamIdx, duelOpponentIdx);
      } else {
        nextTurn();
      }
      return;
    }
  }

  nextTurn();
}

function startDuel(team1Idx, team2Idx) {
  // Pick a question from any category
  const allKats = activeFragenBank.kategorien.map(k => k.id);
  const randomKat = allKats[Math.floor(Math.random() * allKats.length)];
  const question = pickQuestion(randomKat);

  if (!question) { nextTurn(); return; }

  // Show duel question — first correct answer wins
  // For simplicity: show to both, whoever's "turn" it is clicks
  // We'll show question with a special duel banner
  const field = board[teams[team1Idx].position];
  pendingQuestionResult = {
    question, field, resolved: false,
    isDuel: true, team1Idx, team2Idx,
    duelPhase: 1 // 1 = team1 answers first
  };

  showDuelQuestion(question, team1Idx, team2Idx, 1);
}

function showDuelQuestion(question, team1Idx, team2Idx, phase) {
  const modal = document.getElementById('question-modal');
  const team = teams[phase === 1 ? team1Idx : team2Idx];
  const kat = activeFragenBank.kategorien.find(k => k.id === question.kategorie);

  document.getElementById('q-cat-icon').textContent = '⚔️';
  document.getElementById('q-cat-name').textContent = 'Duell: ' + team.name;
  document.getElementById('q-difficulty').textContent = question.schwierigkeit;
  document.getElementById('q-text').textContent = question.frage;
  document.getElementById('q-hint').style.display = 'none';

  const resultEl = document.getElementById('q-result');
  resultEl.className = 'modal-result';
  resultEl.textContent = '';

  const explEl = document.getElementById('q-explanation');
  explEl.classList.remove('visible');
  document.getElementById('q-explanation-text').textContent = question.erklaerung || '';
  document.getElementById('q-continue').classList.remove('visible');

  const optionsDiv = document.getElementById('q-options');
  const openDiv = document.getElementById('q-open-actions');
  optionsDiv.innerHTML = '';
  optionsDiv.style.display = 'none';
  openDiv.style.display = 'none';

  if (question.typ === 'offen') {
    openDiv.style.display = 'flex';
  } else {
    optionsDiv.style.display = 'flex';
    const isMulti = Array.isArray(question.correctIndices) && question.correctIndices.length > 0;

    if (!isMulti) {
      question.antworten.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = ans;
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
    } else {
      // Multi correct duel
      const pending = new Set();
      const allBtns = [];
      question.antworten.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = ans;
        btn.addEventListener('click', () => {
          if (pendingQuestionResult && pendingQuestionResult.resolved) return;
          if (pending.has(i)) { pending.delete(i); btn.classList.remove('mc-selected-pending'); }
          else { pending.add(i); btn.classList.add('mc-selected-pending'); }
        });
        allBtns.push(btn);
        optionsDiv.appendChild(btn);
      });
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'answer-btn mc-confirm-btn';
      confirmBtn.textContent = '✓ Bestätigen';
      confirmBtn.addEventListener('click', () => {
        if (pendingQuestionResult && pendingQuestionResult.resolved) return;
        const ok = isMcCorrect(question, [...pending]);
        const cs = correctSet(question);
        allBtns.forEach(b => b.classList.add('disabled'));
        confirmBtn.classList.add('disabled');
        allBtns.forEach((b, i) => {
          if (cs.has(i)) b.classList.add('correct');
          else if (pending.has(i)) b.classList.add('wrong');
        });
        resolveDuelAnswer(ok);
      });
      optionsDiv.appendChild(confirmBtn);
    }
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

    const explEl = document.getElementById('q-explanation');
    if (pr.question.erklaerung) explEl.classList.add('visible');

    // Winner moves 1 field forward
    pr.duelWinner = currentDuelTeam;
    document.getElementById('q-continue').classList.add('visible');
  } else {
    if (pr.duelPhase === 1) {
      // Team 1 wrong → team 2 gets a chance
      resultEl.textContent = '✗ Falsch! ' + teams[pr.team2Idx].name + ' darf antworten...';
      resultEl.className = 'modal-result visible wrong-result';

      pr.duelPhase = 2;
      setTimeout(() => {
        document.getElementById('question-modal').classList.remove('open');
        setTimeout(() => showDuelQuestion(pr.question, pr.team1Idx, pr.team2Idx, 2), 300);
      }, 1500);
    } else {
      // Both wrong
      pr.resolved = true;
      resultEl.textContent = '✗ Beide Teams falsch!';
      resultEl.className = 'modal-result visible wrong-result';
      const explEl = document.getElementById('q-explanation');
      if (pr.question.erklaerung) explEl.classList.add('visible');
      pr.duelWinner = null;
      document.getElementById('q-continue').classList.add('visible');
    }
  }
}

// Override continueAfterQuestion for duel
const _originalContinue = continueAfterQuestion;
continueAfterQuestion = function () {
  if (pendingQuestionResult && pendingQuestionResult.isDuel) {
    document.getElementById('question-modal').classList.remove('open');
    const winner = pendingQuestionResult.duelWinner;
    pendingQuestionResult = null;

    if (winner !== null && winner !== undefined) {
      const newPos = Math.min(teams[winner].position + 1, FIELD_COUNT - 1);
      // Don't trigger bonus from duel movement
      teams[winner].position = newPos;
      renderBoard();
      renderSidebar();

      if (newPos >= FIELD_COUNT - 1) {
        setTimeout(() => showWinner(winner), 600);
        return;
      }
    }

    nextTurn();
    return;
  }

  _originalContinue();
};

// ── Joker ────────────────────────────────────────────────────
function useJoker() {
  const team = teams[currentTeamIdx];
  if (!team.hasJoker || team.jokerUsed) return;

  team.jokerUsed = true;
  team.hasJoker = false;

  // Skip question, move forward
  const nextPos = Math.min(team.position + 1, FIELD_COUNT - 1);
  moveTeam(currentTeamIdx, nextPos);
}

// ── Turn Management ──────────────────────────────────────────
function nextTurn() {
  if (gameOver) return;

  currentTeamIdx = (currentTeamIdx + 1) % teams.length;
  if (currentTeamIdx === 0) round++;

  renderBoard();
  renderSidebar();
  updateTurnBanner();

  qpLiveQ = null;
  QpStorage.save(buildCurrentGameState());
}

// ── Winner Screen ────────────────────────────────────────────
function showWinner(teamIdx) {
  gameOver = true;
  const team = teams[teamIdx];

  document.getElementById('winner-team-name').textContent = team.name;
  document.getElementById('winner-team-name').style.color = team.color;

  // Stats
  const statsDiv = document.getElementById('winner-stats');
  statsDiv.innerHTML = '';

  const allStats = [
    { value: round, label: 'Runden' },
    { value: team.correctCount, label: 'Richtige' },
    { value: team.wrongCount, label: 'Falsche' }
  ];

  allStats.forEach(s => {
    const div = document.createElement('div');
    div.className = 'winner-stat';
    div.innerHTML = '<div class="winner-stat-value">' + s.value + '</div>' +
                    '<div class="winner-stat-label">' + s.label + '</div>';
    statsDiv.appendChild(div);
  });

  // Team ranking by position
  const sorted = [...teams].sort((a, b) => b.position - a.position);
  sorted.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'winner-stat';
    div.innerHTML = '<div class="winner-stat-value" style="color:' + t.color + '">' + (i + 1) + '.</div>' +
                    '<div class="winner-stat-label">' + t.name + ' (Feld ' + t.position + ')</div>';
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

function resetToSetup() {
  resetToSelector();
}

function confirmQuit() {
  if (confirm('Spiel wirklich beenden?')) {
    resetToSelector();
  }
}

// Override resolveOpen for duel mode
const _originalResolveOpen = resolveOpen;
resolveOpen = function (correct) {
  if (pendingQuestionResult && pendingQuestionResult.isDuel) {
    document.getElementById('q-open-actions').style.display = 'none';
    resolveDuelAnswer(correct);
    return;
  }
  _originalResolveOpen(correct);
};
