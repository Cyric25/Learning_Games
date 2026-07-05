/* leiterspiel.js – Schlangen & Leitern mit Wissensfragen */

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

// ── LsStorage: Server-Sync für Multi-Game ────────────────────
const LsStorage = {
  _code: null,
  _serverOk: null,
  _sub: null,

  setCode(c) { this._code = c ? c.toUpperCase() : null; },
  getCode() { return this._code; },

  generateCode() {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:4}, () => ch[Math.floor(Math.random()*ch.length)]).join('');
  },

  async checkServer() {
    if (this._serverOk !== null) return this._serverOk;
    if (window.location.protocol === 'file:') { this._serverOk = false; return false; }
    try {
      await fetch('../api.php?f=ls-game&code=PING', {method:'HEAD', signal:AbortSignal.timeout(2000)});
      this._serverOk = true;
    } catch { this._serverOk = false; }
    return this._serverOk;
  },

  _ser(gs) {
    return {...gs, usedQuestionIds: [...(gs.usedQuestionIds instanceof Set ? gs.usedQuestionIds : (gs.usedQuestionIds||[]))]};
  },
  _deser(d) {
    return {...d, usedQuestionIds: new Set(d.usedQuestionIds||[])};
  },

  async save(gs) {
    if (!this._code) return;
    const json = JSON.stringify(this._ser(gs));
    localStorage.setItem('ls_gs_'+this._code, json);
    if (await this.checkServer()) {
      try { await fetch('../api.php?f=ls-game&code='+this._code, {method:'POST', body:json, headers:{'Content-Type':'application/json'}}); } catch {}
    }
  },

  async loadGamesRegistry() {
    if (await this.checkServer()) {
      try {
        const r = await fetch('../api.php?f=ls-games');
        if (r.ok) return await r.json();
      } catch {}
    }
    const reg = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ls_gs_')) {
        const code = k.slice(6);
        try {
          const d = JSON.parse(localStorage.getItem(k));
          if (d && d.meta) reg[code] = { title: d.meta.title || 'Schlangen & Leitern', status: d.phase || 'setup', updatedAt: d.meta.createdAt || '' };
        } catch {}
      }
    }
    return reg;
  },

  async deleteGame(code) {
    localStorage.removeItem('ls_gs_' + code.toUpperCase());
    if (await this.checkServer()) {
      try { await fetch('../api.php?f=ls-game&code='+code, {method:'DELETE'}); } catch {}
    }
  },

  async load(code) {
    code = (code||this._code||'').toUpperCase();
    if (!code) return null;
    if (await this.checkServer()) {
      try {
        const r = await fetch('../api.php?f=ls-game&code='+code);
        if (r.ok) { const d = await r.json(); if (d&&d.meta) return this._deser(d); }
      } catch {}
    }
    const s = localStorage.getItem('ls_gs_'+code);
    if (s) try { return this._deser(JSON.parse(s)); } catch {}
    return null;
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
      src = new EventSource('../api.php?f=ls-sse&code='+code);
      src.onmessage = e => { if (!stopped) emit(e.data); };
      src.addEventListener('reconnect', () => { src&&src.close(); src=null; if(!stopped) setTimeout(startSSE,500); });
      src.onerror = () => { src&&src.close(); src=null; if(!stopped) startPoll(); };
    };
    const startPoll = () => {
      if (stopped||timer) return;
      const fn = async () => {
        if (stopped) return;
        try {
          const r = await fetch('../api.php?f=ls-game&code='+code);
          if (r.ok) emit(await r.text());
        } catch {}
      };
      fn(); timer = setInterval(fn, 1000);
    };
    const startLocalPoll = () => {
      if (stopped||timer) return;
      let last='';
      timer = setInterval(() => {
        if (stopped) return;
        const s = localStorage.getItem('ls_gs_'+code);
        if (s&&s!==last) { last=s; try { const d=JSON.parse(s); if(d&&d.meta) cb(this._deser(d)); } catch {} }

      }, 300);
    };

    (async () => { if (await this.checkServer()) startSSE(); else startLocalPoll(); })();

    return { unsubscribe() { stopped=true; src&&src.close(); timer&&clearInterval(timer); } };
  }
};

// ── Board Library Storage (API + localStorage Fallback) ──────
const _LS_BOARDS_KEY = 'ls_custom_boards';
const _LS_BOARDS_API = '../api.php?f=ls-boards';
let _lsBoardsServerOk = null;

async function _lsBoardsLoad() {
  const lsBoards = (() => { try { return JSON.parse(localStorage.getItem(_LS_BOARDS_KEY) || '[]'); } catch { return []; } })();
  if (_lsBoardsServerOk === null && window.location.protocol !== 'file:') {
    try {
      await fetch(_LS_BOARDS_API, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
      _lsBoardsServerOk = true;
    } catch { _lsBoardsServerOk = false; }
  }
  if (_lsBoardsServerOk) {
    try {
      const r = await fetch(_LS_BOARDS_API);
      if (r.ok) { const srv = await r.json(); if (srv.length > 0) return srv; }
    } catch {}
  }
  return lsBoards;
}

// ── copyCode ──────────────────────────────────────────────────
function copyCode(el) {
  if (!el) return;
  const code = el.textContent.trim();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const orig = el.textContent;
    el.textContent = '✓ Kopiert!';
    setTimeout(() => { el.textContent = orig; }, 1200);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}
window.copyCode = copyCode;

// ── Spielwähler onclick-Exports ──────────────────────────────
// window._gsEnter/_gsDelete werden nach den Funktionsdeklarationen gesetzt (s.u.)
// createNewGame ist eine hoisted function declaration → automatisch window.createNewGame

function joinAsStudent() {
  const input = document.getElementById('gs-code-input');
  const errEl = document.getElementById('gs-join-error');
  const code = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (errEl) errEl.textContent = '';
  if (!code || code.length < 4) {
    if (errEl) errEl.textContent = 'Bitte 4-stelligen Code eingeben.';
    return;
  }
  window.location.href = 'view.html?code=' + code;
}

// ── Constants ────────────────────────────────────────────────
const FIELD_COUNT = 100;
const COLS = 10;
const ROWS = 10;

const ANIMALS = [
  { id: 'dog',   emoji: '🐕', name: 'Hund' },
  { id: 'cat',   emoji: '🐱', name: 'Katze' },
  { id: 'bunny', emoji: '🐰', name: 'Hase' },
  { id: 'hippo', emoji: '🦛', name: 'Nilpferd' },
  { id: 'goat',  emoji: '🐐', name: 'Ziege' },
  { id: 'sheep', emoji: '🐑', name: 'Schaf' },
  { id: 'pig',   emoji: '🐷', name: 'Schwein' },
  { id: 'cow',   emoji: '🐄', name: 'Kuh' },
  { id: 'horse', emoji: '🐴', name: 'Pferd' },
  { id: 'bird',  emoji: '🐦', name: 'Vogel' }
];

const LADDERS = { 4: 14, 9: 31, 21: 42, 28: 84, 51: 67 };
const SNAKES  = { 16: 6, 47: 26, 62: 19, 93: 73, 98: 87 };

// Custom board support (populated from localStorage when a designer-brett is loaded)
let _customBoard = null;

function getFieldCount() {
  return (gameState.board && gameState.board.length > 1) ? gameState.board.length - 1 : FIELD_COUNT;
}

function _cbCentroid(pts) {
  return [pts.reduce((s,p)=>s+p[0],0)/pts.length, pts.reduce((s,p)=>s+p[1],0)/pts.length];
}

function _cbSvgEl(tag, attrs, txt) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (txt != null) e.textContent = txt;
  return e;
}

function _cbFieldColor(field, isFirst, isLast) {
  if (isFirst) return '#1565C0';
  if (isLast)  return '#6A1B9A';
  const bonus = {roll_again:'#0277BD', free_move:'#33691E', swap:'#880E4F'};
  if (field.bonusType && bonus[field.bonusType]) return bonus[field.bonusType];
  return {leicht:'#2E7D32', mittel:'#E65100', schwer:'#B71C1C'}[field.difficulty] || '#455A64';
}

const TIMER_SECONDS = { leicht: 30, mittel: 45, schwer: 60 };
const POINTS = { leicht: 10, mittel: 20, schwer: 30 };

const DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

const TEAM_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a'];

const CAT_ICONS = ['📚','🔬','🌍','⚡','🎯','🏛️','🧮','🌿','⚗️','🎨','🏃','💡','🔭','🎵','📊','🌊','🧩','🦋','🌺','🚀'];

// Fields that have ladders or snakes (cannot be bonus)
const LADDER_SNAKE_FIELDS = new Set([
  ...Object.keys(LADDERS).map(Number),
  ...Object.values(LADDERS),
  ...Object.keys(SNAKES).map(Number),
  ...Object.values(SNAKES)
]);

// ── State ────────────────────────────────────────────────────
let fragenBank = null;
let rawCategories = [];
let selectedCategoryIds = new Set();
let activeFragenBank = null;
let selectedCustomBoardId = null; // set in setup screen, cleared on reset

let gameState = {
  meta: { gameCode: '', title: 'Schlangen & Leitern', createdAt: '' },
  board: [],
  teams: [],
  turnOrder: [],
  currentTurnIdx: 0,
  phase: 'setup',
  usedQuestionIds: new Set(),
  pendingDice: null,
  singlePlayerMode: false,
  liveQuestion: null
};

let lsSub = null;  // SSE subscription handle

let timerInterval = null;
let timerRemaining = 0;
let currentQuestion = null;
let questionResolved = false;
let pendingBonusType = null;
let pendingBonusAfterMove = null;
let diceOrderState = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  renderModeSelector();
  renderTeamCountSelector(4);
  await loadFragen();
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) {
    await enterGame(urlCode.toUpperCase());
  } else {
    showGameSelector();
  }
});

// ── Question Loading (shared with Risiko-Quiz) ──────────────
async function loadFragen() {
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
    rawCategories = rqData.categories || [];
    fragenBank = convertRQtoLeiterspiel(rqData);
    return;
  }

  document.getElementById('setup-error').textContent =
    'Keine Fragen geladen. Bitte Fragen in der zentralen Fragendatenbank anlegen.';
}

function convertRQtoLeiterspiel(rqData) {
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
        kategorien.push({
          id: katId,
          name: katName,
          icon: parentIcon || '📚',
          farbe: colors[colorIdx++ % colors.length]
        });
      }

      node.questions.forEach(q => {
        const schwierigkeit = q.difficulty <= 200 ? 'leicht' : q.difficulty <= 300 ? 'mittel' : 'schwer';
        let typ, antworten, richtig, correctIndices = null;

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
    collectLeafCategories(cat, [cat.name], icon);
  });

  return { kategorien, fragen };
}

// ── Category Selector (Akkordeon-Hierarchie) ─────────────────
function buildCategoryUI() {
  if (!rawCategories.length) return;
  const list = document.getElementById('cat-select-list');
  if (!list) return;
  list.innerHTML = '';
  selectedCategoryIds.clear();

  function collectLeaves(cat) {
    const subs = cat.subcategories || [];
    if (cat.questions && cat.questions.length > 0 && !subs.length) return [cat.id];
    return subs.flatMap(s => collectLeaves(s));
  }
  rawCategories.forEach(cat => collectLeaves(cat).forEach(id => selectedCategoryIds.add(id)));

  rawCategories.forEach((cat, i) => _buildCatNode(list, cat, CAT_ICONS[i % CAT_ICONS.length]));
  updateCatSelectInfo();
}

function _buildCatNode(container, cat, icon, depth) {
  depth = depth || 0;
  const subs = cat.subcategories || [];
  const hasQ = cat.questions && cat.questions.length > 0;
  if (!hasQ && !subs.length) return;

  const qCount = _countLeafQ(cat);

  if (hasQ && !subs.length) {
    const sel = selectedCategoryIds.has(cat.id);
    const item = document.createElement('div');
    item.className = 'cat-select-item' + (sel ? ' selected' : '');
    item.dataset.catId = cat.id;
    item.innerHTML =
      '<span class="cat-select-icon">' + (icon || '📁') + '</span>' +
      '<span class="cat-select-name">' + escapeHtml(cat.name) + '</span>' +
      '<span class="cat-select-count">' + qCount + ' Fr.</span>' +
      '<div class="cat-select-check">' + (sel ? '✓' : '') + '</div>';
    item.onclick = () => {
      const on = !selectedCategoryIds.has(cat.id);
      if (on) { selectedCategoryIds.add(cat.id); item.classList.add('selected'); item.querySelector('.cat-select-check').textContent = '✓'; }
      else     { selectedCategoryIds.delete(cat.id); item.classList.remove('selected'); item.querySelector('.cat-select-check').textContent = ''; }
      _syncGroupHeader(container.closest('.cat-group-wrap'));
      updateCatSelectInfo();
    };
    container.appendChild(item);
    return;
  }

  const allLeaves = [];
  (function collect(c) {
    const cSubs = (c.subcategories || []).length > 0;
    if (c.questions && c.questions.length > 0 && !cSubs) allLeaves.push(c.id);
    (c.subcategories || []).forEach(s => collect(s));
  })(cat);
  const allSel = allLeaves.every(id => selectedCategoryIds.has(id));

  const wrap = document.createElement('div');
  wrap.className = 'cat-group-wrap';

  const header = document.createElement('div');
  header.className = 'cat-group-header collapsed';
  header.innerHTML =
    '<span class="cat-group-chevron">▶</span>' +
    '<span class="cat-group-icon">' + icon + '</span>' +
    '<span class="cat-group-name">' + escapeHtml(cat.name) + '</span>' +
    '<span class="cat-group-count">' + qCount + ' Fragen</span>' +
    '<label class="cat-group-toggle" onclick="event.stopPropagation()">' +
      '<input type="checkbox" class="cat-group-cb"' + (allSel ? ' checked' : '') + '>' +
    '</label>';

  const children = document.createElement('div');
  children.className = 'cat-group-children hidden';

  header.addEventListener('click', () => {
    const collapsed = header.classList.contains('collapsed');
    header.classList.toggle('collapsed', !collapsed);
    children.classList.toggle('hidden', !collapsed);
  });

  const cb = header.querySelector('.cat-group-cb');
  cb.addEventListener('change', () => {
    const on = cb.checked;
    allLeaves.forEach(id => { if (on) selectedCategoryIds.add(id); else selectedCategoryIds.delete(id); });
    children.querySelectorAll('.cat-select-item').forEach(item => {
      item.classList.toggle('selected', on);
      item.querySelector('.cat-select-check').textContent = on ? '✓' : '';
    });
    children.querySelectorAll('.cat-group-cb').forEach(gcb => gcb.checked = on);
    updateCatSelectInfo();
  });

  wrap.appendChild(header);
  wrap.appendChild(children);
  container.appendChild(wrap);
  subs.forEach(sub => _buildCatNode(children, sub, icon, depth + 1));
}

function _countLeafQ(cat) {
  const subs = cat.subcategories || [];
  if (cat.questions && cat.questions.length > 0 && !subs.length)
    return fragenBank ? fragenBank.fragen.filter(q => q.kategorie === cat.id).length : cat.questions.length;
  return subs.reduce((sum, s) => sum + _countLeafQ(s), 0);
}

function _syncGroupHeader(wrap) {
  if (!wrap) return;
  const cb = wrap.querySelector(':scope > .cat-group-header .cat-group-cb');
  if (!cb) return;
  const items = wrap.querySelectorAll('.cat-select-item');
  cb.checked = items.length > 0 && [...items].every(i => i.classList.contains('selected'));
  const parentChildren = wrap.parentElement;
  if (parentChildren && parentChildren.classList.contains('cat-group-children'))
    _syncGroupHeader(parentChildren.closest('.cat-group-wrap'));
}

function toggleAllCategories(on) {
  selectedCategoryIds.clear();
  document.querySelectorAll('#cat-select-list .cat-select-item').forEach(item => {
    item.classList.toggle('selected', on);
    item.querySelector('.cat-select-check').textContent = on ? '✓' : '';
    if (on) selectedCategoryIds.add(item.dataset.catId);
  });
  document.querySelectorAll('#cat-select-list .cat-group-cb').forEach(cb => cb.checked = on);
  updateCatSelectInfo();
}

function updateCatSelectInfo() {
  const el = document.getElementById('cat-select-info');
  if (!el) return;
  const aktiv = fragenBank ? fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie)) : [];
  const qCount = aktiv.length;
  const btn = document.querySelector('#category-screen .setup-btn:not(.setup-btn-ghost)');

  if (selectedCategoryIds.size === 0 || qCount === 0) {
    el.className = 'cat-select-info warning';
    el.innerHTML = 'Keine Kategorie ausgewählt!';
    if (btn) btn.disabled = true;
    return;
  }

  const counts = { leicht: 0, mittel: 0, schwer: 0 };
  aktiv.forEach(q => { if (counts[q.schwierigkeit] !== undefined) counts[q.schwierigkeit]++; });
  const ok = counts.leicht >= 1 && counts.mittel >= 1 && counts.schwer >= 1;

  const icon = s => counts[s] >= 1 ? '✅' : '❌';
  if (ok) {
    el.className = 'cat-select-info';
    el.innerHTML =
      qCount + ' Fragen aus ' + selectedCategoryIds.size + ' Kategorien<br>' +
      icon('leicht') + ' Leicht: ' + counts.leicht + '&nbsp;&nbsp;' +
      icon('mittel') + ' Mittel: ' + counts.mittel + '&nbsp;&nbsp;' +
      icon('schwer') + ' Schwer: ' + counts.schwer;
  } else {
    el.className = 'cat-select-info warning';
    el.innerHTML =
      '⚠ Zu wenige Fragen (' + qCount + '). Anforderungen:<br>' +
      icon('leicht') + ' Leicht: ' + counts.leicht + '&nbsp;&nbsp;' +
      icon('mittel') + ' Mittel: ' + counts.mittel + '&nbsp;&nbsp;' +
      icon('schwer') + ' Schwer: ' + counts.schwer + '<br>' +
      'Mindestens 1 Frage je Schwierigkeit wird benötigt.';
  }
  if (btn) btn.disabled = !ok;
}

// ── Setup Screen ─────────────────────────────────────────────
function renderModeSelector() {
  const row = document.getElementById('mode-row');
  if (!row) return;
  row.innerHTML = '';
  const modes = [
    { id: 'class', label: '👨‍🏫 Klassenspiel' },
    { id: 'solo',  label: '🏠 Einzelspieler' }
  ];
  modes.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (m.id === 'class' ? ' active' : '');
    btn.textContent = m.label;
    btn.dataset.mode = m.id;
    btn.onclick = () => selectMode(m.id);
    row.appendChild(btn);
  });
  gameState.singlePlayerMode = false;
}

function selectMode(modeId) {
  gameState.singlePlayerMode = (modeId === 'solo');
  document.querySelectorAll('#mode-row .param-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === modeId);
  });
  const showMulti = !gameState.singlePlayerMode;
  const teamCountWrap = document.getElementById('team-count-row-wrap');
  if (teamCountWrap) teamCountWrap.style.display = showMulti ? '' : 'none';
  if (gameState.singlePlayerMode) {
    renderTeamSelectList(1);
  } else {
    const n = getSelectedTeamCount() || 4;
    renderTeamSelectList(n);
  }
}

function getSelectedTeamCount() {
  const active = document.querySelector('#team-count-row .param-btn.active');
  return active ? parseInt(active.dataset.count) : 4;
}

function renderTeamCountSelector(defaultCount) {
  const row = document.getElementById('team-count-row');
  if (!row) return;
  row.innerHTML = '';
  for (let i = 2; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (i === defaultCount ? ' active' : '');
    btn.textContent = i;
    btn.dataset.count = i;
    btn.onclick = () => {
      document.querySelectorAll('#team-count-row .param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTeamSelectList(i);
    };
    row.appendChild(btn);
  }
  renderTeamSelectList(defaultCount);
}

function renderTeamSelectList(count) {
  const list = document.getElementById('team-select-list');
  if (!list) return;
  list.innerHTML = '';

  for (let i = 0; i < count; i++) {
    const color = TEAM_COLORS[i % TEAM_COLORS.length];
    const wrap = document.createElement('div');
    wrap.className = 'team-select-item team-select-item--stacked';
    wrap.dataset.index = i;

    const mainRow = document.createElement('div');
    mainRow.className = 'team-select-main-row';

    const dot = document.createElement('span');
    dot.className = 'team-select-dot';
    dot.style.background = color;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'team-name-input';
    input.id = 'team-name-' + i;
    input.placeholder = 'Gruppe ' + (i + 1);
    input.value = 'Gruppe ' + (i + 1);

    const display = document.createElement('span');
    display.className = 'team-animal-display';
    display.id = 'animal-display-' + i;
    display.textContent = '❓';

    mainRow.appendChild(dot);
    mainRow.appendChild(input);
    mainRow.appendChild(display);

    const picker = document.createElement('div');
    picker.className = 'animal-picker';
    picker.id = 'animal-picker-' + i;

    wrap.appendChild(mainRow);
    wrap.appendChild(picker);
    list.appendChild(wrap);
  }

  for (let i = 0; i < count; i++) {
    renderAnimalPicker(i, count);
  }
}

function renderTeamConfigList(count) { renderTeamSelectList(count); }

function renderAnimalPicker(teamIdx, teamCount) {
  const picker = document.getElementById('animal-picker-' + teamIdx);
  picker.innerHTML = '';
  const takenAnimals = getTakenAnimals();
  const currentAnimal = getTeamAnimal(teamIdx);

  ANIMALS.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'animal-btn';
    btn.textContent = a.emoji;
    btn.title = a.name;
    if (a.id === currentAnimal) btn.classList.add('selected');
    else if (takenAnimals.has(a.id)) btn.classList.add('taken');

    btn.onclick = (e) => {
      e.preventDefault();
      selectAnimal(teamIdx, a.id);
    };
    picker.appendChild(btn);
  });
}

function selectAnimal(teamIdx, animalId) {
  const display = document.getElementById('animal-display-' + teamIdx);
  const animal = ANIMALS.find(a => a.id === animalId);
  display.textContent = animal ? animal.emoji : '❓';
  display.dataset.animalId = animalId;

  // Re-render all pickers to update taken state
  const count = document.querySelectorAll('#team-select-list .team-select-item').length;
  for (let i = 0; i < count; i++) {
    renderAnimalPicker(i, count);
  }
}

function getTakenAnimals() {
  const taken = new Set();
  document.querySelectorAll('.team-animal-display').forEach(d => {
    if (d.dataset.animalId) taken.add(d.dataset.animalId);
  });
  return taken;
}

function getTeamAnimal(teamIdx) {
  const d = document.getElementById('animal-display-' + teamIdx);
  return d ? d.dataset.animalId || null : null;
}

// ── Proceed to Categories (validates teams, shows category screen) ──
function proceedToCategories() {
  const errorEl = document.getElementById('setup-error');
  errorEl.textContent = '';

  const count = gameState.singlePlayerMode ? 1 : getSelectedTeamCount();
  for (let i = 0; i < count; i++) {
    const animalId = getTeamAnimal(i);
    if (!animalId) {
      errorEl.textContent = 'Bitte für jede Gruppe ein Tier auswählen!';
      return;
    }
  }

  const animalIds = [];
  for (let i = 0; i < count; i++) animalIds.push(getTeamAnimal(i));
  if (new Set(animalIds).size !== animalIds.length) {
    errorEl.textContent = 'Jede Gruppe braucht ein anderes Tier!';
    return;
  }

  buildCategoryUI();
  showScreen('category-screen');
}

// ── Proceed to Game (from category screen) ───────────────────
async function proceedFromCategories() {
  if (selectedCategoryIds.size === 0) {
    updateCatSelectInfo();
    return;
  }

  activeFragenBank = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie));
  const _lsCounts = { leicht: 0, mittel: 0, schwer: 0 };
  activeFragenBank.forEach(q => { if (_lsCounts[q.schwierigkeit] !== undefined) _lsCounts[q.schwierigkeit]++; });
  if (_lsCounts.leicht < 1 || _lsCounts.mittel < 1 || _lsCounts.schwer < 1) {
    updateCatSelectInfo();
    return;
  }

  // Collect teams from setup screen inputs
  const count = gameState.singlePlayerMode ? 1 : getSelectedTeamCount();
  const teams = [];
  for (let i = 0; i < count; i++) {
    const nameEl = document.getElementById('team-name-' + i);
    const name = (nameEl ? nameEl.value.trim() : '') || ('Gruppe ' + (i + 1));
    const animalId = getTeamAnimal(i);
    const animal = ANIMALS.find(a => a.id === animalId);
    teams.push({ name, animal: animalId, emoji: animal ? animal.emoji : '❓', position: 1, score: 0, correctCount: 0, wrongCount: 0, diceRollForOrder: null });
  }

  gameState.teams = teams;
  gameState.usedQuestionIds = new Set();
  gameState.pendingDice = null;
  gameState.liveQuestion = null;
  gameState.activeCategoryIds = [...selectedCategoryIds];

  // Load custom board if selected
  if (selectedCustomBoardId) {
    const boards = await _lsBoardsLoad();
    _customBoard = boards.find(b => b.id === selectedCustomBoardId) || null;
    gameState.customBoardId = selectedCustomBoardId;
  } else {
    _customBoard = null;
    gameState.customBoardId = null;
  }

  generateBoard();

  const code = LsStorage.getCode();
  const titleInput = document.getElementById('setup-game-title');
  const title = (titleInput && titleInput.value.trim()) || 'Schlangen & Leitern';
  gameState.meta = { gameCode: code, title, createdAt: gameState.meta.createdAt || new Date().toISOString() };

  if (gameState.singlePlayerMode) {
    gameState.turnOrder = [0];
    gameState.currentTurnIdx = 0;
    gameState.phase = 'playing';
    LsStorage.save(gameState);
    showScreen('game-screen');
    renderBoard();
    renderTeamList();
    updateActiveBanner();
    updateDiceButton(true);
    startSSESubscription();
    showCodeBanner();
    if (!_customBoard) { drawLaddersAndSnakes(); window.addEventListener('resize', drawLaddersAndSnakes); }
  } else {
    gameState.phase = 'dice-order';
    LsStorage.save(gameState);
    initDiceOrder();
    showScreen('dice-order-screen');
    showCodeBanner();
  }
}

// ── Board Generation ─────────────────────────────────────────
function generateBoard() {
  if (_customBoard && _customBoard.fields && _customBoard.fields.length > 0) {
    generateCustomBoard();
    return;
  }
  const board = new Array(FIELD_COUNT + 1);

  // Assign difficulties
  for (let i = 1; i <= FIELD_COUNT; i++) {
    const r = Math.random();
    let difficulty;
    if (i === 1) {
      difficulty = 'leicht';
    } else if (i === 100) {
      difficulty = 'schwer';
    } else {
      difficulty = r < 0.4 ? 'leicht' : r < 0.75 ? 'mittel' : 'schwer';
    }

    board[i] = {
      number: i,
      difficulty: difficulty,
      ladderTo: LADDERS[i] || null,
      snakeTo: SNAKES[i] || null,
      bonusType: null
    };
  }

  // Assign bonus fields: 1 per row, not on ladder/snake fields
  // Rows: 1-10, 11-20, ..., 91-100
  const bonusTypes = ['roll_again','roll_again','roll_again','roll_again',
                      'free_move','free_move','free_move','free_move',
                      'swap','swap'];
  shuffleArray(bonusTypes);

  for (let row = 0; row < 10; row++) {
    const start = row * 10 + 1;
    const end = row * 10 + 10;
    const candidates = [];
    for (let f = start; f <= end; f++) {
      if (f === 1 || f === 100) continue;
      if (LADDER_SNAKE_FIELDS.has(f)) continue;
      candidates.push(f);
    }
    if (candidates.length > 0) {
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      board[chosen].bonusType = bonusTypes[row];
    }
  }

  gameState.board = board;
}

function generateCustomBoard() {
  const fields = _customBoard.fields.slice().sort((a,b) => a.number - b.number);
  const maxN = Math.max(...fields.map(f => f.number));

  const fieldById = {};
  fields.forEach(f => { fieldById[f.id] = f; });

  const ladderMap = {}, snakeMap = {};
  (_customBoard.ladders || []).forEach(({from, to}) => {
    const ff = fieldById[from], tf = fieldById[to];
    if (ff && tf) ladderMap[ff.number] = tf.number;
  });
  (_customBoard.snakes || []).forEach(({from, to}) => {
    const ff = fieldById[from], tf = fieldById[to];
    if (ff && tf) snakeMap[ff.number] = tf.number;
  });

  const board = new Array(maxN + 1).fill(null);
  fields.forEach(f => {
    board[f.number] = {
      number: f.number,
      difficulty: f.difficulty || 'leicht',
      bonusType: f.bonusType || null,
      ladderTo: ladderMap[f.number] || null,
      snakeTo: snakeMap[f.number] || null,
      points: f.points
    };
  });
  gameState.board = board;
}

// ── Dice Order Phase ─────────────────────────────────────────
function initDiceOrder() {
  diceOrderState = {
    currentIdx: 0,
    rolls: gameState.teams.map(() => null),
    done: false,
    tieBreaking: false,
    tieIndices: null
  };
  renderDiceOrderList();
  document.getElementById('btn-dice-order').textContent = '🎲 Würfeln für ' + gameState.teams[0].name;
  document.getElementById('btn-dice-order').disabled = false;
}

function renderDiceOrderList() {
  const list = document.getElementById('dice-order-list');
  list.innerHTML = '';
  const indices = diceOrderState.tieBreaking ? diceOrderState.tieIndices : gameState.teams.map((_, i) => i);

  indices.forEach(i => {
    const team = gameState.teams[i];
    const row = document.createElement('div');
    row.className = 'dice-order-row';
    if (diceOrderState.tieBreaking && diceOrderState.tieIndices.includes(i)) {
      row.classList.add('tie');
    }
    const isCurrent = (diceOrderState.tieBreaking ?
      diceOrderState.tieIndices.indexOf(i) === diceOrderState.currentIdx :
      i === diceOrderState.currentIdx);
    if (isCurrent && !diceOrderState.done) row.classList.add('current');
    if (diceOrderState.rolls[i] !== null && !isCurrent) row.classList.add('rolled');

    row.innerHTML =
      '<span class="dice-order-emoji">' + team.emoji + '</span>' +
      '<span class="dice-order-name">' + escapeHtml(team.name) + '</span>' +
      '<span class="dice-order-result">' + (diceOrderState.rolls[i] !== null ? DICE_FACES[diceOrderState.rolls[i] - 1] + ' ' + diceOrderState.rolls[i] : '—') + '</span>';
    list.appendChild(row);
  });

  // Show final order if done
  if (diceOrderState.done) {
    const orderDiv = document.createElement('div');
    orderDiv.style.cssText = 'margin-top:16px;padding:12px;background:var(--bg-field);border-radius:12px;';
    orderDiv.innerHTML = '<strong>Reihenfolge:</strong> ' +
      gameState.turnOrder.map((idx, pos) =>
        (pos + 1) + '. ' + gameState.teams[idx].emoji + ' ' + escapeHtml(gameState.teams[idx].name)
      ).join(' → ');
    list.appendChild(orderDiv);
  }
}

function rollForOrder() {
  const btn = document.getElementById('btn-dice-order');
  const indices = diceOrderState.tieBreaking ? diceOrderState.tieIndices : gameState.teams.map((_, i) => i);
  const currentTeamIdx = indices[diceOrderState.currentIdx];

  // Animate dice
  btn.disabled = true;
  const display = document.querySelectorAll('.dice-order-row')[diceOrderState.currentIdx];
  const resultSpan = display.querySelector('.dice-order-result');
  let animCount = 0;
  const animInterval = setInterval(() => {
    const rnd = Math.floor(Math.random() * 6) + 1;
    resultSpan.textContent = DICE_FACES[rnd - 1] + ' ' + rnd;
    animCount++;
    if (animCount >= 8) {
      clearInterval(animInterval);
      // Final roll
      const roll = Math.floor(Math.random() * 6) + 1;
      diceOrderState.rolls[currentTeamIdx] = roll;
      resultSpan.textContent = DICE_FACES[roll - 1] + ' ' + roll;
      display.classList.remove('current');
      display.classList.add('rolled');

      diceOrderState.currentIdx++;
      if (diceOrderState.currentIdx >= indices.length) {
        // All rolled - check for ties
        resolveOrderRolls();
      } else {
        const nextIdx = indices[diceOrderState.currentIdx];
        btn.textContent = '🎲 Würfeln für ' + gameState.teams[nextIdx].name;
        btn.disabled = false;
        renderDiceOrderList();
      }
    }
  }, 80);
}

function resolveOrderRolls() {
  const btn = document.getElementById('btn-dice-order');
  const indices = diceOrderState.tieBreaking ? diceOrderState.tieIndices : gameState.teams.map((_, i) => i);

  // Sort by roll descending
  const sorted = [...indices].sort((a, b) => diceOrderState.rolls[b] - diceOrderState.rolls[a]);

  // Check for ties at any position
  const groups = [];
  let i = 0;
  while (i < sorted.length) {
    const roll = diceOrderState.rolls[sorted[i]];
    const group = [sorted[i]];
    while (i + 1 < sorted.length && diceOrderState.rolls[sorted[i + 1]] === roll) {
      i++;
      group.push(sorted[i]);
    }
    groups.push(group);
    i++;
  }

  // If first group has ties, need tiebreaker
  if (groups[0].length > 1 && !diceOrderState.tieBreaking) {
    // Set up tiebreaker for tied groups at top
    const tiedAtTop = groups[0];
    diceOrderState.tieBreaking = true;
    diceOrderState.tieIndices = tiedAtTop;
    diceOrderState.currentIdx = 0;
    // Reset rolls for tied teams
    tiedAtTop.forEach(idx => { diceOrderState.rolls[idx] = null; });
    btn.textContent = '🎲 Gleichstand! Würfeln für ' + gameState.teams[tiedAtTop[0]].name;
    btn.disabled = false;
    renderDiceOrderList();
    return;
  }

  // If tiebreaking and still tied
  if (diceOrderState.tieBreaking && groups[0].length > 1) {
    const tiedAtTop = groups[0];
    diceOrderState.currentIdx = 0;
    diceOrderState.tieIndices = tiedAtTop;
    tiedAtTop.forEach(idx => { diceOrderState.rolls[idx] = null; });
    btn.textContent = '🎲 Noch Gleichstand! Würfeln für ' + gameState.teams[tiedAtTop[0]].name;
    btn.disabled = false;
    renderDiceOrderList();
    return;
  }

  // Build final order
  if (diceOrderState.tieBreaking) {
    // We were tiebreaking the top group - merge with remaining
    const allIndices = gameState.teams.map((_, i) => i);
    const nonTied = allIndices.filter(i => !diceOrderState.tieIndices.includes(i));
    // Sort non-tied by their original rolls
    nonTied.sort((a, b) => diceOrderState.rolls[b] - diceOrderState.rolls[a]);
    // Tied group sorted by tiebreaker
    const tiedSorted = [...diceOrderState.tieIndices].sort((a, b) => diceOrderState.rolls[b] - diceOrderState.rolls[a]);
    gameState.turnOrder = [...tiedSorted, ...nonTied];
  } else {
    gameState.turnOrder = sorted;
  }

  diceOrderState.done = true;
  renderDiceOrderList();
  btn.textContent = 'Spiel starten';
  btn.disabled = false;
  btn.onclick = () => {
    gameState.phase = 'playing';
    gameState.currentTurnIdx = 0;
    LsStorage.save(gameState);
    showScreen('game-screen');
    renderBoard();
    renderTeamList();
    updateActiveBanner();
    updateDiceButton(true);
    drawLaddersAndSnakes();
    window.addEventListener('resize', drawLaddersAndSnakes);
    startSSESubscription();
  };
}

// ── Screen Management ────────────────────────────────────────
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  if (screenId === 'game-screen') {
    setTimeout(() => drawLaddersAndSnakes(), 50);
  }
}

// ── Board Rendering ──────────────────────────────────────────
function fieldToGridPosition(fieldNum) {
  const row = Math.floor((fieldNum - 1) / 10);
  const colInRow = (fieldNum - 1) % 10;
  const col = row % 2 === 1 ? (9 - colInRow) : colInRow;
  const gridRow = 9 - row;
  return { gridRow: gridRow + 1, gridCol: col + 1 };
}

function renderBoard() {
  if (_customBoard) { renderCustomBoardSVG(); return; }
  const grid = document.getElementById('board-grid');
  grid.innerHTML = '';

  for (let f = 1; f <= FIELD_COUNT; f++) {
    const field = gameState.board[f];
    const pos = fieldToGridPosition(f);
    const div = document.createElement('div');
    div.className = 'board-field';
    div.id = 'field-' + f;
    div.style.gridRow = pos.gridRow;
    div.style.gridColumn = pos.gridCol;

    // Difficulty class
    const diffClassMap = { leicht: 'easy', mittel: 'medium', schwer: 'hard' };
    if (f === 1) {
      div.classList.add('field-start');
    } else if (f === 100) {
      div.classList.add('field-goal');
    } else if (field.bonusType === 'roll_again') {
      div.classList.add('bonus-roll');
    } else if (field.bonusType === 'free_move') {
      div.classList.add('bonus-free');
    } else if (field.bonusType === 'swap') {
      div.classList.add('bonus-swap');
    } else {
      div.classList.add('field-' + (diffClassMap[field.difficulty] || field.difficulty));
    }

    // Ladder/Snake markers
    if (field.ladderTo) div.classList.add('has-ladder');
    if (field.snakeTo) div.classList.add('has-snake');

    // Field number
    const numSpan = document.createElement('span');
    numSpan.className = 'field-number';
    numSpan.textContent = f;
    div.appendChild(numSpan);

    // Bonus badge
    if (field.bonusType) {
      const badge = document.createElement('span');
      badge.className = 'field-bonus-badge';
      badge.textContent = field.bonusType === 'roll_again' ? '🎲' :
                          field.bonusType === 'free_move' ? '🎁' : '🔄';
      div.appendChild(badge);
    }

    // Special icon for start/goal
    if (f === 1) {
      const icon = document.createElement('span');
      icon.className = 'field-bonus-badge';
      icon.textContent = '🏁';
      div.appendChild(icon);
    } else if (f === 100) {
      const icon = document.createElement('span');
      icon.className = 'field-bonus-badge';
      icon.textContent = '🏆';
      div.appendChild(icon);
    }

    // Ladder/snake small icon
    if (field.ladderTo) {
      const icon = document.createElement('span');
      icon.className = 'field-special-icon';
      icon.textContent = '🪜';
      icon.title = 'Leiter → Feld ' + field.ladderTo;
      div.appendChild(icon);
    }
    if (field.snakeTo) {
      const icon = document.createElement('span');
      icon.className = 'field-special-icon';
      icon.textContent = '🐍';
      icon.title = 'Schlange → Feld ' + field.snakeTo;
      div.appendChild(icon);
    }

    // Pieces container
    const piecesDiv = document.createElement('div');
    piecesDiv.className = 'field-pieces';
    piecesDiv.id = 'pieces-' + f;
    div.appendChild(piecesDiv);

    grid.appendChild(div);
  }

  updatePieces();
}

function updatePieces() {
  if (_customBoard) { renderCustomBoardSVG(); return; }
  // Clear all pieces
  for (let f = 1; f <= FIELD_COUNT; f++) {
    const container = document.getElementById('pieces-' + f);
    if (container) container.innerHTML = '';
  }

  // Place team pieces
  gameState.teams.forEach((team, idx) => {
    if (team.position < 1 || team.position > 100) return;
    const container = document.getElementById('pieces-' + team.position);
    if (!container) return;
    const piece = document.createElement('span');
    piece.className = 'piece';
    piece.textContent = team.emoji;
    piece.title = team.name;
    container.appendChild(piece);
  });

  // Highlight current team's field
  document.querySelectorAll('.board-field.current-field').forEach(f => f.classList.remove('current-field'));
  if (gameState.phase === 'playing') {
    const currentTeam = getCurrentTeam();
    if (currentTeam) {
      const fieldEl = document.getElementById('field-' + currentTeam.position);
      if (fieldEl) fieldEl.classList.add('current-field');
    }
  }
}

// ── Custom Board SVG Renderer ────────────────────────────────
function renderCustomBoardSVG() {
  const container = document.querySelector('.board-container');
  const grid = document.getElementById('board-grid');
  const svg = document.getElementById('svg-overlay');
  if (!container || !svg) return;

  // One-time setup: hide grid, stretch SVG over full container
  if (!container.classList.contains('is-custom')) {
    container.classList.add('is-custom');
    container.style.setProperty('--custom-ar', String(_customBoard.aspectRatio || 1.777));
    grid.style.display = 'none';
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  svg.innerHTML = '';

  // Arrow markers
  const defs = _cbSvgEl('defs');
  ['ladder','snake'].forEach(type => {
    const m = _cbSvgEl('marker', {id:'cb-'+type, markerWidth:'7', markerHeight:'7', refX:'6', refY:'3.5', orient:'auto'});
    m.appendChild(_cbSvgEl('path', {d:'M0,0 L0,7 L7,3.5 z', fill: type==='ladder'?'#43A047':'#C62828'}));
    defs.appendChild(m);
  });
  svg.appendChild(defs);

  // Background image
  if (_customBoard.backgroundImage) {
    svg.appendChild(_cbSvgEl('image', {
      href: _customBoard.backgroundImage,
      x:0, y:0, width:100, height:100,
      preserveAspectRatio: 'xMidYMid slice'
    }));
  }

  // Connections (below fields)
  const fieldById = {};
  (_customBoard.fields || []).forEach(f => { fieldById[f.id] = f; });

  const drawConn = (from, to, type) => {
    const ff = fieldById[from], tf = fieldById[to];
    if (!ff || !tf || !ff.points || !tf.points) return;
    const [ax,ay] = _cbCentroid(ff.points), [bx,by] = _cbCentroid(tf.points);
    const color = type==='ladder' ? '#43A047' : '#C62828';
    svg.appendChild(_cbSvgEl('line', {x1:ax,y1:ay,x2:bx,y2:by,stroke:color,'stroke-width':'1.2',opacity:'0.9','marker-end':'url(#cb-'+type+')'}));
    svg.appendChild(_cbSvgEl('text', {x:(ax+bx)/2,y:(ay+by)/2-2.5,'text-anchor':'middle','font-size':'4',style:'filter:drop-shadow(0 1px 4px rgba(0,0,0,.9))','pointer-events':'none'}, type==='ladder'?'🪜':'🐍'));
  };
  (_customBoard.ladders||[]).forEach(({from,to}) => drawConn(from,to,'ladder'));
  (_customBoard.snakes||[]).forEach(({from,to}) => drawConn(from,to,'snake'));

  // Fields
  const board = gameState.board;
  const maxN = board.length - 1;
  const currentTeam = gameState.phase==='playing' ? getCurrentTeam() : null;

  for (let i = 1; i <= maxN; i++) {
    const field = board[i];
    if (!field || !field.points || field.points.length < 3) continue;

    const isFirst = i === 1, isLast = i === maxN;
    const isCurrent = currentTeam && currentTeam.position === i;
    const xs = field.points.map(p=>p[0]), ys = field.points.map(p=>p[1]);
    const w = Math.max(...xs)-Math.min(...xs), h = Math.max(...ys)-Math.min(...ys);
    const fsize = Math.max(1.4, Math.min(3.8, Math.min(w,h)*0.32));
    const [cx,cy] = _cbCentroid(field.points);

    const g = _cbSvgEl('g');
    g.appendChild(_cbSvgEl('polygon', {
      points: field.points.map(p=>p.join(',')).join(' '),
      fill: _cbFieldColor(field, isFirst, isLast),
      stroke: isCurrent ? '#FFD700' : 'rgba(255,255,255,0.45)',
      'stroke-width': isCurrent ? '0.7' : '0.25',
      opacity: '0.87'
    }));

    g.appendChild(_cbSvgEl('text', {
      x:cx, y:cy - fsize*0.25, 'text-anchor':'middle', 'dominant-baseline':'central',
      fill:'#fff', 'font-size':fsize, 'font-weight':'700',
      style:'filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))'
    }, String(i)));

    const icons = [];
    if (isFirst)  icons.push('🏁');
    if (isLast)   icons.push('🏆');
    if (field.bonusType==='roll_again') icons.push('🎲');
    if (field.bonusType==='free_move')  icons.push('🎁');
    if (field.bonusType==='swap')       icons.push('🔄');
    if (field.ladderTo) icons.push('🪜');
    if (field.snakeTo)  icons.push('🐍');
    if (icons.length) {
      g.appendChild(_cbSvgEl('text', {
        x:cx, y:cy+fsize*0.65, 'text-anchor':'middle', 'dominant-baseline':'central',
        'font-size':Math.max(1.1,fsize*0.58), style:'filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))'
      }, icons.join('')));
    }
    svg.appendChild(g);
  }

  // Team pieces — group by position
  const byPos = {};
  gameState.teams.forEach((team,idx) => {
    if (team.position >= 1 && team.position <= maxN) {
      (byPos[team.position] = byPos[team.position]||[]).push({team,idx});
    }
  });
  Object.entries(byPos).forEach(([pos, entries]) => {
    const field = board[+pos];
    if (!field || !field.points) return;
    const [cx,cy] = _cbCentroid(field.points);
    const n = entries.length;
    entries.forEach(({team}, i) => {
      const ox = n > 1 ? (i - (n-1)/2) * 2.5 : 0;
      svg.appendChild(_cbSvgEl('text', {
        x:cx+ox, y:cy+0.4, 'text-anchor':'middle', 'dominant-baseline':'central',
        'font-size':'4', style:'filter:drop-shadow(0 1px 3px rgba(0,0,0,.9))'
      }, team.emoji));
    });
  });
}

// ── SVG Ladders & Snakes ─────────────────────────────────────
function drawLaddersAndSnakes() {
  if (_customBoard) return;
  const svg = document.getElementById('svg-overlay');
  const grid = document.getElementById('board-grid');
  if (!svg || !grid) return;

  const gridRect = grid.getBoundingClientRect();
  const containerRect = svg.parentElement.getBoundingClientRect();

  svg.style.left = (gridRect.left - containerRect.left) + 'px';
  svg.style.top  = (gridRect.top  - containerRect.top)  + 'px';
  svg.setAttribute('width',   gridRect.width);
  svg.setAttribute('height',  gridRect.height);
  svg.setAttribute('viewBox', '0 0 ' + gridRect.width + ' ' + gridRect.height);
  svg.innerHTML = '';

  function getFieldCenter(fieldNum) {
    const el = document.getElementById('field-' + fieldNum);
    if (!el) return null;
    const fr = el.getBoundingClientRect();
    return {
      x: fr.left - gridRect.left + fr.width  / 2,
      y: fr.top  - gridRect.top  + fr.height / 2
    };
  }

  function el(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  // ── Leitern ──────────────────────────────────────────────
  Object.entries(LADDERS).forEach(([from, to]) => {
    const a = getFieldCenter(Number(from));
    const b = getFieldCenter(Number(to));
    if (!a || !b) return;

    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    const W = 5.5;
    const nx = -dy / len * W, ny = dx / len * W;

    // Schatten
    svg.appendChild(el('line', { x1: a.x+nx+2, y1: a.y+ny+2.5, x2: b.x+nx+2, y2: b.y+ny+2.5, stroke:'#000','stroke-width':'5',opacity:'0.1','stroke-linecap':'round' }));
    svg.appendChild(el('line', { x1: a.x-nx+2, y1: a.y-ny+2.5, x2: b.x-nx+2, y2: b.y-ny+2.5, stroke:'#000','stroke-width':'5',opacity:'0.1','stroke-linecap':'round' }));

    // Holme (dunkelbraun)
    svg.appendChild(el('line', { x1: a.x+nx, y1: a.y+ny, x2: b.x+nx, y2: b.y+ny, stroke:'#5D2E0C','stroke-width':'4',opacity:'1','stroke-linecap':'round' }));
    svg.appendChild(el('line', { x1: a.x-nx, y1: a.y-ny, x2: b.x-nx, y2: b.y-ny, stroke:'#5D2E0C','stroke-width':'4',opacity:'1','stroke-linecap':'round' }));
    // Holme Highlight
    svg.appendChild(el('line', { x1: a.x+nx*0.3, y1: a.y+ny*0.3, x2: b.x+nx*0.3, y2: b.y+ny*0.3, stroke:'#A0622D','stroke-width':'1.5',opacity:'0.5','stroke-linecap':'round' }));
    svg.appendChild(el('line', { x1: a.x-nx*0.3, y1: a.y-ny*0.3, x2: b.x-nx*0.3, y2: b.y-ny*0.3, stroke:'#A0622D','stroke-width':'1.5',opacity:'0.5','stroke-linecap':'round' }));

    // Sprossen
    const rungCount = Math.max(3, Math.floor(len / 14));
    for (let i = 1; i < rungCount; i++) {
      const t = i / rungCount;
      const rx = a.x + dx*t, ry = a.y + dy*t;
      svg.appendChild(el('line', { x1: rx+nx, y1: ry+ny, x2: rx-nx, y2: ry-ny, stroke:'#8B4513','stroke-width':'3',opacity:'0.95','stroke-linecap':'round' }));
      svg.appendChild(el('line', { x1: rx+nx*0.3, y1: ry+ny*0.3, x2: rx-nx*0.3, y2: ry-ny*0.3, stroke:'#C47A3A','stroke-width':'1.2',opacity:'0.5','stroke-linecap':'round' }));
    }

    // Kreise an Fuß (grün) und Kopf (dunkelgrün)
    svg.appendChild(el('circle', { cx: a.x, cy: a.y, r:'6',   fill:'#43A047', opacity:'0.95' }));
    svg.appendChild(el('circle', { cx: a.x, cy: a.y, r:'3.5', fill:'#fff',    opacity:'0.5'  }));
    svg.appendChild(el('circle', { cx: b.x, cy: b.y, r:'6',   fill:'#1B5E20', opacity:'0.95' }));
    svg.appendChild(el('circle', { cx: b.x, cy: b.y, r:'3.5', fill:'#fff',    opacity:'0.4'  }));

    // Pfeil nach oben an der Spitze
    const ah = 8, udx = dx/len, udy = dy/len;
    const ap = 'M '+(b.x-udx*ah-nx*0.7)+' '+(b.y-udy*ah-ny*0.7)+
               ' L '+b.x+' '+b.y+
               ' L '+(b.x-udx*ah+nx*0.7)+' '+(b.y-udy*ah+ny*0.7);
    svg.appendChild(el('path', { d:ap, fill:'none', stroke:'#1B5E20','stroke-width':'3','stroke-linecap':'round','stroke-linejoin':'round',opacity:'0.95' }));
  });

  // ── Schlangen ─────────────────────────────────────────────
  const snakeColors = ['#C62828','#E65100','#6A1B9A','#1565C0','#2E7D32'];
  let snakeIdx = 0;

  Object.entries(SNAKES).forEach(([from, to]) => {
    const a = getFieldCenter(Number(from)); // Kopf (oben)
    const b = getFieldCenter(Number(to));   // Schwanz (unten)
    if (!a || !b) return;

    const color = snakeColors[snakeIdx++ % snakeColors.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    const waves = Math.max(3, Math.floor(len / 20));
    const amplitude = Math.min(20, len * 0.09);
    const nx = -dy / len, ny = dx / len;

    // Wellenpath generieren
    function buildPath(ox, oy) {
      let d = 'M '+(a.x+ox)+' '+(a.y+oy);
      for (let i = 1; i <= waves * 2; i++) {
        const t = i / (waves * 2);
        const px = a.x + dx*t + ox, py = a.y + dy*t + oy;
        const side = i % 2 === 0 ? 1 : -1;
        const cpx = a.x + dx*(t - 0.5/(waves*2)) + nx*amplitude*side + ox;
        const cpy = a.y + dy*(t - 0.5/(waves*2)) + ny*amplitude*side + oy;
        d += ' Q '+cpx+' '+cpy+' '+px+' '+py;
      }
      return d;
    }

    // Schatten
    svg.appendChild(el('path', { d: buildPath(2,3), fill:'none', stroke:'#000','stroke-width':'8', opacity:'0.1','stroke-linecap':'round' }));
    // Körper (dicker Außen)
    svg.appendChild(el('path', { d: buildPath(0,0), fill:'none', stroke:'#000','stroke-width':'8', opacity:'0.15','stroke-linecap':'round' }));
    // Körper (Farbe)
    svg.appendChild(el('path', { d: buildPath(0,0), fill:'none', stroke:color,'stroke-width':'6', opacity:'0.92','stroke-linecap':'round' }));
    // Schuppenmuster (heller Streifen)
    svg.appendChild(el('path', { d: buildPath(0,0), fill:'none', stroke:'#fff','stroke-width':'1.5',opacity:'0.25','stroke-linecap':'round','stroke-dasharray':'8 12' }));

    // Kopf (großer Kreis)
    svg.appendChild(el('circle', { cx: a.x, cy: a.y, r:'8',   fill:color, opacity:'0.97' }));
    svg.appendChild(el('circle', { cx: a.x, cy: a.y, r:'5.5', fill:'#000',opacity:'0.12' }));

    // Augen
    const enx = nx*2.8, eny = ny*2.8;
    const ebx = dx/len*2, eby = dy/len*2;
    svg.appendChild(el('circle', { cx: a.x+enx-ebx, cy: a.y+eny-eby, r:'2.2', fill:'#fff', opacity:'1' }));
    svg.appendChild(el('circle', { cx: a.x-enx-ebx, cy: a.y-eny-eby, r:'2.2', fill:'#fff', opacity:'1' }));
    svg.appendChild(el('circle', { cx: a.x+enx-ebx, cy: a.y+eny-eby, r:'1.1', fill:'#000', opacity:'0.9' }));
    svg.appendChild(el('circle', { cx: a.x-enx-ebx, cy: a.y-eny-eby, r:'1.1', fill:'#000', opacity:'0.9' }));

    // Zunge
    const tx = a.x - dx/len*10, ty = a.y - dy/len*10;
    const tongue = 'M '+a.x+' '+a.y+' L '+tx+' '+ty+
                   ' M '+(tx)+' '+ty+' L '+(tx-nx*4-dx/len*3)+' '+(ty-ny*4-dy/len*3)+
                   ' M '+(tx)+' '+ty+' L '+(tx+nx*4-dx/len*3)+' '+(ty+ny*4-dy/len*3);
    svg.appendChild(el('path', { d:tongue, fill:'none', stroke:'#FF1744','stroke-width':'1.5','stroke-linecap':'round',opacity:'0.9' }));

    // Schwanzspitze
    svg.appendChild(el('circle', { cx: b.x, cy: b.y, r:'3', fill:color, opacity:'0.7' }));
  });
}

// ── Sidebar ──────────────────────────────────────────────────
function renderTeamList() {
  const list = document.getElementById('team-list');
  list.innerHTML = '';

  gameState.turnOrder.forEach((teamIdx, orderPos) => {
    const team = gameState.teams[teamIdx];
    const card = document.createElement('div');
    card.className = 'team-card';
    card.id = 'team-card-' + teamIdx;

    card.innerHTML =
      '<span class="team-emoji">' + team.emoji + '</span>' +
      '<div class="team-info">' +
        '<div class="team-name">' + escapeHtml(team.name) + '</div>' +
        '<div class="team-pos">Feld <strong>' + team.position + '</strong></div>' +
      '</div>';
    list.appendChild(card);
  });
}

function updateTeamList() {
  gameState.turnOrder.forEach(teamIdx => {
    const team = gameState.teams[teamIdx];
    const card = document.getElementById('team-card-' + teamIdx);
    if (!card) return;
    card.querySelector('.team-pos').innerHTML = 'Feld <strong>' + team.position + '</strong>';
  });
  // Highlight active
  document.querySelectorAll('.team-card').forEach(c => c.classList.remove('active-turn'));
  const currentIdx = gameState.turnOrder[gameState.currentTurnIdx];
  const activeCard = document.getElementById('team-card-' + currentIdx);
  if (activeCard) activeCard.classList.add('active-turn');
}

function updateActiveBanner() {
  const team = getCurrentTeam();
  if (!team) return;
  const banner = document.getElementById('active-team-banner');
  const field = gameState.board[team.position];
  banner.textContent = team.emoji + ' ' + team.name + ' ist dran — Feld ' + team.position +
    ' (' + (field ? field.difficulty : '') + ')';
  banner.style.background = 'var(--bg-field-hover)';
  updateTeamList();
}

function updateDiceButton(enabled) {
  const btn = document.getElementById('btn-roll');
  btn.disabled = !enabled;
}

function getCurrentTeam() {
  const idx = gameState.turnOrder[gameState.currentTurnIdx];
  return gameState.teams[idx] || null;
}

// ── Dice Rolling ─────────────────────────────────────────────
function rollDice() {
  updateDiceButton(false);
  const display = document.getElementById('dice-display');
  display.classList.add('rolling');

  let animCount = 0;
  const animInterval = setInterval(() => {
    display.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    animCount++;
    if (animCount >= 10) {
      clearInterval(animInterval);
      display.classList.remove('rolling');
      const result = Math.floor(Math.random() * 6) + 1;
      display.textContent = DICE_FACES[result - 1];
      gameState.pendingDice = result;

      // Pick question and store in liveQuestion for multi-player sync
      const q = pickQuestion();
      if (q) {
        gameState.liveQuestion = {
          id: q.id,
          teamIdx: gameState.turnOrder[gameState.currentTurnIdx],
          diceResult: result,
          question: q,
          resolved: false,
          selectedMcIndex: null,
          autoCorrect: null
        };
        gameState.usedQuestionIds.add(q.id);
        currentQuestion = q;
        LsStorage.save(gameState);
      }

      setTimeout(() => askQuestion(q), 400);
    }
  }, 80);
}

// ── Question System ──────────────────────────────────────────
function pickQuestion() {
  const team = getCurrentTeam();
  if (!team || !activeFragenBank || !activeFragenBank.length) return null;
  const field = gameState.board[team.position];
  const difficulty = field ? field.difficulty : 'leicht';

  const available = activeFragenBank.filter(q =>
    q.schwierigkeit === difficulty && !gameState.usedQuestionIds.has(q.id)
  );
  if (available.length > 0) return available[Math.floor(Math.random() * available.length)];

  const fallback = activeFragenBank.filter(q => !gameState.usedQuestionIds.has(q.id));
  if (fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];

  // All used – reset pool
  gameState.usedQuestionIds.clear();
  const all = activeFragenBank.filter(q => q.schwierigkeit === difficulty);
  return all.length > 0 ? all[Math.floor(Math.random() * all.length)]
                        : activeFragenBank[Math.floor(Math.random() * activeFragenBank.length)];
}

function askQuestion(questionOverride) {
  // Use provided question (from rollDice or SSE) or pick a new one
  let question = questionOverride || null;
  if (!question) {
    question = pickQuestion();
    if (!question) return;
    gameState.usedQuestionIds.add(question.id);
    currentQuestion = question;
  } else {
    currentQuestion = question;
  }

  const team = getCurrentTeam();
  const field = gameState.board[team.position];
  const difficulty = (question.schwierigkeit) || (field ? field.difficulty : 'leicht');

  questionResolved = false;

  // Populate modal
  const kat = fragenBank.kategorien.find(k => k.id === question.kategorie);
  document.getElementById('q-cat-name').textContent = kat ? kat.icon + ' ' + kat.name : '';

  const diffEl = document.getElementById('q-difficulty');
  const diffLabelMap = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };
  const diffCssMap   = { leicht: 'easy',   mittel: 'medium', schwer: 'hard'   };
  diffEl.textContent = diffLabelMap[difficulty] || difficulty;
  diffEl.className = 'modal-difficulty diff-' + (diffCssMap[difficulty] || difficulty);

  document.getElementById('q-text').textContent = question.frage;

  // Timer
  const timerSecs = TIMER_SECONDS[difficulty];
  document.getElementById('q-timer-text').textContent = timerSecs + 's';
  const timerBar = document.getElementById('q-timer-bar');
  timerBar.style.width = '100%';
  timerBar.className = 'timer-bar';

  // Clear previous state
  document.getElementById('q-result').className = 'modal-result';
  document.getElementById('q-result').textContent = '';
  document.getElementById('q-explanation').className = 'modal-explanation';
  document.getElementById('q-continue').className = 'modal-continue';

  const optionsDiv = document.getElementById('q-options');
  const openSection = document.getElementById('q-open-section');

  if (question.typ === 'multiple_choice') {
    // MC answers – single or multi-correct
    openSection.style.display = 'none';
    optionsDiv.style.display = '';
    optionsDiv.innerHTML = '';
    const isMulti = Array.isArray(question.correctIndices) && question.correctIndices.length > 0;

    if (!isMulti) {
      question.antworten.forEach((ans, idx) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = ans;
        btn.onclick = () => selectAnswer(btn, idx, question);
        optionsDiv.appendChild(btn);
      });
    } else {
      // Multi-correct: toggle + confirm
      const pending = new Set();
      const allBtns = [];
      question.antworten.forEach((ans, idx) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = ans;
        btn.addEventListener('click', () => {
          if (questionResolved) return;
          if (pending.has(idx)) { pending.delete(idx); btn.classList.remove('mc-selected-pending'); }
          else { pending.add(idx); btn.classList.add('mc-selected-pending'); }
        });
        allBtns.push(btn);
        optionsDiv.appendChild(btn);
      });
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'answer-btn mc-confirm-btn';
      confirmBtn.textContent = '✓ Bestätigen';
      confirmBtn.addEventListener('click', () => {
        if (questionResolved) return;
        clearInterval(timerInterval);
        const sel = [...pending];
        const ok = isMcCorrect(question, sel);
        const cs = correctSet(question);
        allBtns.forEach(b => b.classList.add('disabled'));
        confirmBtn.classList.add('disabled');
        allBtns.forEach((b, i) => {
          if (cs.has(i)) b.classList.add('correct');
          else if (pending.has(i)) b.classList.add('wrong');
        });
        resolveQuestion(ok);
      });
      optionsDiv.appendChild(confirmBtn);
    }
  } else {
    // Open question
    optionsDiv.style.display = 'none';
    openSection.style.display = '';
    document.getElementById('q-show-answer').style.display = '';
    document.getElementById('q-open-answer').style.display = 'none';
    document.getElementById('q-open-answer').textContent = question.erklaerung || 'Keine Antwort hinterlegt';
    document.getElementById('q-open-actions').style.display = 'none';
  }

  // Start timer
  startTimer(timerSecs);

  // Show modal
  document.getElementById('question-modal').classList.add('open');
}

function startTimer(seconds) {
  timerRemaining = seconds;
  const total = seconds;
  const timerBar = document.getElementById('q-timer-bar');
  const timerText = document.getElementById('q-timer-text');

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerRemaining--;
    const pct = (timerRemaining / total) * 100;
    timerBar.style.width = pct + '%';
    timerText.textContent = timerRemaining + 's';

    if (timerRemaining <= 10) timerBar.className = 'timer-bar warning';
    if (timerRemaining <= 5) timerBar.className = 'timer-bar danger';

    if (timerRemaining <= 0) {
      clearInterval(timerInterval);
      if (!questionResolved) {
        resolveQuestion(false);
      }
    }
  }, 1000);
}

function selectAnswer(btn, idx, question) {
  if (questionResolved) return;
  clearInterval(timerInterval);

  const correct = idx === question.richtig;
  const cs = correctSet(question);
  const buttons = document.querySelectorAll('#q-options .answer-btn');

  buttons.forEach((b, i) => {
    b.classList.add('disabled');
    if (cs.has(i)) b.classList.add('correct');
    if (i === idx && !correct) b.classList.add('wrong');
  });

  resolveQuestion(correct);
}

function showOpenAnswer() {
  clearInterval(timerInterval);
  document.getElementById('q-show-answer').style.display = 'none';
  document.getElementById('q-open-answer').style.display = 'block';
  document.getElementById('q-open-actions').style.display = '';
}

function resolveOpen(correct) {
  if (questionResolved) return;
  clearInterval(timerInterval);
  document.getElementById('q-open-actions').style.display = 'none';
  resolveQuestion(correct);
}

async function resolveQuestion(correct) {
  if (questionResolved) return;
  questionResolved = true;

  // Schüler-initiierte Frage (per SSE geöffnet): frisch laden. Hat das
  // Schülergerät die Frage bereits selbst ausgewertet, hier abbrechen —
  // sonst werden Punkte/Bewegung doppelt angewendet (Last-Write-Wins).
  if (gameState.liveQuestion && _lastSSELiveQId !== null &&
      gameState.liveQuestion.id === _lastSSELiveQId) {
    try {
      const fresh = await LsStorage.load(LsStorage.getCode());
      if (fresh && (fresh.phase === 'finished' || !fresh.liveQuestion || fresh.liveQuestion.resolved)) {
        clearInterval(timerInterval);
        document.getElementById('question-modal').classList.remove('open');
        return; // Board-Update kommt über den SSE-Pfad (lq-cleared)
      }
    } catch { }
  }

  const team = getCurrentTeam();
  const field = gameState.board[team.position];

  const resultEl = document.getElementById('q-result');
  if (correct) {
    resultEl.textContent = '✓ Richtig!';
    resultEl.className = 'modal-result visible correct-result';
    team.score += POINTS[field.difficulty];
    team.correctCount++;
  } else {
    resultEl.textContent = '✗ Falsch!';
    resultEl.className = 'modal-result visible wrong-result';
    team.wrongCount++;
  }

  if (currentQuestion && currentQuestion.erklaerung) {
    document.getElementById('q-explanation-text').textContent = currentQuestion.erklaerung;
    document.getElementById('q-explanation').classList.add('visible');
  }

  gameState.lastAnswerCorrect = correct;
  if (gameState.liveQuestion) {
    gameState.liveQuestion.resolved = true;
    gameState.liveQuestion.autoCorrect = correct;
  }
  LsStorage.save(gameState);

  document.getElementById('q-continue').classList.add('visible');
}

function continueAfterQuestion() {
  document.getElementById('question-modal').classList.remove('open');
  clearInterval(timerInterval);

  if (gameState.lastAnswerCorrect) {
    // Move team
    moveTeam();
  } else {
    // Stay in place, next turn
    nextTurn();
  }
}

// ── Movement ─────────────────────────────────────────────────
function moveTeam() {
  const team = getCurrentTeam();
  const dice = gameState.pendingDice;
  const maxField = getFieldCount();
  const newPos = team.position + dice;

  if (newPos > maxField) {
    // Too high - stay in place
    updateActiveBanner();
    nextTurn();
    return;
  }

  team.position = newPos;
  updatePieces();
  updateTeamList();

  // Check win
  if (newPos === maxField) {
    setTimeout(() => showWinner(), 500);
    return;
  }

  // Check ladder or snake
  const field = gameState.board[newPos];
  if (field.ladderTo) {
    setTimeout(() => {
      team.position = field.ladderTo;
      updatePieces();
      updateTeamList();
      afterLanding();
    }, 600);
  } else if (field.snakeTo) {
    setTimeout(() => {
      team.position = field.snakeTo;
      updatePieces();
      updateTeamList();
      afterLanding();
    }, 600);
  } else {
    afterLanding();
  }
}

function afterLanding() {
  const team = getCurrentTeam();
  const field = gameState.board[team.position];

  // Check win after ladder
  if (team.position === getFieldCount()) {
    setTimeout(() => showWinner(), 300);
    return;
  }

  // Check bonus
  if (field.bonusType) {
    pendingBonusAfterMove = field.bonusType;
    setTimeout(() => showBonusModal(field.bonusType), 400);
  } else {
    nextTurn();
  }
}

// ── Bonus System ─────────────────────────────────────────────
function showBonusModal(type) {
  const modal = document.getElementById('bonus-modal');
  const iconEl = document.getElementById('bonus-icon');
  const titleEl = document.getElementById('bonus-title');
  const descEl = document.getElementById('bonus-desc');
  const swapDiv = document.getElementById('swap-teams');
  const continueBtn = document.getElementById('bonus-continue');

  swapDiv.style.display = 'none';
  swapDiv.innerHTML = '';
  continueBtn.style.display = '';

  if (type === 'roll_again') {
    iconEl.textContent = '🎲';
    titleEl.textContent = 'Nochmals würfeln!';
    descEl.textContent = 'Du darfst sofort noch einmal würfeln und eine Frage beantworten!';
  } else if (type === 'free_move') {
    iconEl.textContent = '🎁';
    titleEl.textContent = 'Freie Bewegung!';
    descEl.textContent = 'Würfle und bewege dich – ohne eine Frage beantworten zu müssen!';
  } else if (type === 'swap') {
    iconEl.textContent = '🔄';
    titleEl.textContent = 'Positionstausch!';
    descEl.textContent = 'Wähle eine andere Gruppe, mit der du die Position tauschen möchtest!';

    if (gameState.singlePlayerMode || gameState.teams.length <= 1) {
      descEl.textContent = 'Im Einzelspielermodus hast du stattdessen nochmal Würfeln!';
      pendingBonusAfterMove = 'roll_again';
    } else {
      const currentTeamIdx = gameState.turnOrder[gameState.currentTurnIdx];
      swapDiv.style.display = '';
      continueBtn.style.display = 'none';

      gameState.teams.forEach((team, idx) => {
        if (idx === currentTeamIdx) return;
        const btn = document.createElement('button');
        btn.className = 'swap-team-btn';
        btn.innerHTML = '<span style="font-size:1.3rem">' + team.emoji + '</span> ' +
          escapeHtml(team.name) + ' <span style="color:var(--text-light);font-size:0.85rem">(Feld ' + team.position + ')</span>';
        btn.onclick = () => executeSwap(idx);
        swapDiv.appendChild(btn);
      });
    }
  }

  modal.classList.add('open');
}

function executeSwap(otherTeamIdx) {
  const currentTeamIdx = gameState.turnOrder[gameState.currentTurnIdx];
  const currentTeam = gameState.teams[currentTeamIdx];
  const otherTeam = gameState.teams[otherTeamIdx];

  const tempPos = currentTeam.position;
  currentTeam.position = otherTeam.position;
  otherTeam.position = tempPos;

  updatePieces();
  updateTeamList();

  document.getElementById('bonus-modal').classList.remove('open');
  nextTurn();
}

function continueAfterBonus() {
  document.getElementById('bonus-modal').classList.remove('open');
  const type = pendingBonusAfterMove;
  pendingBonusAfterMove = null;

  if (type === 'roll_again') {
    // Same team rolls again
    updateActiveBanner();
    updateDiceButton(true);
  } else if (type === 'free_move') {
    // Roll without question
    freeMove();
  } else {
    nextTurn();
  }
}

function freeMove() {
  updateDiceButton(false);
  const display = document.getElementById('dice-display');
  display.classList.add('rolling');

  let animCount = 0;
  const animInterval = setInterval(() => {
    display.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    animCount++;
    if (animCount >= 10) {
      clearInterval(animInterval);
      display.classList.remove('rolling');
      const result = Math.floor(Math.random() * 6) + 1;
      display.textContent = DICE_FACES[result - 1];
      gameState.pendingDice = result;

      const team = getCurrentTeam();
      const maxField = getFieldCount(); // Custom-Boards haben ≠100 Felder
      const newPos = team.position + result;
      if (newPos > maxField) {
        nextTurn();
        return;
      }

      team.position = newPos;
      updatePieces();
      updateTeamList();

      if (newPos === maxField) {
        setTimeout(() => showWinner(), 500);
        return;
      }

      const field = gameState.board[newPos];
      if (field.ladderTo) {
        setTimeout(() => {
          team.position = field.ladderTo;
          updatePieces();
          updateTeamList();
          if (team.position === 100) { showWinner(); return; }
          nextTurn();
        }, 600);
      } else if (field.snakeTo) {
        setTimeout(() => {
          team.position = field.snakeTo;
          updatePieces();
          updateTeamList();
          nextTurn();
        }, 600);
      } else {
        nextTurn();
      }
    }
  }, 80);
}

// ── Turn Management ──────────────────────────────────────────
function nextTurn() {
  gameState.currentTurnIdx = (gameState.currentTurnIdx + 1) % gameState.turnOrder.length;
  gameState.pendingDice = null;
  gameState.liveQuestion = null;

  document.getElementById('dice-display').textContent = '🎲';

  updateActiveBanner();
  updatePieces();
  updateDiceButton(true);
  LsStorage.save(gameState);
}

// ── Winner ───────────────────────────────────────────────────
function showWinner() {
  gameState.phase = 'finished';
  gameState.liveQuestion = null;
  LsStorage.save(gameState);
  const team = getCurrentTeam();

  document.getElementById('winner-team-name').textContent = team.emoji + ' ' + team.name;

  const statsEl = document.getElementById('winner-stats');
  statsEl.innerHTML = '';
  const stats = [
    { label: 'Richtig', value: team.correctCount },
    { label: 'Falsch', value: team.wrongCount },
    { label: 'Endfeld', value: team.position }
  ];
  stats.forEach(s => {
    const div = document.createElement('div');
    div.className = 'winner-stat';
    div.innerHTML = '<div class="winner-stat-value">' + s.value + '</div>' +
                    '<div class="winner-stat-label">' + s.label + '</div>';
    statsEl.appendChild(div);
  });

  showScreen('winner-screen');
  spawnConfetti();
}

function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  const colors = ['#ef5350','#66bb6a','#fdd835','#42a5f5','#ab47bc','#ff9800'];
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

// ── Spielwähler ──────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function showGameSelector() {
  showScreen('game-selector');
  const list = document.getElementById('gs-game-list');
  list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">Lade Spiele…</p>';
  const registry = await LsStorage.loadGamesRegistry();
  const entries = Object.entries(registry);
  if (entries.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">Noch keine Spiele vorhanden.</p>';
    return;
  }
  entries.sort((a,b) => (b[1].updatedAt||b[1].createdAt||'').localeCompare(a[1].updatedAt||a[1].createdAt||''));
  list.innerHTML = entries.map(([code, info]) => {
    const statusLabel = info.status==='playing' ? '🟢 Läuft' :
                        info.status==='finished' ? '🏁 Beendet' :
                        info.status==='dice-order' ? '🎲 Startreihe' : '⚙ Setup';
    const date = info.updatedAt ? new Date(info.updatedAt).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    let expiryHint = '';
    const ts = info.updatedAt || info.createdAt;
    if (ts) {
      const remaining = 24*60*60*1000 - (Date.now() - new Date(ts).getTime());
      if (remaining > 0) {
        const h = Math.floor(remaining/3600000);
        const m = Math.floor((remaining%3600000)/60000);
        expiryHint = ` · ${h}h ${m}m übrig`;
      }
    }
    return `<div class="gs-game-card" onclick="window._gsEnter('${code}')">
      <div class="gs-game-code">${code}</div>
      <div class="gs-game-info">
        <div class="gs-game-title">${escapeHtml(info.title||'Schlangen & Leitern')}</div>
        <div class="gs-game-meta">${statusLabel} · ${date}${expiryHint}</div>
      </div>
      <div class="gs-game-actions">
        <button class="gs-btn-delete" onclick="event.stopPropagation();window._gsDelete('${code}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function _gsEnter(code) {
  LsStorage.setCode(code);
  const gs = await LsStorage.load(code);
  if (!gs) { alert('Spiel nicht gefunden.'); showGameSelector(); return; }
  window.history.replaceState({}, '', 'index.html?code=' + code);
  gameState = gs;

  // Restore custom board from server/localStorage if this game used one
  if (gs.customBoardId) {
    const boards = await _lsBoardsLoad();
    _customBoard = boards.find(b => b.id === gs.customBoardId) || null;
  } else {
    _customBoard = null;
  }

  if (gs.phase === 'playing') {
    if (gs.activeCategoryIds && fragenBank) {
      selectedCategoryIds = new Set(gs.activeCategoryIds);
      activeFragenBank = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie));
    }
    showScreen('game-screen');
    renderBoard();
    renderTeamList();
    updateActiveBanner();
    showCodeBanner();
    if (!_customBoard) { drawLaddersAndSnakes(); window.addEventListener('resize', drawLaddersAndSnakes); }
    // Nach Reload: laufende Frage wiederherstellen statt Würfel dauerhaft zu sperren
    if (gs.liveQuestion && !gs.liveQuestion.resolved) {
      _lastSSELiveQId = gs.liveQuestion.id;
      questionResolved = false;
      currentQuestion = gs.liveQuestion.question;
      updateDiceButton(false);
      askQuestion(gs.liveQuestion.question);
    } else {
      // Hängengebliebene aufgelöste Frage verwerfen und Würfeln erlauben
      if (gs.liveQuestion) { gameState.liveQuestion = null; LsStorage.save(gameState); }
      updateDiceButton(true);
    }
    startSSESubscription();

  } else if (gs.phase === 'dice-order') {
    if (gs.activeCategoryIds && fragenBank) {
      selectedCategoryIds = new Set(gs.activeCategoryIds);
      activeFragenBank = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie));
    }
    showScreen('dice-order-screen');
    initDiceOrder();
    showCodeBanner();
    startSSESubscription();

  } else {
    // phase='setup' oder unbekannt → Setup-Screen
    showScreen('setup-screen');
    const titleEl = document.getElementById('setup-game-title');
    if (titleEl && gs.meta && gs.meta.title && gs.meta.title !== 'Schlangen & Leitern') titleEl.value = gs.meta.title;
    showCodeBanner();
  }
}

async function _gsDelete(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await LsStorage.deleteGame(code);
  showGameSelector();
}

async function createNewGame() {
  const code = LsStorage.generateCode();
  LsStorage.setCode(code);
  const skeleton = {
    meta: { gameCode: code, title: 'Schlangen & Leitern', createdAt: new Date().toISOString() },
    phase: 'setup', teams: [], usedQuestionIds: new Set(), liveQuestion: null
  };
  await LsStorage.save(skeleton);
  window.history.replaceState({}, '', 'index.html?code=' + code);
  showScreen('setup-screen');
  document.getElementById('setup-game-title').value = '';
  showCodeBanner();
}

// ── Custom Board Picker ───────────────────────────────────────
async function openCustomBoardPicker() {
  const modal = document.getElementById('cb-modal');
  const list = document.getElementById('cb-modal-list');
  if (!modal || !list) return;
  list.innerHTML = '<p style="color:var(--text-secondary,#a8a8b3);font-style:italic;font-size:0.85rem;">Lade…</p>';
  modal.style.display = 'flex';
  const boards = await _lsBoardsLoad();
  list.innerHTML = '';
  if (boards.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary,#a8a8b3);font-style:italic;font-size:0.85rem;">Keine Bretter gespeichert. Erstelle eines im Brett-Designer.</p>';
  } else {
    boards.slice().reverse().forEach(b => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.75rem;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:rgba(255,255,255,0.04);cursor:pointer;';
      item.innerHTML = '<span style="font-size:1.1rem;">🗺️</span><div style="flex:1"><div style="font-weight:700;font-size:0.9rem;color:var(--text-primary,#fff);">' + escapeHtml(b.name || 'Brett') + '</div><div style="font-size:0.78rem;color:var(--text-secondary,#a8a8b3);">' + b.fields.length + ' Felder · ' + (b.ladders.length + b.snakes.length) + ' Verbindungen</div></div>';
      item.addEventListener('mouseenter', () => item.style.borderColor = 'var(--accent,#e94560)');
      item.addEventListener('mouseleave', () => item.style.borderColor = 'rgba(255,255,255,0.1)');
      item.addEventListener('click', () => {
        selectedCustomBoardId = b.id;
        const nameEl = document.getElementById('custom-board-name');
        if (nameEl) nameEl.textContent = b.name || 'Brett';
        const preview = document.getElementById('custom-board-preview');
        if (preview) preview.style.display = 'flex';
        const btn = document.getElementById('btn-custom-board');
        if (btn) btn.textContent = 'Brett ändern…';
        modal.style.display = 'none';
      });
      list.appendChild(item);
    });
  }
}

function clearCustomBoard() {
  selectedCustomBoardId = null;
  const preview = document.getElementById('custom-board-preview');
  if (preview) preview.style.display = 'none';
  const btn = document.getElementById('btn-custom-board');
  if (btn) btn.textContent = 'Brett wählen…';
}

window.openCustomBoardPicker = openCustomBoardPicker;
window.clearCustomBoard = clearCustomBoard;

// onclick-Strings in gs-game-card verwenden window._gsEnter / window._gsDelete
window._gsEnter = _gsEnter;
window._gsDelete = _gsDelete;

async function enterGame(code) {
  await _gsEnter(code);
}

// ── Reset & Quit ─────────────────────────────────────────────
function resetToSetup() {
  if (lsSub) { lsSub.unsubscribe(); lsSub = null; }
  gameState.phase = 'setup';
  gameState.teams = [];
  gameState.turnOrder = [];
  gameState.currentTurnIdx = 0;
  gameState.usedQuestionIds = new Set();
  gameState.pendingDice = null;
  gameState.liveQuestion = null;
  LsStorage.setCode(null);
  window.removeEventListener('resize', drawLaddersAndSnakes);
  // Clean up custom board state
  _customBoard = null;
  selectedCustomBoardId = null;
  const container = document.querySelector('.board-container');
  if (container) {
    container.classList.remove('is-custom');
    container.style.removeProperty('--custom-ar');
  }
  const grid = document.getElementById('board-grid');
  if (grid) grid.style.display = '';
  const banner = document.getElementById('ls-code-banner');
  if (banner) banner.remove();
  window.history.replaceState({}, '', 'index.html');
  showGameSelector();
}

function confirmQuit() {
  if (confirm('Spiel wirklich beenden?')) {
    resetToSetup();
  }
}

// ── Multi-Player: SSE + Code-Banner ──────────────────────────

function showCodeBanner() {
  const code = LsStorage.getCode();
  if (!code) return;
  const existing = document.getElementById('ls-code-banner');
  if (existing) { existing.querySelector('.ls-code-val').textContent = code; return; }

  const banner = document.createElement('div');
  banner.id = 'ls-code-banner';
  banner.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999;background:var(--bg-field,#2d4a7a);color:var(--text-primary,#fff);border-radius:12px;padding:10px 16px;font-size:0.85rem;box-shadow:0 2px 12px rgba(0,0,0,.4);display:flex;align-items:center;gap:10px;';
  const viewUrl = 'view.html?code=' + code;
  banner.innerHTML =
    '<span>📱 Schüler:</span>' +
    '<strong class="ls-code-val" style="font-size:1.2rem;letter-spacing:2px">' + code + '</strong>' +
    '<a href="' + viewUrl + '" target="_blank" style="color:var(--accent,#e94560);font-size:0.8rem;text-decoration:none">Link ↗</a>';
  document.body.appendChild(banner);
}

function startSSESubscription() {
  const code = LsStorage.getCode();
  if (!code) return;
  if (lsSub) { lsSub.unsubscribe(); lsSub = null; }

  lsSub = LsStorage.subscribe(code, onSSEUpdate);
}

let _lastSSEPhase = null;
let _lastSSELiveQId = null;

function onSSEUpdate(newGs) {
  // Remote-Sieg: Schülergerät hat phase='finished' gespeichert. Ohne diese
  // Behandlung bleibt das Frage-Modal samt Timer offen, und der spätere
  // Timer-Ablauf speichert den lokalen (veralteten) Stand mit phase='playing'
  // zurück — der Sieg des Schülers würde rückgängig gemacht.
  if (newGs.phase === 'finished' && gameState && gameState.phase === 'playing') {
    clearInterval(timerInterval);
    questionResolved = true;
    _lastSSELiveQId = null;
    const modal = document.getElementById('question-modal');
    if (modal && modal.classList.contains('open')) modal.classList.remove('open');
    // Positionen/Scores des Siegzugs übernehmen
    (newGs.teams || []).forEach((t, i) => {
      if (gameState.teams[i]) {
        gameState.teams[i].position = t.position;
        gameState.teams[i].score = t.score;
        gameState.teams[i].correctCount = t.correctCount;
        gameState.teams[i].wrongCount = t.wrongCount;
      }
    });
    gameState.liveQuestion = null;
    gameState.pendingDice = null;
    // currentTurnIdx auf das Siegerteam stellen, damit showWinner() es anzeigt
    const maxField = getFieldCount();
    const winTeamIdx = gameState.teams.findIndex(t => t.position === maxField);
    const winTurnIdx = winTeamIdx >= 0 ? gameState.turnOrder.indexOf(winTeamIdx) : -1;
    if (winTurnIdx >= 0) gameState.currentTurnIdx = winTurnIdx;
    updatePieces();
    updateTeamList();
    showWinner();
    return;
  }

  // Only react when we're in game/dice-order phase and the update came from ANOTHER device
  if (newGs.phase !== 'playing' && newGs.phase !== 'dice-order') return;

  // Sync positions and scores (non-disruptive)
  if (newGs.phase === 'playing') {
    if (gameState.phase !== 'playing') return;

    // Sync team positions and scores
    newGs.teams.forEach((t, i) => {
      if (gameState.teams[i]) {
        gameState.teams[i].position = t.position;
        gameState.teams[i].score = t.score;
        gameState.teams[i].correctCount = t.correctCount;
        gameState.teams[i].wrongCount = t.wrongCount;
      }
    });
    gameState.currentTurnIdx = newGs.currentTurnIdx;
    gameState.pendingDice = newGs.pendingDice;

    // React to a new liveQuestion (student rolled dice)
    const lq = newGs.liveQuestion;
    const lqChanged = lq && lq.id !== _lastSSELiveQId;

    if (lqChanged && !lq.resolved) {
      questionResolved = false;
      _lastSSELiveQId = lq.id;
      gameState.liveQuestion = lq;
      gameState.usedQuestionIds = newGs.usedQuestionIds;
      updatePieces();
      updateActiveBanner();

      // Show question modal if not already open
      const modal = document.getElementById('question-modal');
      if (!modal.classList.contains('open')) {
        currentQuestion = lq.question;
        askQuestion(lq.question);
      }
    }

    // React to liveQuestion cleared (student handled movement)
    if (!lq && _lastSSELiveQId !== null) {
      _lastSSELiveQId = null;
      gameState.liveQuestion = null;
      gameState.currentTurnIdx = newGs.currentTurnIdx;
      newGs.teams.forEach((t, i) => {
        if (gameState.teams[i]) {
          gameState.teams[i].position = t.position;
          gameState.teams[i].score = t.score;
          gameState.teams[i].correctCount = t.correctCount;
          gameState.teams[i].wrongCount = t.wrongCount;
        }
      });
      updatePieces();
      updateActiveBanner();
      updateTeamList();
      if (!questionResolved) {
        // Student answered first — close teacher modal without resolving again
        const modal = document.getElementById('question-modal');
        if (modal.classList.contains('open')) modal.classList.remove('open');
        clearInterval(timerInterval);
      }
      document.getElementById('dice-display').textContent = '🎲';
      updateDiceButton(true);
    }
  }
}

// ── Utility ──────────────────────────────────────────────────
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
