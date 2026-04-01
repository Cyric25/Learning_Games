/* play.js – Team-Gerät Controller v1 */

// ── Konstanten ───────────────────────────────────────────────────
const TEAM_SYMBOL_ICONS = ['👑', '⚔️', '💎', '🔮', '🗝️', '📜'];
const TEAM_COLORS = ['#1a3a8f', '#8f1a1a', '#1a6b1a', '#6b1a6b', '#8f5a1a', '#1a6b6b'];
const TEAM_EMOJIS = ['🛡️', '🐉', '🦉', '🦊', '🧙', '🤖'];
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
  state.teams.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'team-select-btn';
    btn.style.borderColor = t.color;
    btn.innerHTML = `<span class="ts-emoji">${t.emoji}</span><span class="ts-name">${t.name}</span><span class="ts-icon">${t.symbolIcon}</span>`;
    btn.onclick = () => selectTeam(t.id);
    list.appendChild(btn);
  });
}

function selectTeam(id) {
  myTeamId = id;
  localStorage.setItem('lab_myteam_' + gameCode, id);
  startPlayView();
}

// ── Spielansicht starten ──────────────────────────────────────────
function startPlayView() {
  buildLocalGrid();
  showScreen('play-screen');
  applyState(remoteState);
  GameSync.subscribe(gameCode, onRemoteUpdate);
}

function buildLocalGrid() {
  if (!remoteState) return;
  const { seed, config, teams, symbols, doors } = remoteState;
  const gen = new MazeGenerator(16, 16, seed);
  const result = gen.generate({ doorCount: 14, teamCount: config.teamCount });
  localGrid = result.grid;

  // Apply stored symbols + doors
  applyStateToGrid(localGrid, symbols || [], doors || []);
}

function applyStateToGrid(grid, symbols, doors) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (grid[y][x].type === 'symbol' || grid[y][x].type === 'door') { grid[y][x].type = 'path'; delete grid[y][x].symTeamId; }
  symbols.forEach(s => { if (!s.found) { grid[s.y][s.x].type = 'symbol'; grid[s.y][s.x].symTeamId = s.teamId; } });
  doors.forEach(d => { if (!d.open) grid[d.y][d.x].type = 'door'; });
}

function onRemoteUpdate(data) {
  if (_ignoreNextUpdate) { _ignoreNextUpdate = false; return; }
  remoteState = data;
  applyStateToGrid(localGrid, data.symbols || [], data.doors || []);
  applyState(data);
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
    showWaiting(team);
    return;
  }

  // Mein Zug!
  if (state.phase === 'rolling') {
    showRolling(state);
  } else if (state.phase === 'moving') {
    showMoving(state);
  } else if (state.phase === 'question' && state.activeQuestion?.teamId === myTeamId) {
    // Frage war bereits lokal gestellt – ignore duplicate SSE
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
      <div class="dice-display" id="dice-display">🎲</div>
      <button class="btn-action btn-roll" id="btn-roll-play" onclick="rollDice()">Würfeln</button>
    </div>`;
}

function rollDice() {
  const btn = document.getElementById('btn-roll-play'); if (btn) btn.disabled = true;
  const disp = document.getElementById('dice-display'); if (!disp) return;
  disp.classList.add('rolling');
  let frames = 0;
  diceAnimId = setInterval(() => {
    frames++;
    disp.textContent = DICE_CHARS[Math.floor(Math.random() * 6)];
    if (frames >= 20) {
      clearInterval(diceAnimId); diceAnimId = null;
      const result = Math.floor(Math.random() * 6) + 1;
      disp.textContent = DICE_CHARS[result - 1]; disp.classList.remove('rolling');

      const newState = JSON.parse(JSON.stringify(remoteState));
      newState.diceValue = result;
      newState.stepsRemaining = result;
      newState.phase = 'moving';
      postState(newState);
      showMovingLocal(newState);
    }
  }, 70);
}

// ── Bewegen ───────────────────────────────────────────────────────
function showMoving(state) { showMovingLocal(state); }

function showMovingLocal(state) {
  const area = document.getElementById('play-area');
  const myTeam = state.teams[myTeamId];
  const stepsLeft = state.stepsRemaining;
  const validMoves = computeValidMoves(state);

  const btnN = validMoves.n ? `<button class="dir-btn dir-n ${validMoves.n.cls}" onclick="doMove(${validMoves.n.x},${validMoves.n.y})">▲</button>` : `<button class="dir-btn dir-n" disabled>▲</button>`;
  const btnS = validMoves.s ? `<button class="dir-btn dir-s ${validMoves.s.cls}" onclick="doMove(${validMoves.s.x},${validMoves.s.y})">▼</button>` : `<button class="dir-btn dir-s" disabled>▼</button>`;
  const btnW = validMoves.w ? `<button class="dir-btn dir-w ${validMoves.w.cls}" onclick="doMove(${validMoves.w.x},${validMoves.w.y})">◀</button>` : `<button class="dir-btn dir-w" disabled>◀</button>`;
  const btnE = validMoves.e ? `<button class="dir-btn dir-e ${validMoves.e.cls}" onclick="doMove(${validMoves.e.x},${validMoves.e.y})">▶</button>` : `<button class="dir-btn dir-e" disabled>▶</button>`;

  area.innerHTML = `
    <div class="move-screen">
      <div class="steps-indicator">
        <span class="dice-val">${DICE_CHARS[(state.diceValue||1)-1]}</span>
        <span class="steps-left">${stepsLeft} Schritt${stepsLeft !== 1 ? 'e' : ''}</span>
      </div>
      <div class="dir-grid">
        <div class="dir-row">${btnN}</div>
        <div class="dir-row">${btnW}<span class="dir-center">${myTeam.emoji}</span>${btnE}</div>
        <div class="dir-row">${btnS}</div>
      </div>
      <button class="btn-action btn-skip" onclick="skipTurn()">Zug beenden</button>
    </div>`;
}

function computeValidMoves(state) {
  if (!localGrid) return {};
  const team = state.teams[myTeamId];
  const { x, y } = team;
  const DIRS = { n:{dx:0,dy:-1,wall:1}, e:{dx:1,dy:0,wall:2}, s:{dx:0,dy:1,wall:4}, w:{dx:-1,dy:0,wall:8} };
  const result = {};
  for (const [key, d] of Object.entries(DIRS)) {
    const nx = x + d.dx, ny = y + d.dy;
    if (nx < 0 || nx >= 16 || ny < 0 || ny >= 16) continue;
    if (localGrid[y][x].walls & d.wall) continue; // wall
    const closedDoor = (state.doors || []).find(dr => dr.x === nx && dr.y === ny && !dr.open);
    if (closedDoor) { result[key] = { x: nx, y: ny, cls: 'dir-door', door: closedDoor }; continue; }
    const cell = localGrid[ny][nx];
    if (cell.type === 'symbol' && cell.symTeamId === myTeamId) {
      const sym = (state.symbols || []).find(s => s.x === nx && s.y === ny && !s.found);
      if (sym) { result[key] = { x: nx, y: ny, cls: 'dir-sym', sym }; continue; }
    }
    result[key] = { x: nx, y: ny, cls: 'dir-free' };
  }
  return result;
}

function doMove(tx, ty) {
  if (!remoteState || remoteState.phase !== 'moving') return;
  const validMoves = computeValidMoves(remoteState);
  const move = Object.values(validMoves).find(m => m.x === tx && m.y === ty);
  if (!move) return;

  if (move.door) {
    questionContext = { type: 'door', target: { x: tx, y: ty }, door: move.door };
    showQuestionModal();
    return;
  }
  if (move.sym) {
    questionContext = { type: 'symbol', target: { x: tx, y: ty }, sym: move.sym };
    showQuestionModal();
    return;
  }

  // Freier Schritt
  const newState = JSON.parse(JSON.stringify(remoteState));
  newState.teams[myTeamId].x = tx;
  newState.teams[myTeamId].y = ty;
  newState.stepsRemaining--;
  if (newState.stepsRemaining <= 0) {
    newState.phase = 'rolling';
    newState.diceValue = 0;
    newState.stepsRemaining = 0;
    newState.currentTeamIdx = (newState.currentTeamIdx + 1) % newState.teams.length;
  }
  postState(newState);
  showMovingLocal(newState);
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

// ── Frage ─────────────────────────────────────────────────────────
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
  document.getElementById('q-continue').style.display = 'none';

  const optEl = document.getElementById('q-options');
  const openSec = document.getElementById('q-open-section');
  if (q.type === 'multiple_choice' && q.options?.length) {
    optEl.style.display = ''; openSec.style.display = 'none'; optEl.innerHTML = '';
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button'); btn.className = 'answer-btn'; btn.textContent = opt;
      btn.onclick = () => resolveChoice(i); optEl.appendChild(btn);
    });
  } else {
    optEl.style.display = 'none'; openSec.style.display = '';
    document.getElementById('q-open-answer').textContent = q.answer || '';
    document.getElementById('q-open-answer').style.display = 'none';
    document.getElementById('q-show-answer').style.display = '';
    document.getElementById('q-open-actions').style.display = 'none';
  }

  startTimer(remoteState.config?.timerSeconds || 0);
  modal.classList.add('active');
}

function resolveChoice(idx) {
  clearTimer();
  const q = questionContext.question;
  const correct = idx === q.correctIndex;
  document.querySelectorAll('.answer-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correctIndex) btn.classList.add('correct');
    else if (i === idx && !correct) btn.classList.add('wrong');
  });
  resolveQuestionResult(correct);
}

function showOpenAnswer() {
  document.getElementById('q-open-answer').style.display = '';
  document.getElementById('q-show-answer').style.display = 'none';
  document.getElementById('q-open-actions').style.display = 'flex';
}

function resolveOpen(correct) { clearTimer(); resolveQuestionResult(correct); }

function resolveQuestionResult(correct) {
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
  document.getElementById('q-continue').style.display = '';
}

function continueAfterQuestion() {
  clearTimer();
  document.getElementById('question-modal').classList.remove('active');

  const ctx = questionContext;
  questionContext = null;
  const wasCorrect = document.getElementById('q-result').classList.contains('result-correct');

  const newState = JSON.parse(JSON.stringify(remoteState));
  const used = new Set(newState.usedQuestionIds || []);
  if (ctx.question) used.add(ctx.question.id);
  newState.usedQuestionIds = [...used];

  if (ctx.type === 'door' && wasCorrect) {
    const door = newState.doors.find(d => d.x === ctx.target.x && d.y === ctx.target.y);
    if (door) { door.open = true; door.openedBy = myTeamId; }
    // Move through door
    newState.teams[myTeamId].x = ctx.target.x;
    newState.teams[myTeamId].y = ctx.target.y;
    newState.stepsRemaining--;
  } else if (ctx.type === 'symbol' && wasCorrect) {
    const sym = newState.symbols.find(s => s.x === ctx.target.x && s.y === ctx.target.y && !s.found);
    if (sym) { sym.found = true; sym.foundBy = myTeamId; }
    newState.teams[myTeamId].score += 10;
    newState.teams[myTeamId].symbolsFound++;
    newState.teams[myTeamId].x = ctx.target.x;
    newState.teams[myTeamId].y = ctx.target.y;
    newState.stepsRemaining--;

    // Check win
    if (newState.teams[myTeamId].symbolsFound >= (newState.config?.symbolsPerTeam || 7)) {
      newState.teams[myTeamId].score += 50;
      newState.phase = 'finished';
      postState(newState);
      showFinished(newState);
      return;
    }
  }

  // End turn if no steps left (or wrong answer for door)
  if (newState.stepsRemaining <= 0 || (ctx.type === 'door' && !wasCorrect)) {
    if (ctx.type !== 'door' || !wasCorrect) {
      newState.phase = 'rolling'; newState.diceValue = 0; newState.stepsRemaining = 0;
      newState.currentTeamIdx = (newState.currentTeamIdx + 1) % newState.teams.length;
    } else if (newState.stepsRemaining <= 0) {
      newState.phase = 'rolling'; newState.diceValue = 0; newState.stepsRemaining = 0;
      newState.currentTeamIdx = (newState.currentTeamIdx + 1) % newState.teams.length;
    }
  }

  applyStateToGrid(localGrid, newState.symbols || [], newState.doors || []);
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
  GameSync.save(gameCode, newState);
}

// ── Helper ────────────────────────────────────────────────────────
function showScreen(id) { document.querySelectorAll('.play-screen').forEach(s => s.classList.remove('active')); document.getElementById(id)?.classList.add('active'); }
