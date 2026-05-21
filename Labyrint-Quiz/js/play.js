/* play.js – Team-Gerät Controller v1 */

// ── Konstanten ───────────────────────────────────────────────────
const TEAM_SYMBOL_ICONS = ['👑', '⚔️', '💎', '🔮', '🗝️', '📜'];
const TEAM_COLORS = ['#1a3a8f', '#8f1a1a', '#1a6b1a', '#6b1a6b', '#8f5a1a', '#1a6b6b'];
const TEAM_EMOJIS = ['🛡️', '🐉', '🦉', '🦊', '🧙', '🤖'];
const DICE_CHARS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const DMAP = {
  n: { dx: 0, dy: -1, wall: 1, opp: 4 },
  e: { dx: 1, dy:  0, wall: 2, opp: 8 },
  s: { dx: 0, dy:  1, wall: 4, opp: 1 },
  w: { dx:-1, dy:  0, wall: 8, opp: 2 }
};

// ── GameSync ──────────────────────────────────────────────────────
const GameSync = {
  _es: null, _poll: null, _session: 0,
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
    this._poll = setInterval(async () => { const d = await this.load(code); if (d) cb(d); }, 400);
  },
  unsubscribe() {
    this._session++;
    if (this._es) { this._es.close(); this._es = null; }
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
  }
};

// ── State ─────────────────────────────────────────────────────────
let gameCode = null;
let myTeamId = null;
let remoteState = null;   // aktueller Spielstand vom Server
let localGrid = null;     // Labyrinth-Grid (aus seed rekonstruiert)
let allQuestions = [];
let activeCategories = new Set();

let questionContext = null;
let timerInterval = null;
let diceAnimId = null;
let _ignoreNextUpdate = false; // verhindert Echo beim eigenen POST
let _waitingForTeacher = false; // warten auf Lehrkraft-Bewertung (offene Frage)
let renderer = null;

// ── Init ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadQuestions();

  // Code aus URL lesen
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) {
    document.getElementById('join-code').value = urlCode.toUpperCase();
    await joinGame();
  } else {
    showScreen('join-screen');
  }
});

// ── Fragen laden ──────────────────────────────────────────────────
async function loadQuestions() {
  let data = null;
  try { const r = await fetch('../api.php?f=questions'); if (r.ok) data = await r.json(); } catch {}
  if (!data) { try { const r = await fetch('../data/questions.json'); if (r.ok) data = await r.json(); } catch {} }
  if (!data) { const c = localStorage.getItem('rq_questions'); if (c) try { data = JSON.parse(c); } catch {} }
  if (!data) data = { categories: [] };
  convertAndStoreQuestions(data);
}

function convertAndStoreQuestions(rqData) {
  function walk(cat, path) {
    if (cat.subcategories?.length) {
      cat.subcategories.forEach(s => walk(s, path ? `${path} › ${cat.name}` : cat.name));
    } else {
      const full = path ? `${path} › ${cat.name}` : cat.name;
      activeCategories.add(cat.id);
      (cat.questions || []).forEach(q => {
        const diff = q.difficulty <= 200 ? 'leicht' : q.difficulty >= 400 ? 'schwer' : 'mittel';
        allQuestions.push({ ...q, kategorieId: cat.id, kategorieName: full, schwierigkeit: diff,
          type: q.type === 'mc' ? 'multiple_choice' : 'offen' });
      });
    }
  }
  (rqData.categories || []).forEach(c => walk(c, ''));
}

// ── Join ──────────────────────────────────────────────────────────
async function joinGame() {
  const input = document.getElementById('join-code');
  const code = (input?.value || '').trim().toUpperCase();
  const errEl = document.getElementById('join-error');
  if (errEl) errEl.textContent = '';

  if (!code || code.length < 4) { if (errEl) errEl.textContent = 'Bitte 4-stelligen Code eingeben.'; return; }

  const loadingEl = document.getElementById('join-loading'); if (loadingEl) loadingEl.style.display = '';

  const state = await GameSync.load(code);

  if (loadingEl) loadingEl.style.display = 'none';

  if (!state?.meta) {
    if (errEl) errEl.textContent = `Spiel "${code}" nicht gefunden.`;
    return;
  }

  gameCode = code;
  remoteState = state;

  // Team aus localStorage (falls schon gewählt)
  const saved = localStorage.getItem('lab_myteam_' + code);
  if (saved !== null) {
    const tid = parseInt(saved, 10);
    if (state.teams[tid]) { myTeamId = tid; startPlayView(); return; }
  }

  showTeamSelect(state);
}

// ── Team auswählen ────────────────────────────────────────────────
function showTeamSelect(state) {
  showScreen('team-select-screen');
  const list = document.getElementById('team-select-list');
  list.innerHTML = '';
  const taken = new Set(state.takenTeams || []);
  state.teams.forEach(t => {
    const isTaken = taken.has(t.id);
    const btn = document.createElement('button');
    btn.className = 'team-select-btn' + (isTaken ? ' taken' : '');
    btn.style.borderColor = t.color;
    btn.disabled = isTaken;
    btn.innerHTML = `<span class="ts-emoji">${t.emoji}</span><span class="ts-name">${t.name}${isTaken ? ' <span class="ts-taken">belegt</span>' : ''}</span><span class="ts-icon">${t.symbolIcon}</span>`;
    if (!isTaken) btn.onclick = () => selectTeam(t.id);
    list.appendChild(btn);
  });
}

async function selectTeam(id) {
  // Frischen Stand laden um Race-Condition zu vermeiden; remoteState als Fallback
  const fresh = (await GameSync.load(gameCode)) || remoteState;
  if (!fresh) return;
  const taken = new Set(fresh.takenTeams || []);
  if (taken.has(id)) {
    // Zwischenzeitlich belegt – Liste neu aufbauen
    remoteState = fresh;
    showTeamSelect(fresh);
    return;
  }
  taken.add(id);
  const newState = JSON.parse(JSON.stringify(fresh));
  newState.takenTeams = [...taken];
  await GameSync.save(gameCode, newState);
  remoteState = newState;
  myTeamId = id;
  localStorage.setItem('lab_myteam_' + gameCode, id);
  startPlayView();
}

// ── Spielansicht starten ──────────────────────────────────────────
function startPlayView() {
  showScreen('play-screen');
  buildLocalGrid();
  renderCanvas(remoteState);
  applyState(remoteState);
  GameSync.subscribe(gameCode, onRemoteUpdate);
}

function buildLocalGrid() {
  if (!remoteState) return;
  const { seed, config, teams, symbols, doors } = remoteState;
  const sz = config.mazeSize || 16;
  const gen = new MazeGenerator(sz, sz, seed);
  const doorPresets = { wenig: { 10:4,12:6,16:10 }, viele: { 10:10,12:14,16:20 }, sehrviele: { 10:16,12:22,16:35 } };
  const dcPreset = doorPresets[config.doorPreset] || doorPresets.viele;
  const result = gen.generate({ doorCount: dcPreset[sz] || 14, teamCount: config.teamCount });
  localGrid = result.grid;

  // Apply stored symbols + doors
  applyStateToGrid(localGrid, symbols || []);

  // Init canvas renderer
  const canvas = document.getElementById('maze-canvas');
  if (canvas && typeof MazeRenderer !== 'undefined') {
    renderer = new MazeRenderer(canvas);
    renderer.setMaze(result);
  }
}

// Maps corner + blockedDir → direction blocked when door is at angle=90
const DOOR_OTHER_DIR = {
  NE: { N: 'E', E: 'N' },
  NW: { W: 'N', N: 'W' },
  SE: { E: 'S', S: 'E' },
  SW: { S: 'W', W: 'S' },
};

function getDoorOnPassage(doors, x, y, dir) {
  const d = DMAP[dir];
  const nx = x + d.dx, ny = y + d.dy;
  const DIR_UP = dir.toUpperCase();
  const OPP = { n: 'S', s: 'N', e: 'W', w: 'E' }[dir];
  return (doors || []).find(dr => {
    // Current blocked direction depends on angle: 0° → blockedDir, 90° → other dir
    const isFlipped = (dr.angle || 0) !== 0;
    const curDir = isFlipped
      ? (DOOR_OTHER_DIR[dr.corner]?.[dr.blockedDir] || dr.blockedDir)
      : dr.blockedDir;
    if (dr.cellX === x  && dr.cellY === y  && curDir === DIR_UP) return true;
    return dr.cellX === nx && dr.cellY === ny && curDir === OPP;
  }) || null;
}

function applyStateToGrid(grid, symbols) {
  const H = grid.length, W = grid[0]?.length || H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (grid[y][x].type === 'symbol') { grid[y][x].type = 'path'; delete grid[y][x].symTeamId; }
  symbols.forEach(s => { if (!s.found) { grid[s.y][s.x].type = 'symbol'; grid[s.y][s.x].symTeamId = s.teamId; } });
}

function onRemoteUpdate(data) {
  if (_ignoreNextUpdate) { _ignoreNextUpdate = false; return; }

  // Spielleiter hat das Team freigegeben → Spieler zurück zur Teamwahl
  if (myTeamId !== null && Array.isArray(data.takenTeams) &&
      !data.takenTeams.includes(myTeamId)) {
    handleKicked();
    return;
  }

  // Teacher has evaluated an open question we're waiting on
  if (_waitingForTeacher && data.activeQuestion?.questionResult !== null &&
      data.activeQuestion?.questionResult !== undefined) {
    _waitingForTeacher = false;
    remoteState = data;
    clearTimer();
    resolveQuestionResult(data.activeQuestion.questionResult);
    return;
  }
  remoteState = data;
  applyStateToGrid(localGrid, data.symbols || []);
  renderCanvas(data);
  applyState(data);
}

function handleKicked() {
  clearTimer();
  document.getElementById('question-modal')?.classList.remove('active');
  GameSync.unsubscribe();
  localStorage.removeItem('lab_myteam_' + gameCode);
  myTeamId = null;

  // Kurze Meldung, dann zurück zur Teamwahl
  showScreen('play-screen');
  const area = document.getElementById('play-area');
  if (area) area.innerHTML =
    '<div class="wait-screen">' +
      '<div class="wait-emoji">🚪</div>' +
      '<div class="wait-text">Vom Spielleiter getrennt…</div>' +
    '</div>';

  setTimeout(async () => {
    const state = await GameSync.load(gameCode);
    if (state?.meta) { remoteState = state; showTeamSelect(state); }
    else showScreen('join-screen');
  }, 1500);
}

function renderCanvas(state) {
  if (!renderer) return;
  renderer.render({
    phase: state.phase,
    teams: state.teams,
    currentTeamIdx: state.currentTeamIdx,
    allSymbols: state.symbols || [],
    doors: state.doors || [],
    _validFree: new Set(), _validDoor: new Set(), _validSym: new Set()
  });
}

// ── Hauptzustand anwenden ─────────────────────────────────────────
function applyState(state) {
  if (!state) return;
  remoteState = state;
  const team = state.teams?.[state.currentTeamIdx];
  const myTeam = state.teams?.[myTeamId];
  const isMyTurn = state.currentTeamIdx === myTeamId;

  // Header: welche Gruppe bin ich, wer ist dran
  const myEl = document.getElementById('my-team-display');
  if (myEl && myTeam) { myEl.textContent = `${myTeam.emoji} ${myTeam.name}`; myEl.style.background = myTeam.color; }

  updateSymbolBar(state);

  if (state.phase === 'finished') { showFinished(state); return; }

  if (!isMyTurn) {
    const aq = state.activeQuestion;
    if (aq && aq.questionResult === null) {
      showSpectatorQuestion(aq, state.teams[aq.teamIdx]);
    } else if (aq && aq.questionResult !== null && aq.questionResult !== undefined) {
      showSpectatorResult(aq, state.teams[aq.teamIdx]);
    } else {
      showWaiting(team);
    }
    return;
  }

  // Mein Zug!
  if (state.phase === 'rolling') {
    showRolling(state);
  } else if (state.phase === 'direction') {
    showDirectionLocal(state);
  } else if (state.phase === 'question') {
    // modal already open locally, no action needed
  }
}

function updateSymbolBar(state) {
  const bar = document.getElementById('my-sym-bar'); if (!bar) return;
  const myTeam = state.teams?.[myTeamId]; if (!myTeam) return;
  bar.innerHTML = '';
  (state.symbols || []).filter(s => s.teamId === myTeamId).forEach(s => {
    const span = document.createElement('span');
    span.className = 'my-sym-dot' + (s.found ? ' found' : '');
    span.textContent = s.found ? myTeam.symbolIcon : '○';
    span.style.color = myTeam.color;
    bar.appendChild(span);
  });
}

// ── Warten ────────────────────────────────────────────────────────
function showWaiting(currentTeam) {
  const area = document.getElementById('play-area');
  area.innerHTML = `
    <div class="wait-screen">
      <div class="wait-emoji">${currentTeam?.emoji || '⏳'}</div>
      <div class="wait-text">${currentTeam?.name || '?'} ist dran…</div>
    </div>`;
}

// ── Würfeln ───────────────────────────────────────────────────────
function showRolling(state) {
  const area = document.getElementById('play-area');
  const myTeam = state.teams[myTeamId];
  area.innerHTML = `
    <div class="turn-screen">
      <div class="turn-title">Dein Zug, ${myTeam.name}!</div>
      <div class="dice-pair">
        <div class="dice-display" id="dice-1">🎲</div>
        <div class="dice-display" id="dice-2">🎲</div>
      </div>
      <button class="btn-action btn-roll" id="btn-roll-play" onclick="rollDice()">Würfeln</button>
    </div>`;
}

function rollDice() {
  const btn = document.getElementById('btn-roll-play'); if (btn) btn.disabled = true;
  const d1el = document.getElementById('dice-1');
  const d2el = document.getElementById('dice-2');
  const pair = document.querySelector('.dice-pair');
  if (!pair) return;
  pair.classList.add('rolling');
  let frames = 0;
  diceAnimId = setInterval(() => {
    frames++;
    if (d1el) d1el.textContent = DICE_CHARS[Math.floor(Math.random() * 6)];
    if (d2el) d2el.textContent = DICE_CHARS[Math.floor(Math.random() * 6)];
    if (frames >= 20) {
      clearInterval(diceAnimId); diceAnimId = null;
      pair.classList.remove('rolling');
      const r1 = Math.floor(Math.random() * 6) + 1;
      const r2 = Math.floor(Math.random() * 6) + 1;
      if (d1el) d1el.textContent = DICE_CHARS[r1 - 1];
      if (d2el) d2el.textContent = DICE_CHARS[r2 - 1];

      const newState = JSON.parse(JSON.stringify(remoteState));
      newState.diceValue = r1 + r2;
      newState.diceValues = [r1, r2];
      newState.stepsRemaining = r1 + r2;
      newState.phase = 'direction';
      postState(newState);
      showDirectionLocal(newState);
    }
  }, 70);
}

// ── Richtung wählen ───────────────────────────────────────────────
function showDirectionLocal(state) {
  const area = document.getElementById('play-area');
  const myTeam = state.teams[myTeamId];
  const movesLeft = state.stepsRemaining;
  const validDirs = computeValidDirections(state);

  const mkBtn = (dir, arrow) => validDirs[dir]
    ? `<button class="dir-btn dir-free" onclick="chooseDirection('${dir}')">${arrow}</button>`
    : `<button class="dir-btn" disabled>${arrow}</button>`;

  const dv = state.diceValues;
  const diceStr = dv ? (DICE_CHARS[dv[0]-1] + ' ' + DICE_CHARS[dv[1]-1]) : DICE_CHARS[(state.diceValue||1)-1];

  area.innerHTML = `
    <div class="move-screen">
      <div class="steps-indicator">
        <span class="dice-val">${diceStr}</span>
        <span class="steps-left">${movesLeft} Zug${movesLeft !== 1 ? 'züge' : ''}</span>
      </div>
      <div class="dir-grid">
        <div class="dir-row">${mkBtn('n','▲')}</div>
        <div class="dir-row">${mkBtn('w','◀')}<span class="dir-center">${myTeam.emoji}</span>${mkBtn('e','▶')}</div>
        <div class="dir-row">${mkBtn('s','▼')}</div>
      </div>
      <button class="btn-action btn-skip" onclick="skipTurn()">Zug beenden</button>
    </div>`;
}

function computeValidDirections(state) {
  if (!localGrid) return {};
  const { x, y } = state.teams[myTeamId];
  const valid = {};
  for (const [key, d] of Object.entries(DMAP)) {
    if (!(localGrid[y][x].walls & d.wall)) valid[key] = true;
  }
  return valid;
}

function advanceInDirection(dir, state) {
  const d = DMAP[dir];
  let cx = state.teams[myTeamId].x;
  let cy = state.teams[myTeamId].y;
  const fromWall = d.opp;
  const W = localGrid[0]?.length || 16;
  const H = localGrid.length || 16;
  const allSymMode = state.config?.allSymbols;

  while (true) {
    if (localGrid[cy][cx].walls & d.wall) break;
    const nx = cx + d.dx, ny = cy + d.dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) break;

    const closedDoor = getDoorOnPassage(state.doors, cx, cy, dir);
    if (closedDoor) return { stop: 'door', teamX: cx, teamY: cy, doorX: nx, doorY: ny, door: closedDoor };

    const cell = localGrid[ny][nx];
    if (cell.type === 'symbol' && (allSymMode || cell.symTeamId === myTeamId)) {
      const sym = (state.symbols || []).find(s => s.x === nx && s.y === ny && !s.found);
      if (sym) return { stop: 'symbol', teamX: cx, teamY: cy, symX: nx, symY: ny, sym };
    }

    cx = nx; cy = ny;

    let exits = 0;
    for (const d2 of Object.values(DMAP)) {
      if (d2.wall === fromWall) continue;
      if (!(localGrid[cy][cx].walls & d2.wall)) exits++;
    }
    if (exits !== 1) break;
  }
  return { stop: 'moved', teamX: cx, teamY: cy };
}

function chooseDirection(dir) {
  if (!remoteState || remoteState.phase !== 'direction') return;
  if (!computeValidDirections(remoteState)[dir]) return;

  const res = advanceInDirection(dir, remoteState);
  const newState = JSON.parse(JSON.stringify(remoteState));
  newState.teams[myTeamId].x = res.teamX;
  newState.teams[myTeamId].y = res.teamY;

  if (res.stop === 'door') {
    newState.stepsRemaining = 0;
    newState.phase = 'question';
    postState(newState);
    renderCanvas(newState);
    questionContext = { type: 'door', target: { x: res.doorX, y: res.doorY }, door: res.door };
    showQuestionModal();
    return;
  }

  if (res.stop === 'symbol') {
    newState.stepsRemaining = 0;
    newState.phase = 'question';
    postState(newState);
    renderCanvas(newState);
    questionContext = { type: 'symbol', target: { x: res.symX, y: res.symY }, sym: res.sym };
    showQuestionModal();
    return;
  }

  // Kreuzung oder Sackgasse erreicht
  newState.stepsRemaining--;
  if (newState.stepsRemaining <= 0) {
    newState.phase = 'rolling';
    newState.diceValue = 0;
    newState.stepsRemaining = 0;
    newState.currentTeamIdx = (newState.currentTeamIdx + 1) % newState.teams.length;
    postState(newState);
    showWaiting(newState.teams[newState.currentTeamIdx]);
  } else {
    newState.phase = 'direction';
    postState(newState);
    showDirectionLocal(newState);
  }
}

function skipTurn() {
  if (!remoteState) return;
  const newState = JSON.parse(JSON.stringify(remoteState));
  newState.phase = 'rolling';
  newState.diceValue = 0;
  newState.stepsRemaining = 0;
  newState.currentTeamIdx = (newState.currentTeamIdx + 1) % newState.teams.length;
  postState(newState);
  showWaiting(newState.teams[newState.currentTeamIdx]);
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
function isMultiCorrect(q) {
  return Array.isArray(q.correctIndices) && q.correctIndices.length > 0;
}

// ── Frage ─────────────────────────────────────────────────────────
let _mcPending = new Set(); // aktuelle Multi-Correct Auswahl

function showQuestionModal() {
  const cats = remoteState.config?.kategorien || [...activeCategories];
  const used = new Set(remoteState.usedQuestionIds || []);
  let pool = allQuestions.filter(q => cats.includes(q.kategorieId) && !used.has(q.id));
  if (!pool.length) pool = allQuestions.filter(q => cats.includes(q.kategorieId));
  if (!pool.length) { resolveQuestionResult(false); return; }
  const q = pool[Math.floor(Math.random() * pool.length)];
  questionContext.question = q;

  const modal = document.getElementById('question-modal');
  document.getElementById('q-cat-name').textContent = q.kategorieName?.split(' › ').pop() || '';
  const diffEl = document.getElementById('q-difficulty');
  diffEl.textContent = q.schwierigkeit || ''; diffEl.className = 'modal-difficulty diff-' + (q.schwierigkeit || '');

  const trigger = document.getElementById('q-trigger-type');
  const myTeam = remoteState.teams[myTeamId];
  if (questionContext.type === 'door') { trigger.textContent = '🔒 Tür öffnen'; trigger.className = 'modal-trigger trigger-door'; }
  else { trigger.textContent = `${myTeam.symbolIcon} Symbol einsammeln`; trigger.className = 'modal-trigger trigger-symbol'; }

  document.getElementById('q-text').textContent = q.question;
  document.getElementById('q-result').textContent = '';
  document.getElementById('q-result').className = 'modal-result';
  document.getElementById('q-result').style.display = 'none';
  document.getElementById('q-continue').style.display = 'none';

  const optEl = document.getElementById('q-options');
  const openSec = document.getElementById('q-open-section');

  if (questionContext.type === 'door') {
    // TÜRFRAGE: nur Lehrkraft bewertet — Spieler sieht nur den Fragetext
    optEl.style.display = 'none';
    openSec.style.display = '';
    document.getElementById('q-open-answer').style.display = 'none';
    document.getElementById('q-show-answer').style.display = 'none';
    document.getElementById('q-open-actions').style.display = 'none';
    const prevWait = document.getElementById('q-teacher-wait');
    if (prevWait) prevWait.remove();
    const waitEl = document.createElement('div');
    waitEl.id = 'q-teacher-wait';
    waitEl.style.cssText = 'text-align:center;padding:0.5rem 0;color:var(--text-secondary);font-style:italic;font-size:0.9rem;';
    waitEl.textContent = '⏳ Lehrkraft bewertet…';
    openSec.appendChild(waitEl);

    // Korrekte Antwort für das Lehrkraft-Modal bestimmen
    let correctAnswer = '';
    if (q.type === 'multiple_choice' && q.options?.length) {
      if (Array.isArray(q.correctIndices) && q.correctIndices.length > 0) {
        correctAnswer = q.correctIndices.map(i => q.options[i]).join(', ');
      } else {
        correctAnswer = q.options[q.correctIndex ?? 0] || '';
      }
    } else {
      correctAnswer = q.answer || q.hint || '';
    }

    _waitingForTeacher = true;
    const aqState = JSON.parse(JSON.stringify(remoteState));
    aqState.activeQuestion = {
      id: q.id, question: q.question, answer: correctAnswer,
      teamIdx: myTeamId, contextType: 'door',
      target: Object.assign({}, questionContext.target), questionResult: null
    };
    postState(aqState);
    startTimer(0); // kein Timer für lehrkraft-bewertete Türfragen

  } else if (q.type === 'multiple_choice' && q.options?.length) {
    // SYMBOLFRAGE + MC: Spieler antwortet selbst
    optEl.style.display = ''; openSec.style.display = 'none'; optEl.innerHTML = '';

    if (isMultiCorrect(q)) {
      // Multi-Correct: Toggle-Buttons + Bestätigen-Button
      _mcPending = new Set();
      q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = opt;
        btn.dataset.idx = i;
        btn.onclick = () => {
          if (btn.disabled) return;
          if (_mcPending.has(i)) { _mcPending.delete(i); btn.classList.remove('mc-selected'); }
          else { _mcPending.add(i); btn.classList.add('mc-selected'); }
          const confirmBtn = document.getElementById('q-mc-confirm');
          if (confirmBtn) confirmBtn.disabled = _mcPending.size === 0;
        };
        optEl.appendChild(btn);
      });
      const hint = document.createElement('div');
      hint.className = 'mc-multi-hint';
      hint.textContent = 'Mehrere Antworten möglich – alle auswählen und bestätigen.';
      optEl.appendChild(hint);
      const confirmBtn = document.createElement('button');
      confirmBtn.id = 'q-mc-confirm';
      confirmBtn.className = 'answer-btn mc-confirm-btn';
      confirmBtn.textContent = '✓ Bestätigen';
      confirmBtn.disabled = true;
      confirmBtn.onclick = () => resolveMultiChoice();
      optEl.appendChild(confirmBtn);
    } else {
      q.options.forEach((opt, i) => {
        const btn = document.createElement('button'); btn.className = 'answer-btn'; btn.textContent = opt;
        btn.onclick = () => resolveChoice(i); optEl.appendChild(btn);
      });
    }

    // Frage für Lehrkraft + Tafelmodus sichtbar machen
    const correctOpts = isMultiCorrect(q)
      ? q.correctIndices.map(i => q.options[i])
      : [q.options[q.correctIndex ?? 0]];
    const mcAqState = JSON.parse(JSON.stringify(remoteState));
    mcAqState.activeQuestion = {
      id: q.id, question: q.question, options: q.options,
      correctOptions: correctOpts, answer: correctOpts.join(', '),
      teamIdx: myTeamId, contextType: questionContext.type,
      target: Object.assign({}, questionContext.target),
      questionResult: null, needsTeacherEval: false
    };
    postState(mcAqState);

    startTimer(remoteState.config?.timerSeconds || 0);

  } else {
    // SYMBOLFRAGE + OFFEN: Lehrkraft bewertet
    optEl.style.display = 'none'; openSec.style.display = '';
    document.getElementById('q-open-answer').textContent = q.answer || '';
    document.getElementById('q-open-answer').style.display = 'none';
    document.getElementById('q-show-answer').style.display = 'none';
    document.getElementById('q-open-actions').style.display = 'none';
    const prevWait = document.getElementById('q-teacher-wait');
    if (prevWait) prevWait.remove();
    const waitEl = document.createElement('div');
    waitEl.id = 'q-teacher-wait';
    waitEl.style.cssText = 'text-align:center;padding:0.5rem 0;color:var(--text-secondary);font-style:italic;font-size:0.9rem;';
    waitEl.textContent = '⏳ Lehrkraft bewertet…';
    openSec.appendChild(waitEl);
    _waitingForTeacher = true;
    const openState = JSON.parse(JSON.stringify(remoteState));
    openState.activeQuestion = {
      id: q.id, question: q.question, answer: q.answer || q.hint || '',
      teamIdx: myTeamId, contextType: questionContext.type,
      target: Object.assign({}, questionContext.target), questionResult: null
    };
    postState(openState);
    startTimer(remoteState.config?.timerSeconds || 0);
  }

  modal.classList.add('active');
}

function resolveChoice(idx) {
  clearTimer();
  const q = questionContext.question;
  const correct = idx === (q.correctIndex ?? 0);
  const cs = correctSet(q);
  document.querySelectorAll('#q-options .answer-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (cs.has(i)) btn.classList.add('correct');
    else if (i === idx && !correct) btn.classList.add('wrong');
  });
  resolveQuestionResult(correct);
}

function resolveMultiChoice() {
  clearTimer();
  const q = questionContext.question;
  const selected = [..._mcPending];
  const correct = isMcCorrect(q, selected);
  const cs = correctSet(q);
  document.querySelectorAll('#q-options .answer-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (btn.id === 'q-mc-confirm') { btn.style.display = 'none'; return; }
    btn.classList.remove('mc-selected');
    if (cs.has(i)) btn.classList.add('correct');
    else if (selected.includes(i)) btn.classList.add('wrong');
  });
  const hint = document.querySelector('#q-options .mc-multi-hint');
  if (hint) hint.style.display = 'none';
  resolveQuestionResult(correct);
}

function showOpenAnswer() {
  document.getElementById('q-open-answer').style.display = '';
  document.getElementById('q-show-answer').style.display = 'none';
  document.getElementById('q-open-actions').style.display = 'flex';
}

function resolveOpen(correct) { clearTimer(); resolveQuestionResult(correct); }

function resolveQuestionResult(correct) {
  _waitingForTeacher = false;
  const ctx = questionContext;
  const resultEl = document.getElementById('q-result');
  const myTeam = remoteState.teams[myTeamId];

  document.querySelectorAll('.answer-btn').forEach(b => b.disabled = true);
  document.getElementById('q-open-actions').style.display = 'none';

  if (correct) {
    resultEl.className = 'modal-result result-correct';
    if (ctx.type === 'door') resultEl.textContent = '✓ Richtig! Die Tür öffnet sich!';
    else resultEl.textContent = `✓ Richtig! ${myTeam.symbolIcon} Symbol eingesammelt! +10`;
  } else {
    resultEl.textContent = '✗ Leider falsch.'; resultEl.className = 'modal-result result-wrong';
  }
  resultEl.style.display = 'block';
  document.getElementById('q-continue').style.display = 'block';

  // MC-Fragen: Ergebnis für Lehrkraft + Tafelmodus veröffentlichen
  if (remoteState?.activeQuestion?.needsTeacherEval === false &&
      remoteState.activeQuestion.questionResult === null) {
    const resState = JSON.parse(JSON.stringify(remoteState));
    resState.activeQuestion.questionResult = correct;
    postState(resState);
  }
}

function continueAfterQuestion() {
  clearTimer();
  document.getElementById('question-modal').classList.remove('active');

  const ctx = questionContext;
  questionContext = null;
  const wasCorrect = document.getElementById('q-result').classList.contains('result-correct');

  const newState = JSON.parse(JSON.stringify(remoteState));
  newState.activeQuestion = null;
  const used = new Set(newState.usedQuestionIds || []);
  if (ctx.question) used.add(ctx.question.id);
  newState.usedQuestionIds = [...used];

  if (ctx.type === 'door' && wasCorrect) {
    const door = newState.doors.find(d => d.id === ctx.door.id);
    if (door) { door.angle = (door.angle || 0) ? 0 : 90; door.openedBy = myTeamId; }
    newState.teams[myTeamId].x = ctx.target.x;
    newState.teams[myTeamId].y = ctx.target.y;
  } else if (ctx.type === 'symbol' && wasCorrect) {
    const sym = newState.symbols.find(s => s.x === ctx.target.x && s.y === ctx.target.y && !s.found);
    if (sym) { sym.found = true; sym.foundBy = myTeamId; }
    newState.teams[myTeamId].score += 10;
    newState.teams[myTeamId].symbolsFound++;
    newState.teams[myTeamId].x = ctx.target.x;
    newState.teams[myTeamId].y = ctx.target.y;

    // Check win
    if (newState.teams[myTeamId].symbolsFound >= (newState.config?.symbolsPerTeam || 7)) {
      newState.teams[myTeamId].score += 50;
      newState.phase = 'finished';
      postState(newState);
      showFinished(newState);
      return;
    }
  }

  // Tür/Symbol trifft → restliche Züge verfallen, Zug endet immer
  newState.phase = 'rolling';
  newState.diceValue = 0;
  newState.stepsRemaining = 0;
  newState.currentTeamIdx = (newState.currentTeamIdx + 1) % newState.teams.length;

  applyStateToGrid(localGrid, newState.symbols || []);
  postState(newState);

  if (newState.currentTeamIdx !== myTeamId) {
    showWaiting(newState.teams[newState.currentTeamIdx]);
  } else {
    applyState(newState);
  }
}

// ── Spielende ─────────────────────────────────────────────────────
function showFinished(state) {
  const sorted = [...state.teams].sort((a, b) => b.symbolsFound - a.symbolsFound || b.score - a.score);
  const winner = sorted[0];
  const myTeam = state.teams[myTeamId];
  const isWinner = winner.id === myTeamId;

  const area = document.getElementById('play-area');
  area.innerHTML = `
    <div class="finished-screen">
      <div class="finished-trophy">${isWinner ? '🏆' : '🎖️'}</div>
      <div class="finished-title">${isWinner ? 'Ihr habt gewonnen!' : winner.name + ' hat gewonnen!'}</div>
      <div class="finished-my-score">${myTeam.emoji} ${myTeam.name}: ${myTeam.symbolsFound} Symbole · ${myTeam.score} Pkt</div>
      <div class="finished-ranking">${sorted.map((t,i) => `<div class="rank-row ${t.id===myTeamId?'rank-me':''}">${i+1}. ${t.emoji} ${t.name} — ${t.symbolsFound} Symbole</div>`).join('')}</div>
      <button class="btn-action" onclick="location.href='play.html'">Neues Spiel</button>
    </div>`;
}

// ── Timer ─────────────────────────────────────────────────────────
function startTimer(seconds) {
  clearTimer();
  const bar = document.getElementById('q-timer-bar'), txt = document.getElementById('q-timer-text');
  if (!seconds) { if (bar) bar.style.width = '0%'; return; }
  let rem = seconds;
  if (bar) bar.style.width = '100%';
  if (txt) txt.textContent = rem + 's';
  timerInterval = setInterval(() => {
    rem--;
    if (bar) bar.style.width = Math.max(0, rem / seconds * 100) + '%';
    if (txt) txt.textContent = rem > 0 ? rem + 's' : '';
    if (rem <= 0) { clearTimer(); resolveQuestionResult(false); }
  }, 1000);
}
function clearTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } const b = document.getElementById('q-timer-bar'); if (b) b.style.width = '0%'; }

// ── State posten ──────────────────────────────────────────────────
function postState(newState) {
  _ignoreNextUpdate = true;
  remoteState = newState;
  applyStateToGrid(localGrid, newState.symbols || []);
  renderCanvas(newState);
  GameSync.save(gameCode, newState);
}

// ── Zuschauer-Fragenansicht ───────────────────────────────────────
function showSpectatorQuestion(aq, activeTeam) {
  const area = document.getElementById('play-area');
  const contextIcon = aq.contextType === 'door' ? '🔒' : '🔮';
  const contextLabel = aq.contextType === 'door' ? 'Tür öffnen' : 'Symbol einsammeln';
  area.innerHTML = `
    <div class="spec-q-screen">
      <div class="spec-q-team">${activeTeam?.emoji || ''} ${activeTeam?.name || ''}</div>
      <div class="spec-q-context">${contextIcon} ${contextLabel}</div>
      <div class="spec-q-text">${_escHtml(aq.question)}</div>
      <div class="spec-q-wait">⏳ Lehrkraft bewertet…</div>
    </div>`;
}

function showSpectatorResult(aq, activeTeam) {
  const area = document.getElementById('play-area');
  const correct = aq.questionResult;
  area.innerHTML = `
    <div class="spec-q-screen">
      <div class="spec-q-team">${activeTeam?.emoji || ''} ${activeTeam?.name || ''}</div>
      <div class="spec-q-text">${_escHtml(aq.question)}</div>
      <div class="spec-q-result ${correct ? 'spec-correct' : 'spec-wrong'}">
        ${correct ? '✓ Richtig!' : '✗ Falsch!'}
      </div>
    </div>`;
}

function _escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Helper ────────────────────────────────────────────────────────
function showScreen(id) { document.querySelectorAll('.play-screen').forEach(s => s.classList.remove('active')); document.getElementById(id)?.classList.add('active'); }
