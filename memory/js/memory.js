// memory.js – Spiellogik für Memory

let pairsData = null;        // Gesamte Paare-Datenbank
let selectedCats = new Set(); // Gewählte Kategorie-IDs
let difficultyFilter = 'all';
let gridCols = 4;
let gridRows = 4;
let pairCount = 8;

// Spielzustand
let cards = [];
let flippedCards = [];
let matchedCount = 0;
let moves = 0;
let timerInterval = null;
let startTime = 0;
let locked = false;          // Klick-Sperre während Vergleich

// ── Init ────────────────────────────────────────────────────
async function init() {
  pairsData = await MemoryStorageManager.loadPairs();
  renderCategoryList();
  updateStartButton();
}

// ── Setup: Kategorien ───────────────────────────────────────
function renderCategoryList() {
  const list = document.getElementById('category-list');
  const noMsg = document.getElementById('no-categories');

  if (!pairsData.categories || pairsData.categories.length === 0) {
    list.style.display = 'none';
    noMsg.style.display = 'block';
    return;
  }

  noMsg.style.display = 'none';
  list.style.display = 'flex';
  list.innerHTML = '';

  for (const cat of pairsData.categories) {
    const count = cat.pairs ? cat.pairs.length : 0;
    const item = document.createElement('label');
    item.className = 'category-item';
    item.innerHTML =
      '<input type="checkbox" data-id="' + cat.id + '" onchange="toggleCategory(this)">' +
      '<span class="cat-name">' + escHtml(cat.name) + '</span>' +
      '<span class="cat-count">' + count + ' Paare</span>';
    list.appendChild(item);
  }
}

function toggleCategory(cb) {
  if (cb.checked) {
    selectedCats.add(cb.dataset.id);
  } else {
    selectedCats.delete(cb.dataset.id);
  }
  updateStartButton();
}

function selectDifficulty(btn) {
  document.querySelectorAll('#difficulty-row .option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  difficultyFilter = btn.dataset.val;
  updateStartButton();
}

function selectGrid(btn) {
  document.querySelectorAll('#grid-row .option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  gridCols = parseInt(btn.dataset.cols);
  gridRows = parseInt(btn.dataset.rows);
  pairCount = parseInt(btn.dataset.pairs);
  updateStartButton();
}

function getAvailablePairCount() {
  let count = 0;
  for (const cat of pairsData.categories) {
    if (selectedCats.has(cat.id)) {
      for (const pair of cat.pairs) {
        if (difficultyFilter === 'all' || pair.difficulty === parseInt(difficultyFilter)) {
          count++;
        }
      }
    }
  }
  return count;
}

function updateStartButton() {
  const available = getAvailablePairCount();
  const info = document.getElementById('setup-info');
  const btn = document.getElementById('btn-start');

  if (selectedCats.size === 0) {
    info.textContent = 'Wähle mindestens eine Kategorie.';
    btn.disabled = true;
  } else if (available < pairCount) {
    info.textContent = available + ' Paare verfügbar (benötigt: ' + pairCount + '). Wähle mehr Kategorien oder eine kleinere Rastergröße.';
    btn.disabled = true;
  } else {
    info.textContent = available + ' Paare verfügbar – ' + pairCount + ' werden verwendet (' + gridCols + '×' + gridRows + ').';
    btn.disabled = false;
  }
}

// ── Game Start ──────────────────────────────────────────────
function startGame() {
  const diff = difficultyFilter === 'all' ? null : parseInt(difficultyFilter);
  const pairs = MemoryModel.selectPairs(pairsData, [...selectedCats], pairCount, diff);
  cards = MemoryModel.createCards(pairs);
  flippedCards = [];
  matchedCount = 0;
  moves = 0;
  locked = false;

  // UI wechseln
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');
  document.getElementById('game-header').style.display = 'flex';

  document.getElementById('stat-moves').textContent = '0';
  document.getElementById('stat-time').textContent = '0:00';

  // Timer starten
  startTime = Date.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);

  renderBoard();
}

function renderBoard() {
  const board = document.getElementById('memory-board');
  board.style.gridTemplateColumns = 'repeat(' + gridCols + ', 1fr)';
  board.innerHTML = '';

  cards.forEach(function (card, idx) {
    const el = document.createElement('div');
    el.className = 'memory-card';
    el.dataset.idx = idx;
    el.onclick = function () { flipCard(idx); };

    el.innerHTML =
      '<div class="card-face card-back"></div>' +
      '<div class="card-face card-front" id="front-' + idx + '"></div>';

    board.appendChild(el);

    // Inhalt rendern
    renderCardContent(document.getElementById('front-' + idx), card);
  });
}

function renderCardContent(el, card) {
  if (card.type === 'formula') {
    try {
      katex.render(card.content, el, { throwOnError: false, displayMode: false });
    } catch {
      el.textContent = card.content;
    }
  } else if (card.type === 'image') {
    var img = document.createElement('img');
    img.src = card.content;
    img.alt = 'Bild';
    el.appendChild(img);
  } else {
    el.textContent = card.content;
  }
}

// ── Card Flip Logic ─────────────────────────────────────────
function flipCard(idx) {
  if (locked) return;
  const card = cards[idx];
  if (card.flipped || card.matched) return;
  if (flippedCards.length >= 2) return;

  card.flipped = true;
  flippedCards.push(idx);

  const el = document.querySelectorAll('.memory-card')[idx];
  el.classList.add('flipped');

  if (flippedCards.length === 2) {
    moves++;
    document.getElementById('stat-moves').textContent = moves;
    checkMatch();
  }
}

function checkMatch() {
  locked = true;
  const [i1, i2] = flippedCards;
  const c1 = cards[i1];
  const c2 = cards[i2];

  const allCards = document.querySelectorAll('.memory-card');

  if (c1.pairId === c2.pairId) {
    // Match!
    c1.matched = true;
    c2.matched = true;
    matchedCount++;

    setTimeout(function () {
      allCards[i1].classList.add('matched', 'match-pop');
      allCards[i2].classList.add('matched', 'match-pop');
      flippedCards = [];
      locked = false;

      if (matchedCount === pairCount) {
        setTimeout(showResult, 600);
      }
    }, 300);
  } else {
    // Kein Match
    setTimeout(function () {
      allCards[i1].classList.add('no-match');
      allCards[i2].classList.add('no-match');

      setTimeout(function () {
        c1.flipped = false;
        c2.flipped = false;
        allCards[i1].classList.remove('flipped', 'no-match');
        allCards[i2].classList.remove('flipped', 'no-match');
        flippedCards = [];
        locked = false;
      }, 500);
    }, 800);
  }
}

// ── Timer ────────────────────────────────────────────────────
function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  document.getElementById('stat-time').textContent = m + ':' + (s < 10 ? '0' : '') + s;
}

function getElapsedSeconds() {
  return Math.floor((Date.now() - startTime) / 1000);
}

// ── Result ──────────────────────────────────────────────────
function showResult() {
  clearInterval(timerInterval);
  const elapsed = getElapsedSeconds();
  const efficiency = (pairCount / moves * 100).toFixed(0);

  // Sterne: basierend auf Züge/Paare-Ratio
  const ratio = moves / pairCount;
  let stars = 3;
  if (ratio > 2.5) stars = 1;
  else if (ratio > 1.8) stars = 2;

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const timeStr = m + ':' + (s < 10 ? '0' : '') + s;

  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('game-header').style.display = 'none';
  document.getElementById('result-screen').classList.add('active');

  const titles = [
    '', 'Geschafft!', 'Gut gemacht!', 'Perfekt!'
  ];

  document.getElementById('result-stars').textContent =
    Array(stars).fill('\u2B50').join('') + Array(3 - stars).fill('\u2606').join('');
  document.getElementById('result-title').textContent = titles[stars];

  document.getElementById('result-stats').innerHTML =
    '<div class="stat-card"><div class="stat-value">' + moves + '</div><div class="stat-label">Züge</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + timeStr + '</div><div class="stat-label">Zeit</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + pairCount + '</div><div class="stat-label">Paare</div></div>' +
    '<div class="stat-card"><div class="stat-value">' + efficiency + '%</div><div class="stat-label">Effizienz</div></div>';
}

// ── Navigation ──────────────────────────────────────────────
function backToSetup() {
  clearInterval(timerInterval);
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('result-screen').classList.remove('active');
  document.getElementById('game-header').style.display = 'none';
  document.getElementById('setup-screen').classList.add('active');
}

function replay() {
  document.getElementById('result-screen').classList.remove('active');
  startGame();
}

// ── Utility ─────────────────────────────────────────────────
function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Start ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
