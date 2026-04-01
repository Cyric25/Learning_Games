/* labyrinth.js – Spiellogik v2 (Würfel + Teamspezifische Symbole) */

// ── Konstanten ───────────────────────────────────────────────────
const TEAM_SYMBOL_ICONS = ['👑', '⚔️', '💎', '🔮', '🗝️', '📜'];
const TEAM_COLORS = ['#1a3a8f', '#8f1a1a', '#1a6b1a', '#6b1a6b', '#8f5a1a', '#1a6b6b'];
const TEAM_EMOJIS = ['🛡️', '🐉', '🦉', '🦊', '🧙', '🤖'];
const DICE_CHARS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const DEFAULT_NAMES = ['Ritter', 'Drachen', 'Eulen', 'Füchse', 'Magier', 'Roboter'];

// ── State ────────────────────────────────────────────────────────
let allQuestions = [];
let activeCategories = new Set();
let usedQuestionIds = new Set();

let gameState = {
  phase: 'setup', // setup | rolling | moving | question | finished
  teams: [],
  currentTeamIdx: 0,
  maze: null,
  allSymbols: [],
  diceValue: 0,
  stepsRemaining: 0,
  config: { teamCount: 4, symbolsPerTeam: 7, timerSeconds: 20, kategorien: [] },
  _validFree: new Set(),
  _validDoor: new Set(),
  _validSym: new Set(),
};

let renderer = null;
let questionContext = null;
let timerInterval = null;
let timerRemaining = 0;
let diceAnimInterval = null;

// ── Init ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadQuestions();
  buildSetupUI();

  document.getElementById('maze-canvas').addEventListener('click', e => {
    if (gameState.phase !== 'moving' || !renderer) return;
    const cell = renderer.getCellFromClick(e.clientX, e.clientY);
    if (cell) attemptMove(cell.x, cell.y);
  });

  document.addEventListener('keydown', e => {
    if (gameState.phase !== 'moving') return;
    const dirs = { ArrowUp:{dx:0,dy:-1}, ArrowDown:{dx:0,dy:1}, ArrowLeft:{dx:-1,dy:0}, ArrowRight:{dx:1,dy:0} };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const t = currentTeam();
    attemptMove(t.x + d.dx, t.y + d.dy);
  });
});

// ── Fragen laden ─────────────────────────────────────────────────
async function loadQuestions() {
  let data = null;
  try { const r = await fetch('../api.php?f=questions'); if (r.ok) data = await r.json(); } catch(e) {}
  if (!data) { try { const r = await fetch('../data/questions.json'); if (r.ok) data = await r.json(); } catch(e) {} }
  if (!data) { const c = localStorage.getItem('rq_questions'); if (c) data = JSON.parse(c); }
  if (!data) data = { categories: [] };

  const { fragen, kategorien } = convertRQtoLabyrinth(data);
  allQuestions = fragen;
}

function convertRQtoLabyrinth(rqData) {
  const fragen = [], kategorien = [];
  function walk(cat, path) {
    if (cat.subcategories?.length) {
      cat.subcategories.forEach(s => walk(s, path ? `${path} › ${cat.name}` : cat.name));
    } else {
      const full = path ? `${path} › ${cat.name}` : cat.name;
      kategorien.push({ id: cat.id, name: full });
      (cat.questions || []).forEach(q => {
        let diff = q.difficulty <= 200 ? 'leicht' : q.difficulty >= 400 ? 'schwer' : 'mittel';
        fragen.push({ ...q, kategorieId: cat.id, kategorieName: full, schwierigkeit: diff,
          type: q.type === 'mc' ? 'multiple_choice' : 'offen' });
      });
    }
  }
  (rqData.categories || []).forEach(c => walk(c, ''));
  return { fragen, kategorien };
}

// ── Setup UI ─────────────────────────────────────────────────────
function buildSetupUI() {
  buildCategoryUI();
  buildTeamCountUI();
  buildTeamConfigUI();
  buildSymbolsPerTeamUI();
  buildTimerUI();
}

function buildCategoryUI() {
  const catMap = new Map();
  allQuestions.forEach(q => {
    if (!catMap.has(q.kategorieId)) catMap.set(q.kategorieId, { id: q.kategorieId, name: q.kategorieName });
    activeCategories.add(q.kategorieId);
  });
  const cats = [...catMap.values()];
  const section = document.getElementById('category-section');
  const list = document.getElementById('cat-select-list');
  if (!cats.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  list.innerHTML = '';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-toggle-btn active';
    btn.dataset.catId = cat.id;
    btn.textContent = cat.name.split(' › ').pop();
    btn.title = cat.name;
    btn.onclick = () => {
      if (activeCategories.has(cat.id)) { activeCategories.delete(cat.id); btn.classList.remove('active'); }
      else { activeCategories.add(cat.id); btn.classList.add('active'); }
      updateCategoryInfo();
    };
    list.appendChild(btn);
  });
  updateCategoryInfo();
}

function toggleAllCategories(on) {
  document.querySelectorAll('#cat-select-list .cat-toggle-btn').forEach(btn => {
    on ? activeCategories.add(btn.dataset.catId) : activeCategories.delete(btn.dataset.catId);
    btn.classList.toggle('active', on);
  });
  updateCategoryInfo();
}

function updateCategoryInfo() {
  const el = document.getElementById('cat-select-info');
  if (!el) return;
  const n = allQuestions.filter(q => activeCategories.has(q.kategorieId)).length;
  el.textContent = `${n} Fragen aus ${activeCategories.size} Kategorien verfügbar`;
}

function buildTeamCountUI() {
  const row = document.getElementById('team-count-row');
  row.innerHTML = '';
  [2, 3, 4, 5, 6].forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (n === gameState.config.teamCount ? ' active' : '');
    btn.textContent = n;
    btn.onclick = () => {
      gameState.config.teamCount = n;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildTeamConfigUI();
    };
    row.appendChild(btn);
  });
}

function buildTeamConfigUI() {
  const list = document.getElementById('team-config-list');
  list.innerHTML = '';
  for (let i = 0; i < gameState.config.teamCount; i++) {
    const row = document.createElement('div');
    row.className = 'team-config-row';
    const em = document.createElement('span');
    em.className = 'team-config-emoji';
    em.textContent = TEAM_EMOJIS[i];
    em.style.color = TEAM_COLORS[i];
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'team-name-input';
    inp.value = DEFAULT_NAMES[i]; inp.maxLength = 20;
    inp.dataset.teamIdx = i;
    row.appendChild(em); row.appendChild(inp);
    list.appendChild(row);
  }
}

function buildSymbolsPerTeamUI() {
  const row = document.getElementById('symbols-per-team-row');
  if (!row) return;
  row.innerHTML = '';
  [6, 7, 8].forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (n === gameState.config.symbolsPerTeam ? ' active' : '');
    btn.textContent = n;
    btn.onclick = () => {
      gameState.config.symbolsPerTeam = n;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    row.appendChild(btn);
  });
}

function buildTimerUI() {
  const row = document.getElementById('timer-row');
  row.innerHTML = '';
  [{ label: '15s', v: 15 }, { label: '20s', v: 20 }, { label: '30s', v: 30 }, { label: 'Kein', v: 0 }].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (opt.v === gameState.config.timerSeconds ? ' active' : '');
    btn.textContent = opt.label;
    btn.onclick = () => {
      gameState.config.timerSeconds = opt.v;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    row.appendChild(btn);
  });
}

// ── Spiel starten ─────────────────────────────────────────────────
function startGame() {
  const errEl = document.getElementById('setup-error');
  errEl.textContent = '';

  if (activeCategories.size === 0) { errEl.textContent = 'Bitte mindestens eine Kategorie auswählen.'; return; }

  const avail = allQuestions.filter(q => activeCategories.has(q.kategorieId)).length;
  const needed = gameState.config.teamCount * gameState.config.symbolsPerTeam;
  if (avail < needed) { errEl.textContent = `Zu wenig Fragen. Benötigt: ${needed}, Verfügbar: ${avail}`; return; }

  const inputs = document.querySelectorAll('.team-name-input');
  gameState.teams = [];
  for (let i = 0; i < gameState.config.teamCount; i++) {
    gameState.teams.push({
      id: i, name: inputs[i]?.value.trim() || DEFAULT_NAMES[i],
      emoji: TEAM_EMOJIS[i], symbolIcon: TEAM_SYMBOL_ICONS[i], color: TEAM_COLORS[i],
      x: 0, y: 0, score: 0, symbolsFound: 0,
    });
  }

  gameState.config.kategorien = [...activeCategories];

  const seed = Date.now() & 0xffffffff;
  const gen = new MazeGenerator(16, 16, seed);
  const result = gen.generate({ doorCount: 14, teamCount: gameState.config.teamCount });
  gameState.maze = result;
  gameState.currentTeamIdx = 0;
  gameState.phase = 'rolling';
  gameState.diceValue = 0;
  gameState.stepsRemaining = 0;
  usedQuestionIds.clear();

  result.startPositions.forEach((pos, i) => {
    if (gameState.teams[i]) { gameState.teams[i].x = pos.x; gameState.teams[i].y = pos.y; }
  });

  gameState.allSymbols = placeTeamSymbols(result.grid, gameState.teams, gameState.config.symbolsPerTeam);

  const canvas = document.getElementById('maze-canvas');
  renderer = new MazeRenderer(canvas);
  renderer.setMaze(result);
  renderer.render(gameState);

  showScreen('game-screen');
  updateGameUI();
}

// ── Symbole platzieren ────────────────────────────────────────────
function placeTeamSymbols(grid, teams, perTeam) {
  const W = 16, H = 16;
  const symbols = [];

  const excluded = new Set();
  teams.forEach(t => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const nx = t.x + dx, ny = t.y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) excluded.add(`${nx},${ny}`);
      }
  });

  const allCells = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (excluded.has(`${x},${y}`)) continue;
      if (grid[y][x].type === 'door') continue;
      allCells.push({ x, y });
    }

  const rng = new SeededRNG((Date.now() * 7 + 13) & 0xffffffff);
  rng.shuffle(allCells);

  for (let ti = 0; ti < teams.length; ti++) {
    let placed = 0;
    for (const cell of allCells) {
      if (placed >= perTeam) break;
      if (symbols.some(s => s.x === cell.x && s.y === cell.y)) continue;
      let tooClose = false;
      for (const s of symbols) {
        if (s.teamId === ti && Math.abs(s.x - cell.x) + Math.abs(s.y - cell.y) < 3) { tooClose = true; break; }
      }
      if (tooClose) continue;
      symbols.push({ id: `sym-${ti}-${placed}`, teamId: ti, x: cell.x, y: cell.y, found: false, foundBy: null });
      grid[cell.y][cell.x].type = 'symbol';
      grid[cell.y][cell.x].symTeamId = ti;
      placed++;
    }
  }
  return symbols;
}

// ── UI aktualisieren ──────────────────────────────────────────────
function updateGameUI() {
  const team = currentTeam();

  const banner = document.getElementById('active-team-banner');
  if (banner) { banner.textContent = `${team.emoji} ${team.name} ist dran`; banner.style.background = team.color; }

  updateThemeBtnText();
  updateDiceUI();
  renderTeamList();
  renderer?.render(gameState);
}

function renderTeamList() {
  const list = document.getElementById('team-list');
  if (!list) return;
  list.innerHTML = '';
  gameState.teams.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'team-item' + (i === gameState.currentTeamIdx ? ' active' : '');
    div.style.borderColor = t.color;

    const fig = document.createElement('span');
    fig.className = 'team-figure';
    fig.textContent = t.emoji;

    const info = document.createElement('div');
    info.className = 'team-info';
    info.innerHTML = `<div class="team-name">${t.name}</div><div class="team-score">${t.score} Pkt</div>`;

    // Symbol progress bar
    const bar = document.createElement('div');
    bar.className = 'team-sym-bar';
    const teamSyms = gameState.allSymbols.filter(s => s.teamId === t.id);
    teamSyms.forEach(s => {
      const dot = document.createElement('span');
      dot.className = 'team-sym-dot' + (s.found ? ' found' : '');
      dot.style.background = s.found ? t.color : 'rgba(245,230,200,0.25)';
      dot.title = s.found ? `${t.symbolIcon} gefunden` : '○';
      bar.appendChild(dot);
    });
    info.appendChild(bar);

    div.appendChild(fig);
    div.appendChild(info);
    list.appendChild(div);
  });
}

function updateDiceUI() {
  const diceArea = document.getElementById('dice-area');
  const stepsArea = document.getElementById('steps-area');
  if (!diceArea || !stepsArea) return;

  const df = document.getElementById('dice-face');
  const sc = document.getElementById('steps-count'); // .steps-number span

  if (gameState.phase === 'rolling') {
    diceArea.style.display = 'flex';
    stepsArea.style.display = 'none';
    if (df) df.textContent = gameState.diceValue > 0 ? DICE_CHARS[gameState.diceValue - 1] : '🎲';
    const btnRoll = document.getElementById('btn-roll');
    if (btnRoll) btnRoll.disabled = false;
  } else if (gameState.phase === 'moving') {
    diceArea.style.display = 'none';
    stepsArea.style.display = 'flex';
    if (sc) sc.textContent = gameState.stepsRemaining;
  } else {
    diceArea.style.display = 'none';
    stepsArea.style.display = 'none';
  }
}

// ── Würfeln ───────────────────────────────────────────────────────
function rollDice() {
  if (gameState.phase !== 'rolling') return;
  if (diceAnimInterval) return;

  const diceface = document.getElementById('dice-face');
  const btnRoll = document.getElementById('btn-roll');
  if (btnRoll) btnRoll.disabled = true;
  if (diceface) diceface.classList.add('rolling');

  let frames = 0;
  diceAnimInterval = setInterval(() => {
    frames++;
    if (diceface) diceface.textContent = DICE_CHARS[Math.floor(Math.random() * 6)];

    if (frames >= 20) {
      clearInterval(diceAnimInterval);
      diceAnimInterval = null;
      const result = Math.floor(Math.random() * 6) + 1;
      gameState.diceValue = result;
      gameState.stepsRemaining = result;
      gameState.phase = 'moving';
      if (diceface) { diceface.textContent = DICE_CHARS[result - 1]; diceface.classList.remove('rolling'); }
      updateValidMoves();
      updateGameUI();
    }
  }, 70);
}

// ── Gültige Züge ─────────────────────────────────────────────────
function updateValidMoves() {
  gameState._validFree = new Set();
  gameState._validDoor = new Set();
  gameState._validSym = new Set();
  if (gameState.phase !== 'moving') return;

  const team = currentTeam();
  const grid = gameState.maze.grid;
  const WALLMAP = [{ dx:0, dy:-1, wall:1 }, { dx:1, dy:0, wall:2 }, { dx:0, dy:1, wall:4 }, { dx:-1, dy:0, wall:8 }];

  WALLMAP.forEach(d => {
    const nx = team.x + d.dx, ny = team.y + d.dy;
    if (nx < 0 || nx >= 16 || ny < 0 || ny >= 16) return;
    if (grid[team.y][team.x].walls & d.wall) return;

    const key = `${nx},${ny}`;
    const closedDoor = gameState.maze.doors.find(dr => dr.x === nx && dr.y === ny && !dr.open);
    if (closedDoor) { gameState._validDoor.add(key); return; }

    const cell = grid[ny][nx];
    if (cell.type === 'symbol' && cell.symTeamId === gameState.currentTeamIdx) {
      const sym = gameState.allSymbols.find(s => s.x === nx && s.y === ny && !s.found);
      if (sym) { gameState._validSym.add(key); return; }
    }
    gameState._validFree.add(key);
  });
}

// ── Bewegung ──────────────────────────────────────────────────────
function attemptMove(tx, ty) {
  if (gameState.phase !== 'moving') return;
  const key = `${tx},${ty}`;

  if (gameState._validDoor.has(key)) {
    const door = gameState.maze.doors.find(d => d.x === tx && d.y === ty && !d.open);
    if (door) { questionContext = { type: 'door', target: { x: tx, y: ty }, door }; showQuestion(); }
    return;
  }
  if (gameState._validSym.has(key)) {
    const sym = gameState.allSymbols.find(s => s.x === tx && s.y === ty && !s.found && s.teamId === gameState.currentTeamIdx);
    if (sym) { questionContext = { type: 'symbol', target: { x: tx, y: ty }, sym }; showQuestion(); }
    return;
  }
  if (gameState._validFree.has(key)) {
    executeMove(tx, ty);
  }
}

function executeMove(tx, ty) {
  const team = currentTeam();
  team.x = tx;
  team.y = ty;
  gameState.stepsRemaining--;

  if (gameState.stepsRemaining <= 0) {
    endTurn();
  } else {
    updateValidMoves();
    updateGameUI();
  }
}

function endTurn() {
  gameState.phase = 'rolling';
  gameState.diceValue = 0;
  gameState.stepsRemaining = 0;
  gameState._validFree = new Set();
  gameState._validDoor = new Set();
  gameState._validSym = new Set();
  gameState.currentTeamIdx = (gameState.currentTeamIdx + 1) % gameState.teams.length;
  updateGameUI();
}

function skipRemainingSteps() {
  endTurn();
}

// ── Frage ─────────────────────────────────────────────────────────
function showQuestion() {
  gameState.phase = 'question';
  updateDiceUI();

  const q = pickQuestion();
  if (!q) { continueAfterQuestion(); return; }

  questionContext.question = q;
  usedQuestionIds.add(q.id);

  document.getElementById('q-cat-name').textContent = q.kategorieName?.split(' › ').pop() || '';
  const diffEl = document.getElementById('q-difficulty');
  diffEl.textContent = q.schwierigkeit || '';
  diffEl.className = 'modal-difficulty diff-' + (q.schwierigkeit || '');

  const trigger = document.getElementById('q-trigger-type');
  if (questionContext.type === 'door') {
    trigger.textContent = '🔒 Tür öffnen'; trigger.className = 'modal-trigger trigger-door';
  } else {
    const t = currentTeam();
    trigger.textContent = `${t.symbolIcon} Symbol einsammeln`; trigger.className = 'modal-trigger trigger-symbol';
  }

  document.getElementById('q-text').textContent = q.question;
  document.getElementById('q-result').textContent = '';
  document.getElementById('q-result').className = 'modal-result';
  document.getElementById('q-continue').style.display = 'none';

  const optionsEl = document.getElementById('q-options');
  const openSec = document.getElementById('q-open-section');

  if (q.type === 'multiple_choice' && q.options?.length) {
    optionsEl.style.display = '';
    openSec.style.display = 'none';
    optionsEl.innerHTML = '';
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = opt;
      btn.onclick = () => resolveChoice(i);
      optionsEl.appendChild(btn);
    });
  } else {
    optionsEl.style.display = 'none';
    openSec.style.display = '';
    document.getElementById('q-open-answer').textContent = q.answer || '';
    document.getElementById('q-open-answer').style.display = 'none';
    document.getElementById('q-show-answer').style.display = '';
    document.getElementById('q-open-actions').style.display = 'none';
  }

  startTimer(gameState.config.timerSeconds);
  document.getElementById('question-modal').classList.add('active');
}

function pickQuestion() {
  const cats = gameState.config.kategorien.length > 0 ? gameState.config.kategorien : [...activeCategories];
  let pool = allQuestions.filter(q => cats.includes(q.kategorieId) && !usedQuestionIds.has(q.id));
  if (!pool.length) {
    usedQuestionIds.clear();
    pool = allQuestions.filter(q => cats.includes(q.kategorieId));
  }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function startTimer(seconds) {
  clearTimer();
  const bar = document.getElementById('q-timer-bar');
  const txt = document.getElementById('q-timer-text');
  if (!seconds || seconds <= 0) { if (bar) bar.style.width = '0%'; return; }
  timerRemaining = seconds;
  if (bar) bar.style.width = '100%';
  if (txt) txt.textContent = seconds + 's';
  timerInterval = setInterval(() => {
    timerRemaining--;
    if (bar) bar.style.width = Math.max(0, timerRemaining / seconds * 100) + '%';
    if (txt) txt.textContent = timerRemaining > 0 ? timerRemaining + 's' : '';
    if (timerRemaining <= 0) { clearTimer(); resolveQuestion(false, true); }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  const bar = document.getElementById('q-timer-bar');
  if (bar) bar.style.width = '0%';
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
  resolveQuestion(correct, false);
}

function showOpenAnswer() {
  document.getElementById('q-open-answer').style.display = '';
  document.getElementById('q-show-answer').style.display = 'none';
  document.getElementById('q-open-actions').style.display = 'flex';
}

function resolveOpen(correct) { clearTimer(); resolveQuestion(correct, false); }

function resolveQuestion(correct, timedOut) {
  const ctx = questionContext;
  const team = currentTeam();
  const resultEl = document.getElementById('q-result');

  document.querySelectorAll('.answer-btn').forEach(b => b.disabled = true);
  document.getElementById('q-open-actions').style.display = 'none';

  if (timedOut) {
    resultEl.textContent = '⏱️ Zeit abgelaufen!';
    resultEl.className = 'modal-result result-wrong';
  } else if (correct) {
    resultEl.className = 'modal-result result-correct';
    if (ctx.type === 'door') {
      resultEl.textContent = '✓ Richtig! Die Tür öffnet sich!';
      ctx.door.open = true;
      ctx.door.openedBy = team.id;
      gameState.maze.grid[ctx.target.y][ctx.target.x].type = 'path';
    } else {
      resultEl.textContent = `✓ Richtig! ${team.symbolIcon} Symbol eingesammelt! +10 Punkte`;
      team.score += 10;
      ctx.sym.found = true;
      ctx.sym.foundBy = team.id;
      team.symbolsFound++;
      gameState.maze.grid[ctx.target.y][ctx.target.x].type = 'path';
      gameState.maze.grid[ctx.target.y][ctx.target.x].symTeamId = undefined;
    }
  } else {
    resultEl.textContent = '✗ Leider falsch.';
    resultEl.className = 'modal-result result-wrong';
  }

  document.getElementById('q-continue').style.display = '';
  renderer?.render(gameState);
}

function continueAfterQuestion() {
  clearTimer();
  document.getElementById('question-modal').classList.remove('active');

  const ctx = questionContext;
  const wasCorrect = document.getElementById('q-result').classList.contains('result-correct');
  questionContext = null;

  if (ctx?.type === 'door' && ctx.door?.open) {
    gameState.phase = 'moving';
    executeMove(ctx.target.x, ctx.target.y);
    // Check for win after move (executeMove may have called endTurn already if steps ran out)
    return;
  }

  if (ctx?.type === 'symbol' && wasCorrect && ctx.sym?.found) {
    gameState.phase = 'moving';
    // Move to symbol cell
    const team = currentTeam();
    team.x = ctx.target.x;
    team.y = ctx.target.y;
    gameState.stepsRemaining--;

    // Check win
    if (team.symbolsFound >= gameState.config.symbolsPerTeam) {
      team.score += 50;
      showResult();
      return;
    }

    if (gameState.stepsRemaining <= 0) {
      endTurn();
    } else {
      updateValidMoves();
      updateGameUI();
    }
    return;
  }

  // Wrong answer for door or symbol: don't move, keep steps
  gameState.phase = 'moving';
  updateValidMoves();
  updateGameUI();
}

// ── Spielende ─────────────────────────────────────────────────────
function showResult() {
  gameState.phase = 'finished';
  const sorted = [...gameState.teams].sort((a, b) => b.symbolsFound - a.symbolsFound || b.score - a.score);
  const winner = sorted[0];

  document.getElementById('result-winner').innerHTML =
    `${winner.emoji} <strong>${winner.name}</strong> hat gewonnen mit ${winner.symbolsFound} von ${gameState.config.symbolsPerTeam} Symbolen!`;

  const tbody = document.getElementById('result-ranking-body');
  tbody.innerHTML = '';
  sorted.forEach((t, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'winner-row';
    tr.innerHTML = `<td>${i + 1}.</td><td>${t.emoji} ${t.name}</td><td>${t.symbolsFound} / ${gameState.config.symbolsPerTeam}</td>`;
    tbody.appendChild(tr);
  });

  showScreen('result-screen');
}

// ── Helper ────────────────────────────────────────────────────────
function currentTeam() { return gameState.teams[gameState.currentTeamIdx]; }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function confirmQuit() {
  if (confirm('Spiel wirklich beenden?')) { showScreen('setup-screen'); gameState.phase = 'setup'; }
}

function playAgain() {
  showScreen('setup-screen');
  gameState.phase = 'setup';
  gameState.teams = [];
  gameState.allSymbols = [];
}

function updateThemeBtnText() {
  const dark = document.body.classList.contains('dark');
  ['btn-theme', 'btn-theme-game'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = dark ? '☀️ Lightmode' : '🌙 Darkmode';
  });
}

// ── Theme ─────────────────────────────────────────────────────────
(function () {
  const KEY = 'spiele_theme';
  function apply(dark) {
    document.body.classList.toggle('dark', dark);
    updateThemeBtnText();
    renderer?.invalidateColors();
    renderer?.render(gameState);
  }
  window.toggleTheme = function () {
    const d = !document.body.classList.contains('dark');
    localStorage.setItem(KEY, d ? 'dark' : 'light');
    apply(d);
  };
  apply(localStorage.getItem(KEY) === 'dark');
})();
