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
    if (s === 'games') return base + '?f=labyrinth-games';
    return base + '?f=labyrinth-' + s + (code ? '&code=' + encodeURIComponent(code) : '');
  },
  generateCode() {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:4}, () => ch[Math.floor(Math.random()*ch.length)]).join('');
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
  async loadGamesRegistry() {
    if (this.hasServer()) {
      try { const r = await fetch(this._url('games')); if (r.ok) return await r.json(); } catch {}
    }
    const reg = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('lab_')) {
        const code = k.slice(4);
        try { const d = JSON.parse(localStorage.getItem(k)); if (d && d.meta) reg[code] = { title: d.meta.title || 'Labyrinth-Quiz', status: d.phase || 'setup', updatedAt: d.meta.createdAt || '' }; } catch {}
      }
    }
    return reg;
  },
  async deleteGame(code) {
    localStorage.removeItem('lab_' + code.toUpperCase());
    if (this.hasServer()) {
      try { await fetch(this._url('game', code.toUpperCase()), { method: 'DELETE' }); } catch {}
    }
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
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) await _gsEnter(urlCode.toUpperCase());
  else showGameSelector();
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

// ── copyCode ──────────────────────────────────────────────────────
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

// ── Spielwähler ───────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showGameSelector() {
  showScreen('game-selector');
  const list = document.getElementById('gs-game-list');
  list.innerHTML = '<p class="gs-empty">Lade Spiele…</p>';
  GameSync.loadGamesRegistry().then(registry => {
    const entries = Object.entries(registry);
    if (entries.length === 0) { list.innerHTML = '<p class="gs-empty">Noch keine Spiele vorhanden.</p>'; return; }
    entries.sort((a, b) => (b[1].updatedAt || b[1].createdAt || '').localeCompare(a[1].updatedAt || a[1].createdAt || ''));
    list.innerHTML = entries.map(([code, info]) => {
      const statusLabel = { playing: '🟢 Läuft', rolling: '🟢 Läuft', finished: '🏁 Beendet' }[info.status] || '⚙ Setup';
      const date = info.updatedAt ? new Date(info.updatedAt).toLocaleDateString('de-AT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
      const ts = info.updatedAt || info.createdAt;
      let expiryHint = '';
      if (ts) { const rem = 24*3600000 - (Date.now() - new Date(ts).getTime()); if (rem > 0) { const h = Math.floor(rem/3600000), m = Math.floor((rem%3600000)/60000); expiryHint = ` · ${h}h ${m}m übrig`; } }
      return `<div class="gs-game-card" onclick="window._gsEnter('${code}')">
        <div class="gs-game-code">${code}</div>
        <div class="gs-game-info">
          <div class="gs-game-title">${escapeHtml(info.title || 'Labyrinth-Quiz')}</div>
          <div class="gs-game-meta">${statusLabel} · ${date}${expiryHint}</div>
        </div>
        <div class="gs-game-actions">
          <button class="gs-btn-delete" onclick="event.stopPropagation();window._gsDelete('${code}')">✕</button>
        </div>
      </div>`;
    }).join('');
  });
}

function joinAsStudent() {
  const input = document.getElementById('gs-code-input');
  const errEl = document.getElementById('gs-join-error');
  const code = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (errEl) errEl.textContent = '';
  if (!code || code.length < 4) { if (errEl) errEl.textContent = 'Bitte 4-stelligen Code eingeben.'; return; }
  window.location.href = 'play.html?code=' + code;
}

async function createNewGame() {
  const code = GameSync.generateCode();
  gameCode = code;
  window.gameCode = code;
  window.history.replaceState({}, '', 'index.html?code=' + code);
  const skeleton = {
    meta: { gameCode: code, title: 'Labyrinth-Quiz', createdAt: new Date().toISOString() },
    phase: 'setup', teams: [], seed: 0, config: {}, symbols: [], doors: [], usedQuestionIds: [], activeQuestion: null
  };
  await GameSync.save(code, skeleton);
  showScreen('setup-screen');
  buildSetupUI();
  const t = document.getElementById('setup-game-title'); if (t) t.value = '';
  showCodeBanner();
}

async function _gsEnter(code) {
  const state = await GameSync.load(code);
  if (!state?.meta) { alert('Spiel "' + code + '" nicht gefunden.'); showGameSelector(); return; }
  gameCode = code;
  window.gameCode = code;
  window.history.replaceState({}, '', 'index.html?code=' + code);
  gameState = state;
  if ((state.phase === 'playing' || state.phase === 'rolling') && state.seed && state.config?.teamCount) {
    activeCategories = new Set(state.config.kategorien || []);
    const gen = new MazeGenerator(16, 16, state.seed);
    const mazeResult = gen.generate({ doorCount: 14, teamCount: state.config.teamCount });
    localGrid = mazeResult.grid;
    applyStateToGrid(localGrid, state.symbols || [], state.doors || []);
    showScreen('game-screen');
    showGameCode();
    const canvas = document.getElementById('maze-canvas');
    renderer = new MazeRenderer(canvas);
    renderer.setMaze(mazeResult);
    renderBoard();
    GameSync.subscribe(code, applyRemoteState);
  } else {
    showScreen('setup-screen');
    buildSetupUI();
    const t = document.getElementById('setup-game-title'); if (t) t.value = state.meta.title || '';
    showCodeBanner();
  }
}

async function _gsDelete(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await GameSync.deleteGame(code);
  showGameSelector();
}

window._gsEnter = _gsEnter;
window._gsDelete = _gsDelete;

function showCodeBanner() {
  if (!gameCode) return;
  const existing = document.getElementById('code-banner');
  if (existing) { existing.querySelector('.code-val').textContent = gameCode; return; }
  const b = document.createElement('div');
  b.id = 'code-banner';
  b.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999;background:var(--bg-card,#1e1b4b);color:var(--text-primary,#fff);border-radius:12px;padding:10px 16px;font-size:.85rem;box-shadow:0 2px 12px rgba(0,0,0,.4);display:flex;align-items:center;gap:10px;border:1px solid var(--border-card,rgba(255,255,255,0.15));';
  b.innerHTML = '<span>📱 Schüler:</span><strong class="code-val" style="font-size:1.2rem;letter-spacing:2px">' + gameCode + '</strong><a href="play.html?code=' + gameCode + '" target="_blank" style="color:var(--accent);font-size:.8rem;text-decoration:none">Link ↗</a>';
  document.body.appendChild(b);
}

function resetToSelector() {
  GameSync.unsubscribe();
  gameCode = null; window.gameCode = null;
  gameState = null; localGrid = null; renderer = null;
  window.history.replaceState({}, '', 'index.html');
  const banner = document.getElementById('code-banner'); if (banner) banner.remove();
  showGameSelector();
}

// ── Setup UI ──────────────────────────────────────────────────────
function buildSetupUI() {
  buildTeamCountUI();
  renderTeamSelectList(_cfg.teamCount);
  buildSymbolsUI();
  buildTimerUI();
}

const CAT_ICONS = ['🧪','🧬','⚗️','🔬','🌍','📐','💡','🎯','📚','🏛️','🎨','⚡'];

// ── Team-Liste (neue Template-Darstellung) ──────────────────────────
function renderTeamSelectList(count) {
  const list = document.getElementById('team-select-list');
  if (!list) return;
  // Aktuelle Eingabewerte sichern
  const names = [];
  list.querySelectorAll('.team-name-input').forEach(inp => names.push(inp.value));
  list.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const color = TEAM_COLORS[i % TEAM_COLORS.length];
    const item = document.createElement('div');
    item.className = 'team-select-item';
    item.dataset.index = i;

    const dot = document.createElement('span');
    dot.className = 'team-select-dot';
    dot.style.background = color;

    const emoji = document.createElement('span');
    emoji.className = 'team-emoji-badge';
    emoji.textContent = TEAM_EMOJIS[i] || '🧩';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'team-name-input';
    inp.id = 'team-name-' + i;
    inp.placeholder = DEFAULT_NAMES[i] || ('Gruppe ' + (i + 1));
    inp.value = names[i] || DEFAULT_NAMES[i] || ('Gruppe ' + (i + 1));
    inp.maxLength = 20;

    item.appendChild(dot);
    item.appendChild(emoji);
    item.appendChild(inp);
    list.appendChild(item);
  }
}

function buildTeamCountUI() {
  const row = document.getElementById('team-count-row');
  if (!row) return;
  row.innerHTML = '';
  [2,3,4,5,6].forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (n === _cfg.teamCount ? ' active' : '');
    btn.textContent = n;
    btn.onclick = () => {
      _cfg.teamCount = n;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTeamSelectList(n);
    };
    row.appendChild(btn);
  });
}

// ── Kategorie-Selektor (standalone category-screen) ───────────────
function buildCategoryUI() {
  const list = document.getElementById('cat-select-list');
  if (!list) return;
  list.innerHTML = '';

  activeCategories.clear();
  function collectLeaves(cat) {
    if (cat.questions && cat.questions.length > 0) return [cat.id];
    return (cat.subcategories || []).flatMap(s => collectLeaves(s));
  }
  rawCategories.forEach(cat => collectLeaves(cat).forEach(id => activeCategories.add(id)));

  rawCategories.forEach((cat, ci) => _buildCatNode(list, cat, CAT_ICONS[ci % CAT_ICONS.length]));
  updateCategoryInfo();
}

function _buildCatNode(container, cat, icon, depth) {
  depth = depth || 0;
  const subs = cat.subcategories || [];
  const hasQ = cat.questions && cat.questions.length > 0;
  if (!hasQ && !subs.length) return;

  const qCount = _countLeafQ(cat);

  if (hasQ) {
    const sel = activeCategories.has(cat.id);
    const item = document.createElement('div');
    item.className = 'cat-select-item' + (sel ? ' selected' : '');
    item.dataset.catId = cat.id;
    item.innerHTML =
      '<span class="cat-select-icon">' + (icon || '📁') + '</span>' +
      '<span class="cat-select-name">' + cat.name + '</span>' +
      '<span class="cat-select-count">' + qCount + ' Fr.</span>' +
      '<div class="cat-select-check">' + (sel ? '✓' : '') + '</div>';
    item.onclick = () => {
      const on = !activeCategories.has(cat.id);
      const check = item.querySelector('.cat-select-check');
      if (on) { activeCategories.add(cat.id); item.classList.add('selected'); check.textContent = '✓'; }
      else     { activeCategories.delete(cat.id); item.classList.remove('selected'); check.textContent = ''; }
      _syncGroupHeader(container.closest('.cat-group-wrap'));
      updateCategoryInfo();
    };
    container.appendChild(item);
    return;
  }

  const allLeaves = [];
  (function collect(c) {
    if (c.questions && c.questions.length > 0) allLeaves.push(c.id);
    (c.subcategories || []).forEach(s => collect(s));
  })(cat);
  const allSel = allLeaves.every(id => activeCategories.has(id));

  const wrap = document.createElement('div');
  wrap.className = 'cat-group-wrap';

  const header = document.createElement('div');
  header.className = 'cat-group-header collapsed';
  header.innerHTML =
    '<span class="cat-group-chevron">▶</span>' +
    '<span class="cat-group-icon">' + icon + '</span>' +
    '<span class="cat-group-name">' + cat.name + '</span>' +
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
    allLeaves.forEach(id => { if (on) activeCategories.add(id); else activeCategories.delete(id); });
    children.querySelectorAll('.cat-select-item').forEach(item => {
      item.classList.toggle('selected', on);
      item.querySelector('.cat-select-check').textContent = on ? '✓' : '';
    });
    children.querySelectorAll('.cat-group-cb').forEach(gcb => gcb.checked = on);
    updateCategoryInfo();
  });

  wrap.appendChild(header);
  wrap.appendChild(children);
  container.appendChild(wrap);
  subs.forEach(sub => _buildCatNode(children, sub, icon, depth + 1));
}

function _countLeafQ(cat) {
  if (cat.questions && cat.questions.length > 0)
    return allQuestions.filter(q => q.kategorieId === cat.id).length;
  return (cat.subcategories || []).reduce((s, c) => s + _countLeafQ(c), 0);
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
  activeCategories.clear();
  document.querySelectorAll('#cat-select-list .cat-select-item').forEach(item => {
    item.classList.toggle('selected', on);
    item.querySelector('.cat-select-check').textContent = on ? '✓' : '';
    if (on) activeCategories.add(item.dataset.catId);
  });
  document.querySelectorAll('#cat-select-list .cat-group-cb').forEach(cb => cb.checked = on);
  updateCategoryInfo();
}

function updateCategoryInfo() {
  const el = document.getElementById('cat-select-info');
  if (!el) return;
  const n = allQuestions.filter(q => activeCategories.has(q.kategorieId)).length;
  if (activeCategories.size === 0 || n === 0) {
    el.className = 'cat-select-info warning';
    el.textContent = 'Keine Kategorie ausgewählt!';
  } else {
    el.className = 'cat-select-info';
    el.textContent = n + ' Fragen aus ' + activeCategories.size + ' Kategorien';
  }
}

let _cfg = { teamCount: 4, symbolsPerTeam: 7, timerSeconds: 20 };

// ── proceedToCategories (Setup → Category-Screen) ─────────────────
function proceedToCategories() {
  const errEl = document.getElementById('setup-error');
  if (errEl) errEl.textContent = '';
  buildCategoryUI();
  showScreen('category-screen');
}

// ── proceedFromCategories (Category-Screen → Spiel starten) ───────
function proceedFromCategories() {
  if (activeCategories.size === 0) { updateCategoryInfo(); return; }
  const avail = allQuestions.filter(q => activeCategories.has(q.kategorieId)).length;
  const needed = _cfg.teamCount * _cfg.symbolsPerTeam;
  if (avail < needed) {
    const el = document.getElementById('cat-select-info');
    if (el) { el.className = 'cat-select-info warning'; el.textContent = 'Zu wenig Fragen (' + avail + '/' + needed + ').'; }
    return;
  }
  startGame();
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

  // Use code already set by createNewGame (or generate one if not set)
  if (!gameCode) { gameCode = GameSync.generateCode(); window.gameCode = gameCode; }
  const title = document.getElementById('setup-game-title')?.value.trim() || 'Labyrinth-Quiz';

  // Build server state
  const state = {
    meta: { gameCode, title, createdAt: new Date().toISOString() },
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

  // Show screen first so canvas has correct clientWidth/clientHeight
  showScreen('game-screen');
  showGameCode();

  // Init canvas (after screen is visible so resize() gets real dimensions)
  const canvas = document.getElementById('maze-canvas');
  renderer = new MazeRenderer(canvas);
  renderer.setMaze(mazeResult);
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
    const playUrl = location.protocol === 'file:'
      ? 'play.html?code=' + gameCode
      : new URL('play.html?code=' + gameCode, location.href).href;
    link.href = playUrl;
    link.textContent = 'play.html?code=' + gameCode + ' ↗';
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
function confirmQuit() { if (confirm('Spiel wirklich beenden?')) resetToSelector(); }
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
