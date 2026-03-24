/* labyrinth.js – Labyrinth-Quiz Spiellogik */

// ── Constants ────────────────────────────────────────────────────
const FIGURES = [
  { id: 'knight', emoji: '🛡️', name: 'Ritter' },
  { id: 'dragon', emoji: '🐉', name: 'Drache' },
  { id: 'owl',    emoji: '🦉', name: 'Eule' },
  { id: 'fox',    emoji: '🦊', name: 'Fuchs' },
  { id: 'wizard', emoji: '🧙', name: 'Zauberer' },
  { id: 'robot',  emoji: '🤖', name: 'Roboter' }
];

const TEAM_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];

const TIMER_OPTIONS = [
  { value: 15, label: '15s' },
  { value: 20, label: '20s' },
  { value: 30, label: '30s' },
  { value: 0,  label: 'Kein Limit' }
];

const SYMBOL_OPTIONS = [6, 9, 12, 15, 18];
const MAZE_SIZE = 16;

// ── State ────────────────────────────────────────────────────────
let fragenBank = null;          // { kategorien: [], fragen: [] }
let selectedCategoryIds = new Set();

let gameState = {
  maze: null,
  seed: 0,
  teams: [],
  currentTeamIdx: 0,
  phase: 'setup',               // setup | playing | finished
  symbols: [],
  doors: [],
  usedQuestionIds: new Set(),
  config: {
    symbolCount: 12,
    timerSeconds: 20,
    teamCount: 4
  }
};

let renderer = null;
let timerInterval = null;
let timerRemaining = 0;
let currentQuestion = null;
let questionResolved = false;
let pendingTrigger = null;      // { type: 'door'|'symbol', index, targetX, targetY }
let animating = false;

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderTeamCountSelector();
  renderTimerSelector();
  renderSymbolSelector();
  renderTeamConfig();
  loadFragen();
});

// ── Question Loading (shared pattern) ────────────────────────────
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

  if (!rqData) {
    const ls = localStorage.getItem('rq_questions');
    if (ls) try { const d = JSON.parse(ls); if (d.categories && d.categories.length) rqData = d; } catch (e) {}
  }

  if (rqData && rqData.categories && rqData.categories.length > 0) {
    fragenBank = convertRQtoLabyrinth(rqData);
    renderCategorySelector();
    return;
  }

  document.getElementById('setup-error').textContent =
    'Keine Fragen geladen. Bitte Fragen in der zentralen Fragendatenbank anlegen.';
  document.getElementById('btn-start').disabled = true;
}

function convertRQtoLabyrinth(rqData) {
  const kategorien = [];
  const fragen = [];
  const icons = ['🧪', '🧬', '⚗️', '🔬', '🌍', '📐', '💡', '🎯', '📖', '🧮'];
  const colors = ['#332288', '#88ccee', '#44aa99', '#117733', '#999933',
                  '#ddcc77', '#cc6677', '#882255', '#aa4499', '#0077bb'];
  let colorIdx = 0;

  function collectLeafCategories(node, path, parentIcon) {
    const subs = node.subcategories || [];
    const hasQuestions = node.questions && node.questions.length > 0;

    if (hasQuestions) {
      const katId = node.id;
      const katName = path.join(' \u203a ');
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

        if (q.type === 'mc' && q.options && q.options.length > 0) {
          typ = 'multiple_choice';
          antworten = q.options.slice();
          richtig = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
        } else {
          typ = 'offen';
          antworten = [];
          richtig = -1;
        }

        fragen.push({
          id: q.id,
          kategorie: katId,
          schwierigkeit,
          frage: q.question || '',
          typ,
          antworten,
          richtig,
          erklaerung: q.answer || q.hint || ''
        });
      });
    }

    subs.forEach(sub => collectLeafCategories(sub, [...path, sub.name], parentIcon));
  }

  (rqData.categories || []).forEach((cat, i) => {
    const icon = icons[i % icons.length];
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

// ── Setup UI Renderers ───────────────────────────────────────────
function renderTeamCountSelector() {
  const row = document.getElementById('team-count-row');
  row.innerHTML = '';
  for (let n = 2; n <= 6; n++) {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (n === gameState.config.teamCount ? ' active' : '');
    btn.textContent = n + ' Gruppen';
    btn.onclick = () => {
      gameState.config.teamCount = n;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTeamConfig();
    };
    row.appendChild(btn);
  }
}

function renderTimerSelector() {
  const row = document.getElementById('timer-row');
  row.innerHTML = '';
  TIMER_OPTIONS.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (opt.value === gameState.config.timerSeconds ? ' active' : '');
    btn.textContent = opt.label;
    btn.onclick = () => {
      gameState.config.timerSeconds = opt.value;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    row.appendChild(btn);
  });
}

function renderSymbolSelector() {
  const row = document.getElementById('symbol-row');
  row.innerHTML = '';
  SYMBOL_OPTIONS.forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'param-btn' + (n === gameState.config.symbolCount ? ' active' : '');
    btn.textContent = n + ' Symbole';
    btn.onclick = () => {
      gameState.config.symbolCount = n;
      row.querySelectorAll('.param-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateCatSelectInfo();
    };
    row.appendChild(btn);
  });
}

function renderTeamConfig() {
  const list = document.getElementById('team-config-list');
  list.innerHTML = '';

  // Preserve existing team data
  const oldTeams = gameState.teams || [];
  const usedFigures = new Set();
  gameState.teams = [];

  for (let i = 0; i < gameState.config.teamCount; i++) {
    const old = oldTeams[i] || {};
    const team = {
      id: i,
      name: old.name || 'Gruppe ' + (i + 1),
      emoji: old.emoji || FIGURES[i % FIGURES.length].emoji,
      figureId: old.figureId || FIGURES[i % FIGURES.length].id,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
      x: 0, y: 0,
      score: 0,
      symbolsCollected: 0
    };
    usedFigures.add(team.figureId);
    gameState.teams.push(team);

    const item = document.createElement('div');
    item.className = 'team-config-item';

    const dot = document.createElement('div');
    dot.className = 'team-color-dot';
    dot.style.background = team.color;

    const nameInput = document.createElement('input');
    nameInput.className = 'team-name-input';
    nameInput.type = 'text';
    nameInput.value = team.name;
    nameInput.maxLength = 20;
    nameInput.oninput = () => { team.name = nameInput.value || 'Gruppe ' + (i + 1); };

    const figureSelect = document.createElement('div');
    figureSelect.className = 'team-figure-select';

    FIGURES.forEach(fig => {
      const btn = document.createElement('button');
      btn.className = 'figure-btn';
      if (team.figureId === fig.id) btn.classList.add('active');
      btn.textContent = fig.emoji;
      btn.title = fig.name;
      btn.onclick = () => {
        // Check if already taken by another team
        const takenBy = gameState.teams.find(t => t.id !== team.id && t.figureId === fig.id);
        if (takenBy) return;

        team.figureId = fig.id;
        team.emoji = fig.emoji;
        renderTeamConfig(); // re-render to update taken states
      };
      figureSelect.appendChild(btn);
    });

    item.append(dot, nameInput, figureSelect);
    list.appendChild(item);
  }

  // Update taken state
  updateFigureTakenState();
}

function updateFigureTakenState() {
  const takenFigures = new Set(gameState.teams.map(t => t.figureId));
  document.querySelectorAll('.team-config-item').forEach((item, teamIdx) => {
    item.querySelectorAll('.figure-btn').forEach((btn, figIdx) => {
      const fig = FIGURES[figIdx];
      btn.classList.toggle('taken',
        takenFigures.has(fig.id) && gameState.teams[teamIdx].figureId !== fig.id
      );
      btn.classList.toggle('active', gameState.teams[teamIdx].figureId === fig.id);
    });
  });
}

// ── Category Selector ────────────────────────────────────────────
function renderCategorySelector() {
  if (!fragenBank || !fragenBank.kategorien.length) return;

  document.getElementById('category-section').style.display = '';
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
      '<span class="cat-select-icon">' + kat.icon + '</span>' +
      '<span class="cat-select-name">' + kat.name + '</span>' +
      '<span class="cat-select-count">' + qCount + ' Fragen</span>' +
      '<div class="cat-select-check">\u2713</div>';
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
  if (selectAll) {
    fragenBank.kategorien.forEach(k => selectedCategoryIds.add(k.id));
  }
  items.forEach(item => {
    item.classList.toggle('selected', selectAll);
  });
  updateCatSelectInfo();
}

function updateCatSelectInfo() {
  const info = document.getElementById('cat-select-info');
  const total = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie)).length;
  const needed = gameState.config.symbolCount;

  if (selectedCategoryIds.size === 0) {
    info.textContent = 'Mindestens 1 Kategorie auswählen';
    info.className = 'cat-select-info warning';
  } else if (total < needed) {
    info.textContent = `Nur ${total} Fragen verfügbar, ${needed} benötigt. Weniger Symbole wählen oder mehr Kategorien aktivieren.`;
    info.className = 'cat-select-info warning';
  } else {
    info.textContent = `${total} Fragen verfügbar aus ${selectedCategoryIds.size} Kategorien`;
    info.className = 'cat-select-info';
  }
}

// ── Start Game ───────────────────────────────────────────────────
function startGame() {
  const errorEl = document.getElementById('setup-error');
  errorEl.textContent = '';

  if (selectedCategoryIds.size === 0) {
    errorEl.textContent = 'Mindestens 1 Kategorie auswählen!';
    return;
  }

  const availableFragen = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie));
  if (availableFragen.length < gameState.config.symbolCount) {
    errorEl.textContent = 'Zu wenige Fragen für die gewählte Symbolanzahl!';
    return;
  }

  // Generate maze
  gameState.seed = Date.now();
  const gen = new MazeGenerator(MAZE_SIZE, MAZE_SIZE, gameState.seed);
  const maze = gen.generate({
    doorCount: Math.max(4, Math.floor(gameState.config.symbolCount * 0.5)),
    symbolCount: gameState.config.symbolCount
  });
  gameState.maze = maze;

  // Assign categories to symbols (proportional distribution)
  assignSymbolCategories(maze.symbols);

  // Set doors and symbols in game state
  gameState.doors = maze.doors;
  gameState.symbols = maze.symbols;

  // Reset teams to start position
  gameState.teams.forEach(t => {
    t.x = maze.start.x;
    t.y = maze.start.y;
    t.score = 0;
    t.symbolsCollected = 0;
  });

  gameState.currentTeamIdx = 0;
  gameState.usedQuestionIds = new Set();
  gameState.phase = 'playing';
  gameState.config.kategorien = [...selectedCategoryIds];

  // Switch screens
  showScreen('game-screen');

  // Initialize renderer
  const canvas = document.getElementById('maze-canvas');
  renderer = new MazeRenderer(canvas);
  renderer.setMaze(maze);

  // Enrich symbols with category data for rendering
  gameState.symbols.forEach(sym => {
    sym._category = fragenBank.kategorien.find(k => k.id === sym.categoryId);
  });

  renderer.render(gameState);
  renderer.startPulseLoop();

  updateSidebar();
  updateActiveTeamBanner();

  // Keyboard controls
  document.addEventListener('keydown', handleKeyDown);

  // Canvas click
  canvas.addEventListener('click', handleCanvasClick);

  // Resize handler
  window.addEventListener('resize', handleResize);
  handleResize();
}

function assignSymbolCategories(symbols) {
  const catIds = [...selectedCategoryIds];
  const catCounts = {};
  catIds.forEach(id => {
    catCounts[id] = fragenBank.fragen.filter(q => q.kategorie === id).length;
  });

  const totalFragen = Object.values(catCounts).reduce((s, c) => s + c, 0);

  // Proportional assignment
  let assigned = 0;
  const assignments = [];
  catIds.forEach(id => {
    const proportion = catCounts[id] / totalFragen;
    let count = Math.max(1, Math.round(proportion * symbols.length));
    assignments.push({ id, count });
    assigned += count;
  });

  // Adjust to match exact count
  while (assigned > symbols.length) {
    const maxEntry = assignments.reduce((a, b) => a.count > b.count ? a : b);
    maxEntry.count--;
    assigned--;
  }
  while (assigned < symbols.length) {
    const minEntry = assignments.reduce((a, b) => a.count < b.count ? a : b);
    minEntry.count++;
    assigned++;
  }

  // Create pool and shuffle
  const pool = [];
  assignments.forEach(a => {
    for (let i = 0; i < a.count; i++) pool.push(a.id);
  });

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  symbols.forEach((sym, i) => {
    sym.categoryId = pool[i];
  });
}

// ── Screen Management ────────────────────────────────────────────
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

// ── Game Controls ────────────────────────────────────────────────
function handleKeyDown(e) {
  if (gameState.phase !== 'playing' || animating) return;
  if (document.querySelector('.modal-overlay.visible')) return;

  const team = gameState.teams[gameState.currentTeamIdx];
  let dx = 0, dy = 0;

  switch (e.key) {
    case 'ArrowUp':    case 'w': case 'W': dy = -1; break;
    case 'ArrowDown':  case 's': case 'S': dy = 1;  break;
    case 'ArrowLeft':  case 'a': case 'A': dx = -1; break;
    case 'ArrowRight': case 'd': case 'D': dx = 1;  break;
    default: return;
  }

  e.preventDefault();
  attemptMove(team.x + dx, team.y + dy);
}

function handleCanvasClick(e) {
  if (gameState.phase !== 'playing' || animating) return;
  if (document.querySelector('.modal-overlay.visible')) return;

  const cell = renderer.getCellFromClick(e.clientX, e.clientY);
  if (!cell) return;

  const team = gameState.teams[gameState.currentTeamIdx];
  const dx = cell.x - team.x;
  const dy = cell.y - team.y;

  // Only allow moves to adjacent cells
  if (Math.abs(dx) + Math.abs(dy) !== 1) return;

  attemptMove(cell.x, cell.y);
}

function attemptMove(targetX, targetY) {
  const team = gameState.teams[gameState.currentTeamIdx];
  const grid = gameState.maze.grid;

  // Bounds check
  if (targetX < 0 || targetX >= MAZE_SIZE || targetY < 0 || targetY >= MAZE_SIZE) return;

  // Wall check: is there a wall between current pos and target?
  const dx = targetX - team.x;
  const dy = targetY - team.y;
  let wallBit;
  if (dy === -1) wallBit = 1;      // N
  else if (dx === 1) wallBit = 2;  // E
  else if (dy === 1) wallBit = 4;  // S
  else if (dx === -1) wallBit = 8; // W
  else return;

  if (grid[team.y][team.x].walls & wallBit) {
    // Wall blocks movement
    return;
  }

  // Check for closed door at target
  const doorIdx = gameState.doors.findIndex(d => d.x === targetX && d.y === targetY && !d.open);
  if (doorIdx >= 0) {
    // Door! Need to answer a question to open it
    pendingTrigger = { type: 'door', index: doorIdx, targetX, targetY };
    showQuestion('door');
    return;
  }

  // Check for uncollected symbol at target
  const symIdx = gameState.symbols.findIndex(s => s.x === targetX && s.y === targetY && !s.found);
  if (symIdx >= 0) {
    // Symbol! Need to answer a question to collect it
    pendingTrigger = { type: 'symbol', index: symIdx, targetX, targetY };
    showQuestion('symbol', gameState.symbols[symIdx].categoryId);
    return;
  }

  // Normal move
  executeMove(targetX, targetY, () => {
    checkGoal(targetX, targetY);
  });
}

function executeMove(targetX, targetY, callback) {
  const team = gameState.teams[gameState.currentTeamIdx];
  const fromX = team.x;
  const fromY = team.y;
  animating = true;

  renderer.animateMove(gameState.currentTeamIdx, fromX, fromY, targetX, targetY, () => {
    team.x = targetX;
    team.y = targetY;
    animating = false;
    renderer.render(gameState);
    updateSidebar();
    if (callback) callback();
  });
}

function checkGoal(x, y) {
  const goal = gameState.maze.goal;
  if (x !== goal.x || y !== goal.y) {
    advanceTurn();
    return;
  }

  const team = gameState.teams[gameState.currentTeamIdx];
  const totalSymbols = gameState.symbols.length;
  const teamSymbols = team.symbolsCollected;

  if (teamSymbols >= totalSymbols) {
    // WIN!
    team.score += 50;
    gameState.phase = 'finished';
    renderer.stopPulseLoop();
    document.removeEventListener('keydown', handleKeyDown);
    showResultScreen();
  } else {
    // Not enough symbols
    const remaining = totalSymbols - teamSymbols;
    showToast(`Noch ${remaining} Symbol${remaining > 1 ? 'e' : ''} sammeln!`);
    advanceTurn();
  }
}

function advanceTurn() {
  gameState.currentTeamIdx = (gameState.currentTeamIdx + 1) % gameState.teams.length;
  updateActiveTeamBanner();
  updateSidebar();
  renderer.render(gameState);
}

// ── Question System ──────────────────────────────────────────────
function showQuestion(triggerType, preferredCategoryId) {
  const fragen = fragenBank.fragen.filter(q => {
    if (!selectedCategoryIds.has(q.kategorie)) return false;
    if (gameState.usedQuestionIds.has(q.id)) return false;
    return true;
  });

  // Prefer questions from the symbol's category
  let question = null;
  if (preferredCategoryId) {
    const catFragen = fragen.filter(q => q.kategorie === preferredCategoryId);
    if (catFragen.length > 0) {
      question = catFragen[Math.floor(Math.random() * catFragen.length)];
    }
  }
  if (!question && fragen.length > 0) {
    question = fragen[Math.floor(Math.random() * fragen.length)];
  }

  if (!question) {
    // No questions left – reset pool
    gameState.usedQuestionIds.clear();
    showToast('Fragenpool zurückgesetzt');
    return showQuestion(triggerType, preferredCategoryId);
  }

  gameState.usedQuestionIds.add(question.id);
  currentQuestion = question;
  questionResolved = false;

  const modal = document.getElementById('question-modal');
  const catName = fragenBank.kategorien.find(k => k.id === question.kategorie);

  document.getElementById('q-cat-name').textContent = catName ? catName.name : '';
  const diffEl = document.getElementById('q-difficulty');
  diffEl.textContent = question.schwierigkeit.charAt(0).toUpperCase() + question.schwierigkeit.slice(1);
  diffEl.className = 'modal-difficulty ' + question.schwierigkeit;

  document.getElementById('q-trigger-type').textContent =
    triggerType === 'door' ? '🔒 Tür öffnen' : '⭐ Symbol einsammeln';

  document.getElementById('q-text').textContent = question.frage;

  // Timer
  const timerWrap = document.querySelector('.timer-bar-wrap');
  const timerBar = document.getElementById('q-timer-bar');
  const timerText = document.getElementById('q-timer-text');

  if (gameState.config.timerSeconds > 0) {
    timerWrap.style.display = '';
    timerText.style.display = '';
    timerRemaining = gameState.config.timerSeconds;
    timerBar.style.width = '100%';
    timerBar.className = 'timer-bar';
    timerText.textContent = timerRemaining + 's';

    timerInterval = setInterval(() => {
      timerRemaining--;
      const pct = (timerRemaining / gameState.config.timerSeconds) * 100;
      timerBar.style.width = pct + '%';
      timerText.textContent = timerRemaining + 's';

      if (pct <= 20) timerBar.className = 'timer-bar danger';
      else if (pct <= 50) timerBar.className = 'timer-bar warning';

      if (timerRemaining <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        resolveQuestion(false);
      }
    }, 1000);
  } else {
    timerWrap.style.display = 'none';
    timerText.style.display = 'none';
  }

  // Answer area
  const optionsEl = document.getElementById('q-options');
  const openSection = document.getElementById('q-open-section');
  optionsEl.innerHTML = '';
  openSection.style.display = 'none';

  document.getElementById('q-result').className = 'modal-result';
  document.getElementById('q-result').textContent = '';
  document.getElementById('q-continue').className = 'modal-continue';

  if (question.typ === 'multiple_choice') {
    optionsEl.style.display = '';
    question.antworten.forEach((ans, idx) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = String.fromCharCode(65 + idx) + ') ' + ans;
      btn.onclick = () => {
        if (questionResolved) return;
        resolveQuestion(idx === question.richtig, btn, idx);
      };
      optionsEl.appendChild(btn);
    });
  } else {
    optionsEl.style.display = 'none';
    openSection.style.display = '';
    document.getElementById('q-show-answer').style.display = '';
    document.getElementById('q-open-answer').className = 'open-answer-text';
    document.getElementById('q-open-answer').textContent = question.erklaerung;
    document.getElementById('q-open-actions').className = 'open-actions';
  }

  modal.classList.add('visible');
}

function showOpenAnswer() {
  document.getElementById('q-show-answer').style.display = 'none';
  document.getElementById('q-open-answer').classList.add('visible');
  document.getElementById('q-open-actions').classList.add('visible');
}

function resolveOpen(correct) {
  resolveQuestion(correct);
}

function resolveQuestion(correct, clickedBtn, clickedIdx) {
  if (questionResolved) return;
  questionResolved = true;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Highlight MC answers
  if (currentQuestion.typ === 'multiple_choice') {
    const buttons = document.querySelectorAll('#q-options .answer-btn');
    buttons.forEach((btn, idx) => {
      btn.classList.add('locked');
      if (idx === currentQuestion.richtig) btn.classList.add('correct');
      else if (btn === clickedBtn && !correct) btn.classList.add('wrong');
    });
  }

  // Hide open answer buttons
  if (currentQuestion.typ === 'offen') {
    document.getElementById('q-open-actions').classList.remove('visible');
  }

  // Show result
  const resultEl = document.getElementById('q-result');
  const team = gameState.teams[gameState.currentTeamIdx];

  if (correct) {
    if (pendingTrigger.type === 'symbol') {
      resultEl.textContent = `✓ Richtig! ${team.name} sammelt das Symbol ein. (+10 Punkte)`;
    } else {
      resultEl.textContent = '✓ Richtig! Die Tür öffnet sich.';
    }
    resultEl.className = 'modal-result visible correct';
  } else {
    if (pendingTrigger.type === 'door') {
      resultEl.textContent = `✗ Falsch! Die Tür bleibt verschlossen.`;
    } else {
      resultEl.textContent = `✗ Falsch! Das Symbol bleibt liegen.`;
    }
    resultEl.className = 'modal-result visible wrong';
  }

  // Show correct answer for open questions
  if (currentQuestion.typ === 'offen') {
    document.getElementById('q-open-answer').classList.add('visible');
  }

  // Show continue button
  document.getElementById('q-continue').classList.add('visible');
  document.getElementById('q-continue').dataset.correct = correct ? '1' : '0';
}

function continueAfterQuestion() {
  const modal = document.getElementById('question-modal');
  modal.classList.remove('visible');

  const correct = document.getElementById('q-continue').dataset.correct === '1';
  const team = gameState.teams[gameState.currentTeamIdx];

  if (correct) {
    if (pendingTrigger.type === 'door') {
      // Open door for everyone
      gameState.doors[pendingTrigger.index].open = true;
      gameState.doors[pendingTrigger.index].openedBy = team.id;

      // Move through the door
      executeMove(pendingTrigger.targetX, pendingTrigger.targetY, () => {
        checkGoal(pendingTrigger.targetX, pendingTrigger.targetY);
        pendingTrigger = null;
      });
    } else if (pendingTrigger.type === 'symbol') {
      // Collect symbol
      const sym = gameState.symbols[pendingTrigger.index];
      sym.found = true;
      sym.foundBy = team.id;
      team.score += 10;
      team.symbolsCollected++;

      // Move to symbol position
      executeMove(pendingTrigger.targetX, pendingTrigger.targetY, () => {
        checkGoal(pendingTrigger.targetX, pendingTrigger.targetY);
        pendingTrigger = null;
      });
    }
  } else {
    // Wrong answer: stay in place, next turn
    pendingTrigger = null;
    advanceTurn();
  }

  currentQuestion = null;
}

// ── Sidebar Updates ──────────────────────────────────────────────
function updateSidebar() {
  const list = document.getElementById('team-list');
  list.innerHTML = '';

  gameState.teams.forEach((team, idx) => {
    const item = document.createElement('div');
    item.className = 'team-item' + (idx === gameState.currentTeamIdx ? ' active' : '');

    const figure = document.createElement('div');
    figure.className = 'team-figure';
    figure.textContent = team.emoji;

    const info = document.createElement('div');
    info.className = 'team-info';

    const name = document.createElement('div');
    name.className = 'team-name';
    name.textContent = team.name;
    name.style.color = team.color;

    const score = document.createElement('div');
    score.className = 'team-score';
    score.textContent = team.score + ' Punkte · ' + team.symbolsCollected + '/' + gameState.symbols.length + ' Symbole';

    const symRow = document.createElement('div');
    symRow.className = 'team-symbols-row';
    for (let i = 0; i < team.symbolsCollected; i++) {
      const dot = document.createElement('div');
      dot.className = 'team-sym-dot';
      symRow.appendChild(dot);
    }

    info.append(name, score, symRow);
    item.append(figure, info);
    list.appendChild(item);
  });
}

function updateActiveTeamBanner() {
  const banner = document.getElementById('active-team-banner');
  const team = gameState.teams[gameState.currentTeamIdx];
  banner.textContent = team.emoji + ' ' + team.name + ' ist dran';
  banner.style.background = team.color + '22';
  banner.style.color = team.color;
  banner.style.border = '2px solid ' + team.color;
}

// ── Result Screen ────────────────────────────────────────────────
function showResultScreen() {
  showScreen('result-screen');

  const sorted = [...gameState.teams].sort((a, b) => b.score - a.score);

  document.getElementById('result-winner').textContent =
    sorted[0].emoji + ' ' + sorted[0].name + ' gewinnt!';

  const tbody = document.getElementById('result-ranking-body');
  tbody.innerHTML = '';
  sorted.forEach((team, idx) => {
    const tr = document.createElement('tr');
    if (idx === 0) tr.className = 'rank-1';
    tr.innerHTML =
      '<td>' + (idx + 1) + '.</td>' +
      '<td>' + team.emoji + ' ' + team.name + '</td>' +
      '<td>' + team.score + '</td>' +
      '<td>' + team.symbolsCollected + '/' + gameState.symbols.length + '</td>';
    tbody.appendChild(tr);
  });
}

function playAgain() {
  showScreen('setup-screen');
  gameState.phase = 'setup';
  if (renderer) renderer.stopPulseLoop();
  document.removeEventListener('keydown', handleKeyDown);
}

function confirmQuit() {
  if (confirm('Spiel wirklich beenden?')) {
    playAgain();
  }
}

// ── Toast notification ───────────────────────────────────────────
function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText =
      'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
      'padding:0.7rem 1.5rem;border-radius:10px;font-weight:700;font-size:0.95rem;' +
      'z-index:200;transition:opacity 0.3s;pointer-events:none;' +
      'background:var(--accent);color:#fff;box-shadow:var(--shadow-lg);';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ── Resize handler ───────────────────────────────────────────────
function handleResize() {
  if (renderer && gameState.maze) {
    renderer.resize();
    renderer.render(gameState);
  }
}

// ── Theme Toggle ─────────────────────────────────────────────────
(function () {
  const KEY = 'spiele_theme';
  function applyTheme(dark) {
    document.body.classList.toggle('dark', dark);
    document.querySelectorAll('[id^="btn-theme"]').forEach(el => {
      el.textContent = dark ? '☀️ Lightmode' : '🌙 Darkmode';
    });
    // Force renderer to re-read colors
    if (renderer) {
      renderer._colors = null;
      if (gameState.maze) renderer.render(gameState);
    }
  }
  window.toggleTheme = function () {
    var isDark = !document.body.classList.contains('dark');
    localStorage.setItem(KEY, isDark ? 'dark' : 'light');
    applyTheme(isDark);
  };
  applyTheme(localStorage.getItem(KEY) === 'dark');
})();
