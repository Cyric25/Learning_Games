/* labyrinth.js – Lehrerboard v3 (multi-device, SSE) */

// ── Konstanten ───────────────────────────────────────────────────
const TEAM_SYMBOL_ICONS = ['👑', '⚔️', '💎', '🔮', '🗝️', '📜'];
const TEAM_COLORS = ['#1a3a8f', '#8f1a1a', '#1a6b1a', '#6b1a6b', '#8f5a1a', '#1a6b6b'];
const TEAM_EMOJIS = ['🛡️', '🐉', '🦉', '🦊', '🧙', '🤖'];
const DEFAULT_NAMES = ['Ritter', 'Drachen', 'Eulen', 'Füchse', 'Magier', 'Roboter'];
const DICE_CHARS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ── GameSync ──────────────────────────────────────────────────────
const GameSync = {
  _es: null, _poll: null, _session: 0,
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
    const sid = ++this._session;
    const connect = () => {
      if (this._session !== sid) return;
      const es = new EventSource(this._url('sse', code));
      this._es = es;
      es.onmessage = e => { try { const d = JSON.parse(e.data); if (d.meta) cb(d); } catch {} };
      es.addEventListener('reconnect', () => { es.close(); this._es = null; if (this._session === sid) setTimeout(connect, 200); });
      es.onerror = () => {
        es.close(); this._es = null;
        if (this._session !== sid) return;
        if (!this._poll) this._startPoll(code, cb);
        // SSE nach 2s erneut versuchen
        setTimeout(() => {
          if (this._session !== sid) return;
          if (this._poll) { clearInterval(this._poll); this._poll = null; }
          connect();
        }, 2000);
      };
    };
    if (this.hasServer()) connect();
    else this._startPoll(code, cb);
  },
  _startPoll(code, cb) {
    if (this._poll) return;
    this._poll = setInterval(async () => { const d = await this.load(code); if (d) cb(d); }, 300);
  },
  unsubscribe() {
    this._session++;
    if (this._es) { this._es.close(); this._es = null; }
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
  }
};

// ── State ─────────────────────────────────────────────────────────
let allQuestions = [];
let rawCategories = [];
let activeCategories = new Set();
let gameCode = null;
let localGrid = null;
let gameState = null;
let renderer = null;
let teacherEvalVisible = false;
let mazeLibrary = [];  // saved mazes from designer

async function loadMazeLibrary() {
  if (location.protocol !== 'file:') {
    try { const r = await fetch('../api.php?f=lab-mazes'); if (r.ok) { const d = await r.json(); if (Array.isArray(d)) { mazeLibrary = d; localStorage.setItem('lab_maze_library', JSON.stringify(d)); return; } } } catch {}
  }
  try { mazeLibrary = JSON.parse(localStorage.getItem('lab_maze_library') || '[]'); } catch { mazeLibrary = []; }
}

// ── Init ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadQuestions(), loadMazeLibrary()]);
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
    const full = path ? `${path} › ${cat.name}` : cat.name;
    const subs = cat.subcategories || [];
    if (!subs.length) {
      (cat.questions || []).forEach(q => {
        const diff = q.difficulty <= 200 ? 'leicht' : q.difficulty >= 400 ? 'schwer' : 'mittel';
        fragen.push({ ...q, kategorieId: cat.id, kategorieName: full, schwierigkeit: diff,
          type: q.type === 'mc' ? 'multiple_choice' : 'offen' });
      });
    } else {
      subs.forEach(s => walk(s, full));
    }
  }
  (rqData.categories || []).forEach(c => walk(c, ''));
  return fragen;
}

// ── Multi-Correct Hilfsfunktionen ─────────────────────────────────
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
  if ((state.phase === 'playing' || state.phase === 'rolling' || state.phase === 'direction' || state.phase === 'question') && state.config?.teamCount) {
    activeCategories = new Set(state.config.kategorien || []);
    let mazeResult;
    if (state.mazeData) {
      localGrid = JSON.parse(JSON.stringify(state.mazeData.grid));
      mazeResult = { grid: localGrid, startPositions: state.mazeData.startPositions };
    } else {
      const _sz = state.config?.mazeSize || 16;
      const gen = new MazeGenerator(_sz, _sz, state.seed);
      mazeResult = gen.generate({ doorCount: getDoorCount(state.config.doorPreset, _sz), teamCount: state.config.teamCount });
      localGrid = mazeResult.grid;
    }
    applyStateToGrid(localGrid, state.symbols || []);
    showScreen('game-screen');
    showGameCode();
    const canvas = document.getElementById('maze-canvas');
    renderer = new MazeRenderer(canvas);
    renderer.setMaze(mazeResult);
    renderBoard();
    if (state.activeQuestion?.questionResult === null) updateTeacherQuestionPanel(state.activeQuestion, state);
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
  b.innerHTML = '<span>📱 Code:</span><strong class="code-val" style="font-size:1.2rem;letter-spacing:2px">' + gameCode + '</strong>'
    + '<a href="play.html?code=' + gameCode + '" target="_blank" style="color:var(--accent);font-size:.8rem;text-decoration:none">Spieler ↗</a>'
    + '<a href="board.html?code=' + gameCode + '" target="_blank" style="color:var(--accent);font-size:.8rem;text-decoration:none">Tafel ↗</a>';
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
  buildMazeSourceUI();
  buildMazeSizeUI();
  buildDoorPresetUI();
  buildSymbolModeUI();
  buildSymbolsUI();
  buildTimerUI();
  buildQuestionModeUI();
}

function buildQuestionModeUI() {
  const row = document.getElementById('question-mode-row'); if (!row) return;
  row.innerHTML = '';
  const opts = [
    { label: '🔀 Gemischt', desc: 'MC + Offene Fragen', v: 'mixed' },
    { label: '🅰 Nur Multiple Choice', desc: 'Schüler spielen selbstständig', v: 'mc' },
    { label: '💬 Nur Offene Fragen', desc: 'Spielleiter bewertet immer', v: 'open' }
  ];
  const group = document.createElement('div');
  group.className = 'qmode-group';
  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'qmode-btn' + (opt.v === _cfg.questionMode ? ' active' : '');
    btn.innerHTML = opt.label + '<span class="qmode-desc">' + opt.desc + '</span>';
    btn.onclick = () => {
      _cfg.questionMode = opt.v;
      group.querySelectorAll('.qmode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateCategoryInfo();
    };
    group.appendChild(btn);
  });
  row.appendChild(group);
}

function buildMazeSourceUI() {
  const row = document.getElementById('maze-source-row'); if (!row) return;
  row.innerHTML = '';
  const opts = [{ label: '🎲 Zufällig', v: 'random' }, { label: '📚 Aus Bibliothek', v: 'library' }];
  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (opt.v === _cfg.mazeSource ? ' active' : '');
    btn.textContent = opt.label;
    btn.onclick = () => {
      _cfg.mazeSource = opt.v;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Show/hide maze-size and door-preset rows (not needed for library mode)
      const hide = opt.v === 'library';
      const szWrap = document.getElementById('maze-size-row-wrap');
      if (szWrap) szWrap.closest('.settings-row').style.display = hide ? 'none' : '';
      const dpWrap = document.getElementById('door-preset-row-wrap');
      if (dpWrap) dpWrap.closest('.settings-row').style.display = hide ? 'none' : '';
      updateLibraryHint(row);
    };
    row.appendChild(btn);
  });
  updateLibraryHint(row);
}

function updateLibraryHint(row) {
  let hint = row.nextElementSibling;
  if (hint && hint.classList.contains('lib-hint')) hint.remove();
  if (_cfg.mazeSource === 'library') {
    hint = document.createElement('div');
    hint.className = 'lib-hint';
    hint.style.cssText = 'font-size:.8rem;color:var(--text-secondary);margin-top:4px;';
    const n = mazeLibrary.length;
    hint.textContent = n > 0 ? `✅ ${n} Labyrinth${n!==1?'e':''} in der Bibliothek` : '⚠️ Bibliothek leer — Designer öffnen um Labyrinthe zu erstellen.';
    row.after(hint);
  }
}

function buildDoorPresetUI() {
  const row = document.getElementById('door-preset-row'); if (!row) return;
  row.innerHTML = '';
  [{ label: 'Wenig', v: 'wenig' }, { label: 'Viele', v: 'viele' }, { label: 'Sehr viele', v: 'sehrviele' }].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (opt.v === _cfg.doorPreset ? ' active' : '');
    btn.textContent = opt.label;
    btn.onclick = () => { _cfg.doorPreset = opt.v; row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); };
    row.appendChild(btn);
  });
}

function buildMazeSizeUI() {
  const row = document.getElementById('maze-size-row'); if (!row) return;
  row.innerHTML = '';
  [{ label: 'Klein (10×10)', v: 10 }, { label: 'Mittel (12×12)', v: 12 }, { label: 'Groß (16×16)', v: 16 }].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (opt.v === _cfg.mazeSize ? ' active' : '');
    btn.textContent = opt.label;
    btn.onclick = () => { _cfg.mazeSize = opt.v; row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); };
    row.appendChild(btn);
  });
}

function buildSymbolModeUI() {
  const row = document.getElementById('symbol-mode-row'); if (!row) return;
  row.innerHTML = '';
  [{ label: '🔮 Eigene', v: false }, { label: '🌐 Alle', v: true }].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (opt.v === _cfg.allSymbols ? ' active' : '');
    btn.textContent = opt.label;
    btn.onclick = () => { _cfg.allSymbols = opt.v; row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); };
    row.appendChild(btn);
  });
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
    const subs = cat.subcategories || [];
    if (cat.questions && cat.questions.length > 0 && !subs.length) return [cat.id];
    return subs.flatMap(s => collectLeaves(s));
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

  if (hasQ && !subs.length) {
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
    const cSubs = (c.subcategories || []).length > 0;
    if (c.questions && c.questions.length > 0 && !cSubs) allLeaves.push(c.id);
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
  const subs = cat.subcategories || [];
  if (cat.questions && cat.questions.length > 0 && !subs.length)
    return allQuestions.filter(q => q.kategorieId === cat.id).length;
  return subs.reduce((s, c) => s + _countLeafQ(c), 0);
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

function filterByMode(questions) {
  const mode = _cfg.questionMode || 'mixed';
  if (mode === 'mixed') return questions;
  return questions.filter(q => {
    const isMC = q.type === 'mc' || q.type === 'multiple_choice';
    return mode === 'mc' ? isMC : !isMC;
  });
}

function updateCategoryInfo() {
  const el = document.getElementById('cat-select-info');
  if (!el) return;
  const aktiv = filterByMode(allQuestions.filter(q => activeCategories.has(q.kategorieId)));
  const n = aktiv.length;
  const btn = document.querySelector('#category-screen .setup-btn:not(.setup-btn-ghost)');

  if (activeCategories.size === 0 || n === 0) {
    el.className = 'cat-select-info warning';
    el.innerHTML = 'Keine Kategorie ausgewählt!';
    if (btn) btn.disabled = true;
    return;
  }

  const ok = n >= 20;
  if (ok) {
    el.className = 'cat-select-info';
    el.textContent = '✅ ' + n + ' Fragen aus ' + activeCategories.size + ' Kategorien';
  } else {
    el.className = 'cat-select-info warning';
    el.textContent = '❌ Nur ' + n + ' Fragen – mindestens 20 benötigt. Bitte mehr Kategorien auswählen.';
  }
  if (btn) btn.disabled = !ok;
}

let _cfg = { teamCount: 4, symbolsPerTeam: 7, timerSeconds: 20, mazeSize: 12, allSymbols: false, doorPreset: 'viele', mazeSource: 'random', questionMode: 'mixed' };

function getDoorCount(preset, size) {
  const presets = {
    wenig:     { 10: 4,  12: 6,  16: 10 },
    viele:     { 10: 10, 12: 14, 16: 20 },
    sehrviele: { 10: 16, 12: 22, 16: 35 },
  };
  return (presets[preset] || presets.viele)[size] || 14;
}

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
  const avail = filterByMode(allQuestions.filter(q => activeCategories.has(q.kategorieId))).length;
  if (avail < 20) { updateCategoryInfo(); return; }
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
  [{label:'10s',v:10},{label:'20s',v:20},{label:'30s',v:30},{label:'45s',v:45},{label:'60s',v:60},{label:'Kein',v:0}].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (opt.v === _cfg.timerSeconds ? ' active' : ''); btn.textContent = opt.label;
    btn.onclick = () => {
      _cfg.timerSeconds = opt.v;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const inp = row.querySelector('.param-input-num');
      if (inp) inp.value = opt.v || '';
    };
    row.appendChild(btn);
  });
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = '0'; inp.max = '300'; inp.step = '5';
  inp.className = 'param-input-num'; inp.placeholder = 'Sek.'; inp.title = 'Beliebige Sekundenzahl';
  inp.value = _cfg.timerSeconds > 0 ? _cfg.timerSeconds : '';
  inp.oninput = () => {
    const v = parseInt(inp.value, 10);
    _cfg.timerSeconds = isNaN(v) || v < 0 ? 0 : v;
    row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
    row.querySelectorAll('.param-btn').forEach(b => {
      if (b.textContent === _cfg.timerSeconds + 's' || (b.textContent === 'Kein' && _cfg.timerSeconds === 0)) b.classList.add('active');
    });
  };
  row.appendChild(inp);
}

// ── Spiel starten ─────────────────────────────────────────────────
async function startGame() {
  const errEl = document.getElementById('setup-error'); errEl.textContent = '';

  if (activeCategories.size === 0) { errEl.textContent = 'Bitte mindestens eine Kategorie auswählen.'; return; }
  const avail = filterByMode(allQuestions.filter(q => activeCategories.has(q.kategorieId))).length;
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
  const useSaved = _cfg.mazeSource === 'library' && mazeLibrary.length > 0;
  const size = useSaved ? (mazeLibrary[0]?.size || 12) : (_cfg.mazeSize || 12);
  const config = { teamCount: _cfg.teamCount, symbolsPerTeam: _cfg.symbolsPerTeam, timerSeconds: _cfg.timerSeconds, kategorien: [...activeCategories], mazeSize: size, allSymbols: _cfg.allSymbols, doorPreset: _cfg.doorPreset, mazeSource: _cfg.mazeSource, questionMode: _cfg.questionMode };

  let mazeResult;
  if (useSaved) {
    // Pick a random saved maze
    const saved = mazeLibrary[Math.floor(Math.random() * mazeLibrary.length)];
    config.mazeSize = saved.size;
    mazeResult = {
      grid: JSON.parse(JSON.stringify(saved.grid)),
      doors: saved.doors.map(d => ({ ...d, angle: 0, openedBy: null })),
      startPositions: saved.startPositions
    };
  } else {
    const doorCount = getDoorCount(_cfg.doorPreset, size);
    const gen = new MazeGenerator(size, size, seed);
    mazeResult = gen.generate({ doorCount, teamCount: _cfg.teamCount });
  }

  mazeResult.startPositions.forEach((pos, i) => { if (teams[i]) { teams[i].x = pos.x; teams[i].y = pos.y; } });

  // Place symbols deterministically
  const symbols = placeTeamSymbols(mazeResult.grid, teams, _cfg.symbolsPerTeam, seed, size);

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
    mazeData: useSaved ? { grid: mazeResult.grid, startPositions: mazeResult.startPositions } : null,
    doors: mazeResult.doors,
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
function placeTeamSymbols(grid, teams, perTeam, seed, size) {
  const W = size || grid[0]?.length || 16;
  const H = size || grid.length || 16;
  const exR = ({ 10: 2, 12: 3, 16: 4 })[W] || 3;   // Ausschlussradius um Startfelder
  const minDist = ({ 10: 2, 12: 2, 16: 3 })[W] || 2; // Mindestabstand zwischen Symbolen
  const symbols = [];
  const excluded = new Set();
  teams.forEach(t => {
    for (let dy = -exR; dy <= exR; dy++)
      for (let dx = -exR; dx <= exR; dx++) {
        const nx = t.x + dx, ny = t.y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) excluded.add(`${nx},${ny}`);
      }
  });
  const cells = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!excluded.has(`${x},${y}`)) cells.push({ x, y });

  new SeededRNG((seed * 31 + 7) & 0x7fffffff).shuffle(cells);

  for (let ti = 0; ti < teams.length; ti++) {
    let placed = 0;
    for (const cell of cells) {
      if (placed >= perTeam) break;
      if (symbols.some(s => s.x === cell.x && s.y === cell.y)) continue;
      if (symbols.filter(s => s.teamId === ti).some(s => Math.abs(s.x - cell.x) + Math.abs(s.y - cell.y) < minDist)) continue;
      symbols.push({ id: `sym-${ti}-${placed}`, teamId: ti, x: cell.x, y: cell.y, found: false, foundBy: null });
      grid[cell.y][cell.x].type = 'symbol';
      grid[cell.y][cell.x].symTeamId = ti;
      placed++;
    }
  }
  return symbols;
}

// ── Remote State anwenden ─────────────────────────────────────────
let _teacherEvalQuestionId = null;

function applyRemoteState(data) {
  if (!data?.meta || !localGrid) return;
  gameState = data;
  applyStateToGrid(localGrid, data.symbols || []);
  const aq = data.activeQuestion;
  if (aq && aq.questionResult === null) {
    // Lehrkraft-Eval-Modal nur für offene Fragen zeigen (nicht für MC)
    if (aq.needsTeacherEval !== false && !teacherEvalVisible) showTeacherEvalModal(aq);
    updateTeacherQuestionPanel(aq, data);
  } else {
    if (!teacherEvalVisible || !aq || aq.id === _teacherEvalQuestionId) closeTeacherEvalModal();
    if (aq && aq.questionResult !== null) {
      updateTeacherQuestionPanel(aq, data);  // Ergebnis kurz anzeigen
    } else {
      clearTeacherQuestionPanel();
    }
  }
  renderBoard();
}

function updateTeacherQuestionPanel(aq, state) {
  const panel = document.getElementById('teacher-q-panel'); if (!panel) return;
  const team = state.teams?.[aq.teamIdx];
  const contextIcon = aq.contextType === 'door' ? '🔒 Tür' : '🔮 Symbol';

  let contentHtml = '';
  if (aq.questionResult !== null && aq.questionResult !== undefined) {
    contentHtml = '<div style="font-size:1rem;font-weight:800;text-align:center;padding:0.35rem;border-radius:8px;margin-top:0.3rem;' +
      (aq.questionResult
        ? 'background:rgba(22,163,74,0.12);color:var(--success)'
        : 'background:rgba(220,38,38,0.10);color:var(--danger)') + '">' +
      (aq.questionResult ? '✓ Richtig!' : '✗ Falsch!') + '</div>';
  } else if (aq.options?.length) {
    // MC: Optionen anzeigen, korrekte hervorheben
    const correctSet = new Set(aq.correctOptions || []);
    contentHtml = '<div style="display:flex;flex-direction:column;gap:0.2rem;margin-top:0.3rem;">' +
      aq.options.map(opt => {
        const ok = correctSet.has(opt);
        return '<div style="padding:0.2rem 0.5rem;border-radius:4px;font-size:0.82rem;' +
          (ok ? 'background:rgba(22,163,74,0.15);color:var(--success);font-weight:700;border:1px solid rgba(22,163,74,0.3)'
              : 'color:var(--text-secondary)') + '">' + escapeHtml(opt) + '</div>';
      }).join('') + '</div>';
  } else if (aq.answer) {
    contentHtml = '<div class="tqp-a">💡 ' + escapeHtml(aq.answer) + '</div>';
  }

  panel.innerHTML =
    '<div class="tqp-header">' +
      '<span class="tqp-team-badge" style="background:' + (team?.color || '#888') + '">' + (team?.emoji || '') + ' ' + escapeHtml(team?.name || '') + '</span>' +
      '<span class="tqp-ctx">' + contextIcon + '</span>' +
    '</div>' +
    '<div class="tqp-q">' + escapeHtml(aq.question) + '</div>' +
    contentHtml;
  panel.style.display = '';
}

function clearTeacherQuestionPanel() {
  const panel = document.getElementById('teacher-q-panel'); if (!panel) return;
  panel.style.display = 'none';
  panel.innerHTML = '';
}

function showTeacherEvalModal(aq) {
  const modal = document.getElementById('teacher-eval-modal');
  if (!modal) return;
  const team = gameState?.teams?.[aq.teamIdx];
  const teamEl = document.getElementById('te-team');
  const trigEl = document.getElementById('te-trigger');
  const qEl = document.getElementById('te-question');
  const aEl = document.getElementById('te-answer');
  if (teamEl) teamEl.textContent = team ? `${team.emoji} ${team.name}` : '';
  if (trigEl) trigEl.textContent = aq.contextType === 'door' ? '🔒 Tür öffnen' : '🔮 Symbol einsammeln';
  if (qEl) qEl.textContent = aq.question;
  if (aEl) aEl.textContent = aq.answer || '–';
  _teacherEvalQuestionId = aq.id;
  modal.style.display = 'flex';
  teacherEvalVisible = true;
}

function closeTeacherEvalModal() {
  const modal = document.getElementById('teacher-eval-modal');
  if (modal) modal.style.display = 'none';
  teacherEvalVisible = false;
  _teacherEvalQuestionId = null;
}

async function resolveOpenQuestion(correct) {
  if (!gameCode) return;
  closeTeacherEvalModal();
  // Load fresh state to avoid overwriting student's already-advanced state
  const fresh = await GameSync.load(gameCode);
  if (!fresh || !fresh.activeQuestion || fresh.activeQuestion.questionResult !== null) {
    // Student already resolved — nothing to do
    return;
  }
  const newState = JSON.parse(JSON.stringify(fresh));
  newState.activeQuestion.questionResult = correct;
  gameState = newState;
  GameSync.save(gameCode, newState);
}
window.resolveOpenQuestion = resolveOpenQuestion;

function applyStateToGrid(grid, symbols) {
  const H = grid.length, W = grid[0]?.length || H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (grid[y][x].type === 'symbol') { grid[y][x].type = 'path'; delete grid[y][x].symTeamId; }
  symbols.forEach(s => { if (!s.found) { grid[s.y][s.x].type = 'symbol'; grid[s.y][s.x].symTeamId = s.teamId; } });
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
    const phaseMap = { rolling:'🎲 Würfeln', direction:`🧭 ${gameState.stepsRemaining} Zug${gameState.stepsRemaining !== 1 ? 'züge' : ''}`, question:'❓ Frage', finished:'🏆 Fertig' };
    phaseEl.textContent = phaseMap[gameState.phase] || gameState.phase;
  }

  renderTeamList();
  updateThemeBtnText();
}

function renderTeamList() {
  const list = document.getElementById('team-list'); if (!list || !gameState) return;
  list.innerHTML = '';
  const taken = new Set(gameState.takenTeams || []);
  gameState.teams.forEach((t, i) => {
    const isTaken = taken.has(t.id);
    const div = document.createElement('div');
    div.className = 'team-item' + (i === gameState.currentTeamIdx ? ' active' : '');
    div.style.borderColor = t.color;

    const fig = document.createElement('span'); fig.className = 'team-figure'; fig.textContent = t.emoji;
    const info = document.createElement('div'); info.className = 'team-info';
    const connDot = isTaken ? '<span class="team-conn-dot" title="Gerät verbunden">●</span> ' : '';
    info.innerHTML = `<div class="team-name">${connDot}${t.name}</div><div class="team-score">${t.score} Pkt</div>`;

    const bar = document.createElement('div'); bar.className = 'team-sym-bar';
    (gameState.symbols || []).filter(s => s.teamId === t.id).forEach(s => {
      const dot = document.createElement('span'); dot.className = 'team-sym-dot' + (s.found ? ' found' : '');
      dot.style.background = s.found ? t.color : 'rgba(245,230,200,0.25)'; bar.appendChild(dot);
    });
    info.appendChild(bar);
    div.appendChild(fig);
    div.appendChild(info);

    if (isTaken) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'team-kick-btn';
      kickBtn.title = 'Gerät trennen (Team freigeben)';
      kickBtn.textContent = '✕';
      kickBtn.onclick = e => { e.stopPropagation(); kickTeam(t.id); };
      div.appendChild(kickBtn);
    }

    list.appendChild(div);
  });
}

async function kickTeam(teamId) {
  if (!gameState || !gameCode) return;
  const newState = JSON.parse(JSON.stringify(gameState));
  newState.takenTeams = (newState.takenTeams || []).filter(id => id !== teamId);
  gameState = newState;
  await GameSync.save(gameCode, newState);
  renderTeamList();
}
window.kickTeam = kickTeam;

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
    link.textContent = 'play.html öffnen ↗';
  }
  const boardLink = document.getElementById('game-board-link');
  if (boardLink) {
    boardLink.href = (location.protocol === 'file:'
      ? 'board.html?code=' + gameCode
      : new URL('board.html?code=' + gameCode, location.href).href);
    boardLink.textContent = 'Tafelansicht ↗';
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
