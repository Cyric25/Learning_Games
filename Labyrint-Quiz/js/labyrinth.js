/* labyrinth.js – Lehrerboard v3 (multi-device, SSE) */

// ── Konstanten ───────────────────────────────────────────────────
const TEAM_SYMBOL_ICONS = ['👑', '⚔️', '💎', '🔮', '🗝️', '📜'];
const TEAM_COLORS = ['#1a3a8f', '#8f1a1a', '#1a6b1a', '#6b1a6b', '#8f5a1a', '#1a6b6b'];
const TEAM_EMOJIS = ['🛡️', '🐉', '🦉', '🦊', '🧙', '🤖'];
const DEFAULT_NAMES = ['Ritter', 'Drachen', 'Eulen', 'Füchse', 'Magier', 'Roboter'];
const DICE_CHARS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ── GameSync ──────────────────────────────────────────────────────
const GameSync = {
  _es: null, _poll: null,
  hasServer() { return location.protocol !== 'file:'; },
  _url(s, code) {
    const base = location.pathname.includes('/Labyrint-Quiz/') ? '../api.php' : './api.php';
    return base + '?f=labyrinth-' + s + (code ? '&code=' + encodeURIComponent(code) : '');
  },
  async load(code) {
    if (this.hasServer()) {
      try { const r = await fetch(this._url('game', code)); if (r.ok) { const d = await r.json(); if (d.meta) return d; } } catch {}
    }
    try { const s = localStorage.getItem('lab_' + code); return s ? JSON.parse(s) : null; } catch { return null; }
  },
  async save(code, state) {
    try { localStorage.setItem('lab_' + code, JSON.stringify(state)); } catch {}
    if (!this.hasServer()) return;
    try { await fetch(this._url('game', code), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(state) }); } catch {}
  },
  subscribe(code, cb) {
    this.unsubscribe();
    if (this.hasServer()) {
      const es = new EventSource(this._url('sse', code));
      es.onmessage = e => { try { const d = JSON.parse(e.data); if (d.meta) cb(d); } catch {} };
      es.addEventListener('reconnect', () => { es.close(); setTimeout(() => this.subscribe(code, cb), 200); });
      es.onerror = () => { es.close(); this._es = null; this._startPoll(code, cb); };
      this._es = es;
    } else { this._startPoll(code, cb); }
  },
  _startPoll(code, cb) {
    if (this._poll) return;
    this._poll = setInterval(async () => { const d = await this.load(code); if (d) cb(d); }, 1500);
  },
  unsubscribe() {
    if (this._es) { this._es.close(); this._es = null; }
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
  }
};

// ── State ─────────────────────────────────────────────────────────
let allQuestions = [];
let rawCategories = [];  // original hierarchical structure
let activeCategories = new Set();
let gameCode = null;
let localGrid = null;   // regeneriert aus seed
let gameState = null;   // vom Server
let renderer = null;

// ── Init ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadQuestions();
  buildSetupUI();
});

// ── Fragen laden ──────────────────────────────────────────────────
async function loadQuestions() {
  let data = null;
  // Skip fetch on file:// to avoid CORS errors; use localStorage directly
  if (location.protocol !== 'file:') {
    try { const r = await fetch('../api.php?f=questions'); if (r.ok) data = await r.json(); } catch {}
    if (!data) { try { const r = await fetch('../data/questions.json'); if (r.ok) data = await r.json(); } catch {} }
  }
  if (!data) { const c = localStorage.getItem('rq_questions'); if (c) try { data = JSON.parse(c); } catch {} }
  if (!data) data = { categories: [] };
  rawCategories = data.categories || [];
  allQuestions = convertRQtoLabyrinth(data);
}

function convertRQtoLabyrinth(rqData) {
  const fragen = [];
  function walk(cat, path) {
    if (cat.subcategories?.length) {
      cat.subcategories.forEach(s => walk(s, path ? `${path} › ${cat.name}` : cat.name));
    } else {
      const full = path ? `${path} › ${cat.name}` : cat.name;
      (cat.questions || []).forEach(q => {
        const diff = q.difficulty <= 200 ? 'leicht' : q.difficulty >= 400 ? 'schwer' : 'mittel';
        fragen.push({ ...q, kategorieId: cat.id, kategorieName: full, schwierigkeit: diff,
          type: q.type === 'mc' ? 'multiple_choice' : 'offen' });
      });
    }
  }
  (rqData.categories || []).forEach(c => walk(c, ''));
  return fragen;
}

// ── Join Screen ───────────────────────────────────────────────────
function showSetup() {
  showScreen('setup-screen');
  buildSetupUI();
}

async function joinWithCode() {
  const input = document.getElementById('join-code');
  const code = (input?.value || '').trim().toUpperCase();
  const errEl = document.getElementById('join-error');
  errEl.textContent = '';

  if (!code || code.length < 4) { errEl.textContent = 'Bitte einen 4-stelligen Code eingeben.'; return; }

  const state = await GameSync.load(code);
  if (!state?.meta) { errEl.textContent = `Spiel "${code}" nicht gefunden.`; return; }

  window.location.href = 'play.html?code=' + code;
}

// ── Setup UI ──────────────────────────────────────────────────────
function buildSetupUI() {
  buildCategoryUI(); buildTeamCountUI(); buildTeamConfigUI(); buildSymbolsUI(); buildTimerUI();
}

const CAT_ICONS = ['🧪','🧬','⚗️','🔬','🌍','📐','💡','🎯','📚','🏛️','🎨','⚡'];

function buildCategoryUI() {
  const sec = document.getElementById('category-section');
  const list = document.getElementById('cat-select-list');
  if (!rawCategories.length) { if (sec) sec.style.display = 'none'; return; }
  if (sec) sec.style.display = '';
  list.innerHTML = '';

  // Initialize all leaf categories as active
  activeCategories.clear();
  function collectLeaves(cat) {
    if (cat.subcategories?.length) { cat.subcategories.forEach(collectLeaves); }
    else { activeCategories.add(cat.id); }
  }
  rawCategories.forEach(collectLeaves);

  rawCategories.forEach((cat, ci) => _buildCatNode(list, cat, CAT_ICONS[ci % CAT_ICONS.length], 0));
  updateCategoryInfo();
}

function _buildCatNode(container, cat, icon, depth) {
  const subs = cat.subcategories || [];
  if (!subs.length) {
    // Leaf category — checkable item
    const qCount = allQuestions.filter(q => q.kategorieId === cat.id).length;
    const item = document.createElement('div');
    item.className = 'cat-select-item selected';
    item.dataset.catId = cat.id;
    if (depth > 0) item.style.marginLeft = (depth * 1.2) + 'rem';
    item.innerHTML =
      '<span class="cat-select-icon">' + icon + '</span>' +
      '<span class="cat-select-name">' + cat.name + '</span>' +
      '<span class="cat-select-count">' + qCount + '</span>' +
      '<div class="cat-select-check">✓</div>';
    item.onclick = () => {
      if (activeCategories.has(cat.id)) { activeCategories.delete(cat.id); item.classList.remove('selected'); }
      else { activeCategories.add(cat.id); item.classList.add('selected'); }
      _syncGroupHeader(item.closest('.cat-group-wrap'));
      updateCategoryInfo();
    };
    container.appendChild(item);
    return;
  }

  // Non-leaf — accordion group
  const wrap = document.createElement('div');
  wrap.className = 'cat-group-wrap';

  const qTotal = _countLeafQ(cat);
  const header = document.createElement('div');
  header.className = 'cat-group-header';
  header.innerHTML =
    '<span class="cat-group-chevron">▼</span>' +
    '<span class="cat-group-icon">' + icon + '</span>' +
    '<span class="cat-group-name">' + cat.name + '</span>' +
    '<span class="cat-group-count">' + qTotal + ' Fragen</span>' +
    '<label class="cat-group-toggle" onclick="event.stopPropagation()">' +
      '<input type="checkbox" checked class="cat-group-cb">' +
    '</label>';

  const children = document.createElement('div');
  children.className = 'cat-group-children';
  subs.forEach(s => _buildCatNode(children, s, icon, depth + 1));

  // Group checkbox toggles all leaves inside
  header.querySelector('.cat-group-cb').addEventListener('change', e => {
    const on = e.target.checked;
    children.querySelectorAll('.cat-select-item').forEach(item => {
      on ? activeCategories.add(item.dataset.catId) : activeCategories.delete(item.dataset.catId);
      item.classList.toggle('selected', on);
    });
    updateCategoryInfo();
  });

  // Header click expands/collapses
  header.addEventListener('click', e => {
    if (e.target.closest('label')) return;
    const collapsed = header.classList.toggle('collapsed');
    children.classList.toggle('hidden', collapsed);
  });

  wrap.appendChild(header);
  wrap.appendChild(children);
  container.appendChild(wrap);
}

function _countLeafQ(cat) {
  if (!cat.subcategories?.length) return allQuestions.filter(q => q.kategorieId === cat.id).length;
  return (cat.subcategories || []).reduce((s, c) => s + _countLeafQ(c), 0);
}

function _syncGroupHeader(wrap) {
  if (!wrap) return;
  const items = [...wrap.querySelectorAll('.cat-select-item')];
  const allSel = items.length > 0 && items.every(i => i.classList.contains('selected'));
  const cb = wrap.querySelector('.cat-group-cb');
  if (cb) cb.checked = allSel;
  const parentWrap = wrap.parentElement?.closest('.cat-group-wrap');
  if (parentWrap) _syncGroupHeader(parentWrap);
}

function toggleAllCategories(on) {
  document.querySelectorAll('#cat-select-list .cat-select-item').forEach(item => {
    on ? activeCategories.add(item.dataset.catId) : activeCategories.delete(item.dataset.catId);
    item.classList.toggle('selected', on);
  });
  document.querySelectorAll('#cat-select-list .cat-group-cb').forEach(cb => { cb.checked = on; });
  updateCategoryInfo();
}

function updateCategoryInfo() {
  const el = document.getElementById('cat-select-info'); if (!el) return;
  const n = allQuestions.filter(q => activeCategories.has(q.kategorieId)).length;
  el.textContent = `${n} Fragen aus ${activeCategories.size} Kategorien`;
}

let _cfg = { teamCount: 4, symbolsPerTeam: 7, timerSeconds: 20 };

function buildTeamCountUI() {
  const row = document.getElementById('team-count-row'); row.innerHTML = '';
  [2,3,4,5,6].forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (n === _cfg.teamCount ? ' active' : ''); btn.textContent = n;
    btn.onclick = () => { _cfg.teamCount = n; row.querySelectorAll('.param-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); buildTeamConfigUI(); };
    row.appendChild(btn);
  });
}

function buildTeamConfigUI() {
  const list = document.getElementById('team-config-list'); list.innerHTML = '';
  for (let i = 0; i < _cfg.teamCount; i++) {
    const row = document.createElement('div'); row.className = 'team-config-row';
    const em = document.createElement('span'); em.className = 'team-config-emoji'; em.textContent = TEAM_EMOJIS[i]; em.style.color = TEAM_COLORS[i];
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'team-name-input'; inp.value = DEFAULT_NAMES[i]; inp.maxLength = 20;
    row.appendChild(em); row.appendChild(inp); list.appendChild(row);
  }
}

function buildSymbolsUI() {
  const row = document.getElementById('symbols-per-team-row'); if (!row) return; row.innerHTML = '';
  [6,7,8].forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (n === _cfg.symbolsPerTeam ? ' active' : ''); btn.textContent = n;
    btn.onclick = () => { _cfg.symbolsPerTeam = n; row.querySelectorAll('.param-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); };
    row.appendChild(btn);
  });
}

function buildTimerUI() {
  const row = document.getElementById('timer-row'); row.innerHTML = '';
  [{label:'15s',v:15},{label:'20s',v:20},{label:'30s',v:30},{label:'Kein',v:0}].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (opt.v === _cfg.timerSeconds ? ' active' : ''); btn.textContent = opt.label;
    btn.onclick = () => { _cfg.timerSeconds = opt.v; row.querySelectorAll('.param-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); };
    row.appendChild(btn);
  });
}

// ── Spiel starten ─────────────────────────────────────────────────
async function startGame() {
  const errEl = document.getElementById('setup-error'); errEl.textContent = '';

  if (activeCategories.size === 0) { errEl.textContent = 'Bitte mindestens eine Kategorie auswählen.'; return; }
  const avail = allQuestions.filter(q => activeCategories.has(q.kategorieId)).length;
  const needed = _cfg.teamCount * _cfg.symbolsPerTeam;
  if (avail < needed) { errEl.textContent = `Zu wenig Fragen (${avail}/${needed}).`; return; }

  const inputs = document.querySelectorAll('.team-name-input');
  const teams = [];
  for (let i = 0; i < _cfg.teamCount; i++) {
    teams.push({ id: i, name: inputs[i]?.value.trim() || DEFAULT_NAMES[i],
      emoji: TEAM_EMOJIS[i], symbolIcon: TEAM_SYMBOL_ICONS[i], color: TEAM_COLORS[i],
      x: 0, y: 0, score: 0, symbolsFound: 0 });
  }

  const seed = Date.now() & 0x7fffffff;
  const config = { teamCount: _cfg.teamCount, symbolsPerTeam: _cfg.symbolsPerTeam, timerSeconds: _cfg.timerSeconds, kategorien: [...activeCategories] };

  // Generate maze deterministically
  const gen = new MazeGenerator(16, 16, seed);
  const mazeResult = gen.generate({ doorCount: 14, teamCount: _cfg.teamCount });
  mazeResult.startPositions.forEach((pos, i) => { if (teams[i]) { teams[i].x = pos.x; teams[i].y = pos.y; } });

  // Place symbols deterministically
  const symbols = placeTeamSymbols(mazeResult.grid, teams, _cfg.symbolsPerTeam, seed);

  // Generate game code
  gameCode = Math.random().toString(36).substr(2, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(4,'A');
  window.gameCode = gameCode; // expose for index.html snippet

  // Build server state
  const state = {
    meta: { createdAt: new Date().toISOString() },
    seed, config, teams,
    currentTeamIdx: 0,
    phase: 'rolling',
    diceValue: 0, stepsRemaining: 0,
    symbols,
    doors: mazeResult.doors.map(d => ({ id: d.id, x: d.x, y: d.y, open: false, openedBy: null })),
    usedQuestionIds: [],
    activeQuestion: null
  };

  await GameSync.save(gameCode, state);
  gameState = state;
  localGrid = mazeResult.grid;

  // Init canvas
  const canvas = document.getElementById('maze-canvas');
  renderer = new MazeRenderer(canvas);
  renderer.setMaze(mazeResult);

  showScreen('game-screen');
  showGameCode();
  renderBoard();

  // Subscribe SSE for live updates from team devices
  GameSync.subscribe(gameCode, applyRemoteState);
}

// ── Symbol-Platzierung (deterministisch via seed) ─────────────────
function placeTeamSymbols(grid, teams, perTeam, seed) {
  const W = 16, H = 16, symbols = [];
  const excluded = new Set();
  teams.forEach(t => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const nx = t.x + dx, ny = t.y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) excluded.add(`${nx},${ny}`);
      }
  });
  const cells = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!excluded.has(`${x},${y}`) && grid[y][x].type !== 'door') cells.push({ x, y });

  new SeededRNG((seed * 31 + 7) & 0x7fffffff).shuffle(cells);

  for (let ti = 0; ti < teams.length; ti++) {
    let placed = 0;
    for (const cell of cells) {
      if (placed >= perTeam) break;
      if (symbols.some(s => s.x === cell.x && s.y === cell.y)) continue;
      if (symbols.filter(s => s.teamId === ti).some(s => Math.abs(s.x - cell.x) + Math.abs(s.y - cell.y) < 3)) continue;
      symbols.push({ id: `sym-${ti}-${placed}`, teamId: ti, x: cell.x, y: cell.y, found: false, foundBy: null });
      grid[cell.y][cell.x].type = 'symbol';
      grid[cell.y][cell.x].symTeamId = ti;
      placed++;
    }
  }
  return symbols;
}

// ── Remote State anwenden ─────────────────────────────────────────
function applyRemoteState(data) {
  if (!data?.meta || !localGrid) return;
  gameState = data;
  applyStateToGrid(localGrid, data.symbols || [], data.doors || []);
  renderBoard();
}

function applyStateToGrid(grid, symbols, doors) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (grid[y][x].type === 'symbol' || grid[y][x].type === 'door') { grid[y][x].type = 'path'; delete grid[y][x].symTeamId; }
  symbols.forEach(s => { if (!s.found) { grid[s.y][s.x].type = 'symbol'; grid[s.y][s.x].symTeamId = s.teamId; } });
  doors.forEach(d => { if (!d.open) grid[d.y][d.x].type = 'door'; });
}

// ── Board rendern ─────────────────────────────────────────────────
function renderBoard() {
  if (!gameState || !renderer) return;

  if (gameState.phase === 'finished') { showResult(); return; }

  // Build render state (compatible with MazeRenderer)
  const rs = {
    phase: gameState.phase,
    teams: gameState.teams,
    currentTeamIdx: gameState.currentTeamIdx,
    allSymbols: gameState.symbols || [],
    doors: gameState.doors || [],
    _validFree: new Set(), _validDoor: new Set(), _validSym: new Set()
  };
  renderer.render(rs);

  // Update UI
  const team = gameState.teams?.[gameState.currentTeamIdx];
  if (team) {
    const banner = document.getElementById('active-team-banner');
    if (banner) { banner.textContent = `${team.emoji} ${team.name} ist dran`; banner.style.background = team.color; }
  }

  // Phase display
  const phaseEl = document.getElementById('phase-display');
  if (phaseEl) {
    const phaseMap = { rolling:'🎲 Würfeln', moving:`👣 ${gameState.stepsRemaining} Schritt(e)`, question:'❓ Frage', finished:'🏆 Fertig' };
    phaseEl.textContent = phaseMap[gameState.phase] || gameState.phase;
  }

  renderTeamList();
  updateThemeBtnText();
}

function renderTeamList() {
  const list = document.getElementById('team-list'); if (!list || !gameState) return;
  list.innerHTML = '';
  gameState.teams.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'team-item' + (i === gameState.currentTeamIdx ? ' active' : '');
    div.style.borderColor = t.color;
    const fig = document.createElement('span'); fig.className = 'team-figure'; fig.textContent = t.emoji;
    const info = document.createElement('div'); info.className = 'team-info';
    info.innerHTML = `<div class="team-name">${t.name}</div><div class="team-score">${t.score} Pkt</div>`;
    const bar = document.createElement('div'); bar.className = 'team-sym-bar';
    (gameState.symbols || []).filter(s => s.teamId === t.id).forEach(s => {
      const dot = document.createElement('span'); dot.className = 'team-sym-dot' + (s.found ? ' found' : '');
      dot.style.background = s.found ? t.color : 'rgba(245,230,200,0.25)'; bar.appendChild(dot);
    });
    info.appendChild(bar); div.appendChild(fig); div.appendChild(info); list.appendChild(div);
  });
}

// ── Game Code anzeigen ────────────────────────────────────────────
function showGameCode() {
  const el = document.getElementById('game-code-display'); if (!el) return;
  el.style.display = '';
  const codeEl = document.getElementById('game-code-value'); if (codeEl) codeEl.textContent = gameCode;
  const link = document.getElementById('game-play-link');
  if (link) {
    const playUrl = new URL('play.html?code=' + gameCode, location.href).href;
    link.href = playUrl; link.textContent = playUrl;
  }
}

// ── Ergebnis-Screen ───────────────────────────────────────────────
function showResult() {
  const sorted = [...gameState.teams].sort((a, b) => b.symbolsFound - a.symbolsFound || b.score - a.score);
  document.getElementById('result-winner').innerHTML =
    `${sorted[0].emoji} <strong>${sorted[0].name}</strong> hat gewonnen mit ${sorted[0].symbolsFound} Symbolen!`;
  const tbody = document.getElementById('result-ranking-body');
  tbody.innerHTML = '';
  sorted.forEach((t, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'winner-row';
    tr.innerHTML = `<td>${i+1}.</td><td>${t.emoji} ${t.name}</td><td>${t.symbolsFound} / ${gameState.config.symbolsPerTeam}</td>`;
    tbody.appendChild(tr);
  });
  showScreen('result-screen');
}

// ── Helper ────────────────────────────────────────────────────────
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id)?.classList.add('active'); }
function confirmQuit() { if (confirm('Spiel wirklich beenden?')) { GameSync.unsubscribe(); showScreen('setup-screen'); } }
function updateThemeBtnText() {
  const d = document.body.classList.contains('dark');
  ['btn-theme','btn-theme-game','btn-theme-join'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = d ? '☀️ Lightmode' : '🌙 Darkmode'; });
}

// ── Theme ─────────────────────────────────────────────────────────
(function () {
  function apply(dark) { document.body.classList.toggle('dark', dark); updateThemeBtnText(); renderer?.invalidateColors(); if (gameState) renderBoard(); }
  window.toggleTheme = function () { const d = !document.body.classList.contains('dark'); localStorage.setItem('spiele_theme', d ? 'dark' : 'light'); apply(d); };
  apply(localStorage.getItem('spiele_theme') === 'dark');
})();
