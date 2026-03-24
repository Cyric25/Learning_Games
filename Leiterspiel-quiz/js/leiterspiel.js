/* leiterspiel.js – Schlangen & Leitern mit Wissensfragen */

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

const TIMER_SECONDS = { leicht: 30, mittel: 45, schwer: 60 };
const POINTS = { leicht: 10, mittel: 20, schwer: 30 };

const DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

// Fields that have ladders or snakes (cannot be bonus)
const LADDER_SNAKE_FIELDS = new Set([
  ...Object.keys(LADDERS).map(Number),
  ...Object.values(LADDERS),
  ...Object.keys(SNAKES).map(Number),
  ...Object.values(SNAKES)
]);

// ── State ────────────────────────────────────────────────────
let fragenBank = null;
let selectedCategoryIds = new Set();
let activeFragenBank = null;

let gameState = {
  board: [],
  teams: [],
  turnOrder: [],
  currentTurnIdx: 0,
  phase: 'setup',
  usedQuestionIds: new Set(),
  pendingDice: null,
  singlePlayerMode: false
};

let timerInterval = null;
let timerRemaining = 0;
let currentQuestion = null;
let questionResolved = false;
let pendingBonusType = null;
let pendingBonusAfterMove = null;
let diceOrderState = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderModeSelector();
  renderTeamCountSelector(4);
  loadFragen();
});

// ── Question Loading (shared with Risiko-Quiz) ──────────────
async function loadFragen() {
  let rqData = null;
  try {
    if (window.location.protocol !== 'file:') {
      try {
        const r = await fetch('../api.php?f=questions');
        if (r.ok) rqData = await r.json();
      } catch (e) { /* fallback */ }
    }
    if (!rqData) {
      const r = await fetch('../data/questions.json');
      if (r.ok) rqData = await r.json();
    }
  } catch (e) { /* ignore */ }

  if (!rqData) {
    const ls = localStorage.getItem('rq_questions');
    if (ls) try { rqData = JSON.parse(ls); } catch(e) {}
  }

  if (rqData && rqData.categories) {
    fragenBank = convertRQtoLeiterspiel(rqData);
    renderCategorySelector();
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

    if (hasQuestions) {
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
          schwierigkeit: schwierigkeit,
          frage: q.question || '',
          typ: typ,
          antworten: antworten,
          richtig: richtig,
          erklaerung: q.answer || q.hint || ''
        });
      });
    }

    subs.forEach(sub => collectLeafCategories(sub, [...path, sub.name], parentIcon));
  }

  const icons = ['🧪','🧬','⚗️','🔬','🌍','📐','💡','🎯'];
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

// ── Category Selector ────────────────────────────────────────
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
  const total = fragenBank.kategorien.length;
  const selected = selectedCategoryIds.size;
  const qCount = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie)).length;
  document.getElementById('cat-select-info').textContent =
    selected + ' von ' + total + ' Kategorien gewählt (' + qCount + ' Fragen)';
}

// ── Setup Screen ─────────────────────────────────────────────
function renderModeSelector() {
  const row = document.getElementById('mode-row');
  row.innerHTML = '';
  const modes = [
    { id: 'class', label: '👨‍🏫 Klassenspiel' },
    { id: 'solo',  label: '🏠 Einzelspieler' }
  ];
  modes.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (m.id === 'class' ? ' selected' : '');
    btn.textContent = m.label;
    btn.onclick = () => selectMode(m.id);
    btn.dataset.mode = m.id;
    row.appendChild(btn);
  });
  gameState.singlePlayerMode = false;
}

function selectMode(modeId) {
  gameState.singlePlayerMode = (modeId === 'solo');
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.mode === modeId);
  });
  const showMulti = !gameState.singlePlayerMode;
  document.getElementById('team-count-section').style.display = showMulti ? '' : 'none';
  document.getElementById('btn-admin').style.display = showMulti ? '' : 'none';
  if (gameState.singlePlayerMode) {
    renderTeamConfigList(1);
  } else {
    renderTeamCountSelector(4);
  }
}

function renderTeamCountSelector(defaultCount) {
  const row = document.getElementById('team-count-row');
  row.innerHTML = '';
  for (let i = 2; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'team-count-btn' + (i === defaultCount ? ' selected' : '');
    btn.textContent = i;
    btn.onclick = () => {
      document.querySelectorAll('.team-count-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      renderTeamConfigList(i);
    };
    row.appendChild(btn);
  }
  renderTeamConfigList(defaultCount);
}

function renderTeamConfigList(count) {
  const list = document.getElementById('team-config-list');
  list.innerHTML = '';
  const takenAnimals = new Set();

  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'team-config-row';
    row.dataset.index = i;

    const display = document.createElement('span');
    display.className = 'team-animal-display';
    display.id = 'animal-display-' + i;
    display.textContent = '❓';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Gruppe ' + (i + 1);
    input.value = 'Gruppe ' + (i + 1);
    input.id = 'team-name-' + i;

    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'animal-picker';
    pickerWrap.id = 'animal-picker-' + i;

    row.appendChild(display);
    row.appendChild(input);
    row.appendChild(pickerWrap);
    list.appendChild(row);
  }

  // Render pickers after all rows exist
  for (let i = 0; i < count; i++) {
    renderAnimalPicker(i, count);
  }
}

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
  const count = document.querySelectorAll('.team-config-row').length;
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

// ── Proceed to Game ──────────────────────────────────────────
function proceedToGame() {
  const errorEl = document.getElementById('setup-error');
  errorEl.textContent = '';

  // Collect teams
  const rows = document.querySelectorAll('.team-config-row');
  const teams = [];
  for (let i = 0; i < rows.length; i++) {
    const name = document.getElementById('team-name-' + i).value.trim() || ('Gruppe ' + (i + 1));
    const animalId = getTeamAnimal(i);
    if (!animalId) {
      errorEl.textContent = 'Bitte für jede Gruppe ein Tier auswählen!';
      return;
    }
    const animal = ANIMALS.find(a => a.id === animalId);
    teams.push({
      name: name,
      animal: animalId,
      emoji: animal.emoji,
      position: 1,
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      diceRollForOrder: null
    });
  }

  // Check unique animals
  const animalIds = teams.map(t => t.animal);
  if (new Set(animalIds).size !== animalIds.length) {
    errorEl.textContent = 'Jede Gruppe braucht ein anderes Tier!';
    return;
  }

  // Check categories
  if (selectedCategoryIds.size === 0) {
    errorEl.textContent = 'Bitte mindestens eine Kategorie auswählen!';
    return;
  }

  // Filter questions
  activeFragenBank = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie));
  if (activeFragenBank.length < 10) {
    errorEl.textContent = 'Zu wenige Fragen (' + activeFragenBank.length + '). Mindestens 10 benötigt.';
    return;
  }

  // Generate board
  gameState.teams = teams;
  gameState.usedQuestionIds = new Set();
  gameState.pendingDice = null;
  generateBoard();

  if (gameState.singlePlayerMode) {
    gameState.turnOrder = [0];
    gameState.currentTurnIdx = 0;
    gameState.phase = 'playing';
    showScreen('game-screen');
    renderBoard();
    renderTeamList();
    updateActiveBanner();
    updateDiceButton(true);
  } else {
    // Go to dice order phase
    gameState.phase = 'dice-order';
    initDiceOrder();
    showScreen('dice-order-screen');
  }
}

// ── Board Generation ─────────────────────────────────────────
function generateBoard() {
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
      '<span class="dice-order-name">' + team.name + '</span>' +
      '<span class="dice-order-result">' + (diceOrderState.rolls[i] !== null ? DICE_FACES[diceOrderState.rolls[i] - 1] + ' ' + diceOrderState.rolls[i] : '—') + '</span>';
    list.appendChild(row);
  });

  // Show final order if done
  if (diceOrderState.done) {
    const orderDiv = document.createElement('div');
    orderDiv.style.cssText = 'margin-top:16px;padding:12px;background:var(--bg-field);border-radius:12px;';
    orderDiv.innerHTML = '<strong>Reihenfolge:</strong> ' +
      gameState.turnOrder.map((idx, pos) =>
        (pos + 1) + '. ' + gameState.teams[idx].emoji + ' ' + gameState.teams[idx].name
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
    showScreen('game-screen');
    renderBoard();
    renderTeamList();
    updateActiveBanner();
    updateDiceButton(true);
    drawLaddersAndSnakes();
    window.addEventListener('resize', drawLaddersAndSnakes);
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
      div.classList.add('field-' + field.difficulty);
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

// ── SVG Ladders & Snakes ─────────────────────────────────────
function drawLaddersAndSnakes() {
  const svg = document.getElementById('svg-overlay');
  if (!svg) return;
  const container = svg.parentElement;
  const rect = container.getBoundingClientRect();
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
  svg.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
  svg.innerHTML = '';

  function getFieldCenter(fieldNum) {
    const el = document.getElementById('field-' + fieldNum);
    if (!el) return null;
    const fr = el.getBoundingClientRect();
    return {
      x: fr.left - rect.left + fr.width / 2,
      y: fr.top - rect.top + fr.height / 2
    };
  }

  // Draw ladders
  Object.entries(LADDERS).forEach(([from, to]) => {
    const a = getFieldCenter(Number(from));
    const b = getFieldCenter(Number(to));
    if (!a || !b) return;

    // Ladder: two parallel lines with rungs
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len * 4; // normal offset
    const ny = dx / len * 4;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x + nx); line.setAttribute('y1', a.y + ny);
    line.setAttribute('x2', b.x + nx); line.setAttribute('y2', b.y + ny);
    line.setAttribute('stroke', '#2e7d32'); line.setAttribute('stroke-width', '2.5');
    line.setAttribute('opacity', '0.7'); line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);

    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', a.x - nx); line2.setAttribute('y1', a.y - ny);
    line2.setAttribute('x2', b.x - nx); line2.setAttribute('y2', b.y - ny);
    line2.setAttribute('stroke', '#2e7d32'); line2.setAttribute('stroke-width', '2.5');
    line2.setAttribute('opacity', '0.7'); line2.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line2);

    // Rungs
    const rungCount = Math.max(2, Math.floor(len / 20));
    for (let i = 1; i < rungCount; i++) {
      const t = i / rungCount;
      const rx = a.x + dx * t;
      const ry = a.y + dy * t;
      const rung = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      rung.setAttribute('x1', rx + nx); rung.setAttribute('y1', ry + ny);
      rung.setAttribute('x2', rx - nx); rung.setAttribute('y2', ry - ny);
      rung.setAttribute('stroke', '#2e7d32'); rung.setAttribute('stroke-width', '2');
      rung.setAttribute('opacity', '0.5');
      svg.appendChild(rung);
    }
  });

  // Draw snakes
  Object.entries(SNAKES).forEach(([from, to]) => {
    const a = getFieldCenter(Number(from));
    const b = getFieldCenter(Number(to));
    if (!a || !b) return;

    // Snake: wavy path
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const waves = Math.max(2, Math.floor(len / 30));
    const amplitude = Math.min(15, len * 0.08);
    const nx = -dy / len;
    const ny = dx / len;

    let d = 'M ' + a.x + ' ' + a.y;
    for (let i = 1; i <= waves * 2; i++) {
      const t = i / (waves * 2);
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const side = i % 2 === 0 ? 1 : -1;
      const cpx = a.x + dx * (t - 0.5 / (waves * 2)) + nx * amplitude * side;
      const cpy = a.y + dy * (t - 0.5 / (waves * 2)) + ny * amplitude * side;
      d += ' Q ' + cpx + ' ' + cpy + ' ' + px + ' ' + py;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#c62828');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('opacity', '0.6');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);

    // Snake head (circle at start)
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', a.x); head.setAttribute('cy', a.y);
    head.setAttribute('r', '4'); head.setAttribute('fill', '#c62828');
    head.setAttribute('opacity', '0.7');
    svg.appendChild(head);
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
        '<div class="team-name">' + team.name + '</div>' +
        '<div class="team-pos">Feld ' + team.position + '</div>' +
      '</div>' +
      '<span class="team-score">' + team.score + '</span>';
    list.appendChild(card);
  });
}

function updateTeamList() {
  gameState.turnOrder.forEach(teamIdx => {
    const team = gameState.teams[teamIdx];
    const card = document.getElementById('team-card-' + teamIdx);
    if (!card) return;
    card.querySelector('.team-pos').textContent = 'Feld ' + team.position;
    card.querySelector('.team-score').textContent = team.score;
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

      // Show question for current field
      setTimeout(() => askQuestion(), 400);
    }
  }, 80);
}

// ── Question System ──────────────────────────────────────────
function askQuestion() {
  const team = getCurrentTeam();
  const field = gameState.board[team.position];
  const difficulty = field.difficulty;

  // Find matching question
  const available = activeFragenBank.filter(q =>
    q.schwierigkeit === difficulty && !gameState.usedQuestionIds.has(q.id)
  );

  // Fallback: any difficulty
  let question;
  if (available.length > 0) {
    question = available[Math.floor(Math.random() * available.length)];
  } else {
    const fallback = activeFragenBank.filter(q => !gameState.usedQuestionIds.has(q.id));
    if (fallback.length > 0) {
      question = fallback[Math.floor(Math.random() * fallback.length)];
    } else {
      // All questions used - reset pool
      gameState.usedQuestionIds.clear();
      const all = activeFragenBank.filter(q => q.schwierigkeit === difficulty);
      question = all.length > 0 ? all[Math.floor(Math.random() * all.length)] :
        activeFragenBank[Math.floor(Math.random() * activeFragenBank.length)];
    }
  }

  gameState.usedQuestionIds.add(question.id);
  currentQuestion = question;
  questionResolved = false;

  // Populate modal
  const kat = fragenBank.kategorien.find(k => k.id === question.kategorie);
  document.getElementById('q-cat-name').textContent = kat ? kat.icon + ' ' + kat.name : '';

  const diffEl = document.getElementById('q-difficulty');
  diffEl.textContent = difficulty === 'leicht' ? 'Leicht' : difficulty === 'mittel' ? 'Mittel' : 'Schwer';
  diffEl.className = 'modal-difficulty diff-' + difficulty;

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
    // MC answers
    openSection.style.display = 'none';
    optionsDiv.style.display = '';
    optionsDiv.innerHTML = '';
    question.antworten.forEach((ans, idx) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = ans;
      btn.onclick = () => selectAnswer(btn, idx, question);
      optionsDiv.appendChild(btn);
    });
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
  const buttons = document.querySelectorAll('#q-options .answer-btn');

  buttons.forEach((b, i) => {
    b.classList.add('disabled');
    if (i === question.richtig) b.classList.add('correct');
    if (i === idx && !correct) b.classList.add('wrong');
  });

  resolveQuestion(correct);
}

function showOpenAnswer() {
  document.getElementById('q-show-answer').style.display = 'none';
  document.getElementById('q-open-answer').style.display = '';
  document.getElementById('q-open-actions').style.display = '';
}

function resolveOpen(correct) {
  if (questionResolved) return;
  clearInterval(timerInterval);
  document.getElementById('q-open-actions').style.display = 'none';
  resolveQuestion(correct);
}

function resolveQuestion(correct) {
  questionResolved = true;
  const team = getCurrentTeam();
  const field = gameState.board[team.position];

  const resultEl = document.getElementById('q-result');
  if (correct) {
    resultEl.textContent = '✓ Richtig! +' + POINTS[field.difficulty] + ' Punkte';
    resultEl.className = 'modal-result visible correct-result';
    team.score += POINTS[field.difficulty];
    team.correctCount++;
  } else {
    resultEl.textContent = '✗ Falsch!';
    resultEl.className = 'modal-result visible wrong-result';
    team.wrongCount++;
  }

  // Show explanation
  if (currentQuestion.erklaerung) {
    document.getElementById('q-explanation-text').textContent = currentQuestion.erklaerung;
    document.getElementById('q-explanation').classList.add('visible');
  }

  // Store result for movement
  gameState.lastAnswerCorrect = correct;

  // Show continue
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
  const newPos = team.position + dice;

  if (newPos > 100) {
    // Too high - stay in place
    updateActiveBanner();
    nextTurn();
    return;
  }

  team.position = newPos;
  updatePieces();
  updateTeamList();

  // Check win
  if (newPos === 100) {
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
  if (team.position === 100) {
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
          team.name + ' <span style="color:var(--text-light);font-size:0.85rem">(Feld ' + team.position + ')</span>';
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
      const newPos = team.position + result;
      if (newPos > 100) {
        nextTurn();
        return;
      }

      team.position = newPos;
      updatePieces();
      updateTeamList();

      if (newPos === 100) {
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

  // Reset dice display
  document.getElementById('dice-display').textContent = '🎲';

  updateActiveBanner();
  updatePieces();
  updateDiceButton(true);
}

// ── Winner ───────────────────────────────────────────────────
function showWinner() {
  gameState.phase = 'finished';
  const team = getCurrentTeam();

  document.getElementById('winner-team-name').textContent = team.emoji + ' ' + team.name;

  const statsEl = document.getElementById('winner-stats');
  statsEl.innerHTML = '';
  const stats = [
    { label: 'Punkte', value: team.score },
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

// ── Reset & Quit ─────────────────────────────────────────────
function resetToSetup() {
  gameState.phase = 'setup';
  gameState.teams = [];
  gameState.turnOrder = [];
  gameState.currentTurnIdx = 0;
  gameState.usedQuestionIds = new Set();
  gameState.pendingDice = null;
  window.removeEventListener('resize', drawLaddersAndSnakes);
  showScreen('setup-screen');
}

function confirmQuit() {
  if (confirm('Spiel wirklich beenden?')) {
    resetToSetup();
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
