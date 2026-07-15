// game.js – Just One: Lehrkraft-Logik (Spielwähler, Setup, Kategorien, Lobby)
// Rundenlogik (collecting/review/revealed/resolved) folgt in einer späteren Ausbaustufe.

let gameState = null;
let wordlistData = { categories: [] };
let selectedSubcatIds = new Set();
let gameSub = null;

const ROUNDS_OPTIONS = [5, 9, 13, 20];

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ── Spielwähler ─────────────────────────────────────────────────────
async function showGameSelector() {
  showScreen('game-selector');
  const list = document.getElementById('gs-game-list');
  list.innerHTML = '<p class="gs-empty">Lade Spiele…</p>';
  const registry = await JoStorage.loadGamesRegistry();
  const entries = Object.entries(registry);
  if (entries.length === 0) {
    list.innerHTML = '<p class="gs-empty">Noch keine Spiele vorhanden.</p>';
    return;
  }
  entries.sort((a, b) => (b[1].updatedAt || b[1].createdAt || '').localeCompare(a[1].updatedAt || a[1].createdAt || ''));
  const statusLabel = { lobby: '🕓 Warteraum', playing: '🟢 Läuft', finished: '🏁 Beendet' };
  list.innerHTML = entries.map(([code, info]) => {
    const date = info.updatedAt ? new Date(info.updatedAt).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="gs-game-card" onclick="window._gsEnter('${code}')">
      <div class="gs-game-code">${code}</div>
      <div class="gs-game-info">
        <div class="gs-game-title">${escHtml(info.title || 'Spiel')}</div>
        <div class="gs-game-meta">${statusLabel[info.status] || '⚙ Setup'} · ${date}</div>
      </div>
      <div class="gs-game-actions">
        <button class="gs-btn-delete" onclick="event.stopPropagation();window._gsDelete('${code}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function joinAsStudent() {
  const input = document.getElementById('gs-code-input');
  const errEl = document.getElementById('gs-join-error');
  const code = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (errEl) errEl.textContent = '';
  if (!code || code.length < 4) {
    if (errEl) errEl.textContent = 'Bitte 4-stelligen Code eingeben.';
    return;
  }
  window.location.href = 'view.html?code=' + code;
}

async function createNewGame() {
  const code = JoStorage.generateCode();
  JoStorage.setCode(code);
  gameState = {
    meta: { gameCode: code, title: 'Just One', createdAt: new Date().toISOString() },
    phase: 'setup',
    players: [],
    turnOrder: [],
    currentTurnIdx: 0,
    activeCategoryIds: [],
    usedWordIds: [],
    settings: { targetRounds: 13 },
    roundsPlayed: 0,
    correctCount: 0,
    currentRound: null
  };
  await JoStorage.save(gameState);
  window.history.replaceState({}, '', 'index.html?code=' + code);
  showScreen('setup-screen');
  document.getElementById('setup-game-title').value = '';
  renderRoundsRow();
  showCodeBannerInline();
}

// ── Setup ───────────────────────────────────────────────────────────
function renderRoundsRow() {
  const row = document.getElementById('rounds-row');
  const current = gameState?.settings?.targetRounds || 13;
  row.innerHTML = ROUNDS_OPTIONS.map(n =>
    `<button type="button" class="param-btn${n === current ? ' active' : ''}" onclick="setTargetRounds(${n})">${n}</button>`
  ).join('');
}

function setTargetRounds(n) {
  if (!gameState) return;
  gameState.settings.targetRounds = n;
  renderRoundsRow();
}

async function proceedToCategories() {
  const title = document.getElementById('setup-game-title').value.trim();
  gameState.meta.title = title || 'Just One';
  buildCategoryUI();
  showScreen('category-screen');
}

// ── Kategorien (zweistufig: Kategorie → Unterkategorie → Begriffe) ──
function buildCategoryUI() {
  const list = document.getElementById('cat-select-list');
  list.innerHTML = '';

  if (!wordlistData.categories.length) {
    list.innerHTML = '<p class="gs-empty">Noch keine Begriffe vorhanden. Bitte zuerst in der Begriffsverwaltung anlegen.</p>';
    updateCatSelectInfo();
    return;
  }

  for (const cat of wordlistData.categories) {
    const group = document.createElement('div');
    group.className = 'cat-select-group';
    group.dataset.catId = cat.id;

    const wordCount = JoWordlistModel.countWords(cat);
    let html = `<div class="cat-select-header" onclick="toggleCatGroup('${cat.id}')">
      <span class="cat-name">${escHtml(cat.name)}</span>
      <span class="cat-meta">${wordCount} Begriffe</span>
    </div><div class="cat-select-subs">`;

    for (const sub of cat.subcategories) {
      const checked = selectedSubcatIds.has(sub.id) ? ' checked' : '';
      html += `<div class="cat-select-sub">
        <input type="checkbox" id="subcat-${sub.id}" ${checked} onchange="toggleSubcat('${sub.id}', this.checked)">
        <label for="subcat-${sub.id}">${escHtml(sub.name)}</label>
        <span class="sub-count">${sub.words.length}</span>
      </div>`;
    }
    html += '</div>';
    group.innerHTML = html;
    list.appendChild(group);
  }

  updateCatSelectInfo();
}

function toggleCatGroup(catId) {
  const el = document.querySelector('.cat-select-group[data-cat-id="' + catId + '"]');
  if (el) el.classList.toggle('open');
}

function toggleSubcat(subId, checked) {
  if (checked) selectedSubcatIds.add(subId);
  else selectedSubcatIds.delete(subId);
  updateCatSelectInfo();
}

function selectAllSubcats() {
  selectedSubcatIds = new Set();
  for (const cat of wordlistData.categories) {
    for (const sub of cat.subcategories) selectedSubcatIds.add(sub.id);
  }
  buildCategoryUI();
  document.querySelectorAll('.cat-select-group').forEach(g => g.classList.add('open'));
}

function selectNoSubcats() {
  selectedSubcatIds = new Set();
  buildCategoryUI();
}

function updateCatSelectInfo() {
  const info = document.getElementById('cat-select-info');
  const count = JoWordlistModel.pooledWords(wordlistData, [...selectedSubcatIds]).length;
  info.textContent = count === 0
    ? 'Keine Begriffe gewählt – bitte mindestens eine Unterkategorie auswählen.'
    : count + ' Begriffe aus ' + selectedSubcatIds.size + ' Unterkategorie(n) gewählt.';
  info.classList.toggle('empty', count === 0);
}

async function proceedToLobby() {
  const errEl = document.getElementById('category-error');
  errEl.textContent = '';
  const count = JoWordlistModel.pooledWords(wordlistData, [...selectedSubcatIds]).length;
  if (count === 0) {
    errEl.textContent = 'Bitte mindestens eine Unterkategorie mit Begriffen wählen.';
    return;
  }
  gameState.activeCategoryIds = [...selectedSubcatIds];
  gameState.phase = 'lobby';
  await JoStorage.save(gameState);
  showLobbyScreen();
  subscribeGame(JoStorage.getCode());
}

// ── Lobby ───────────────────────────────────────────────────────────
function showLobbyScreen() {
  const code = JoStorage.getCode();
  document.getElementById('lobby-code-val').textContent = code || '----';
  const count = JoWordlistModel.pooledWords(wordlistData, gameState.activeCategoryIds).length;
  document.getElementById('lobby-summary').textContent =
    gameState.activeCategoryIds.length + ' Unterkategorie(n) · ' + count + ' Begriffe · ' + gameState.settings.targetRounds + ' Runden';
  showScreen('lobby-screen');
  renderPlayerChips('lobby-player-list', gameState.players || [], true);
  updateLobbyPlayerHint();
}

function updateLobbyPlayerHint() {
  const hint = document.getElementById('lobby-player-hint');
  const n = (gameState.players || []).length;
  const startBtn = document.getElementById('btn-start-game');
  if (n < 3) {
    hint.textContent = n + ' Spieler:in(nen) beigetreten – mindestens 3 nötig.';
    hint.classList.remove('ok');
    if (startBtn) startBtn.disabled = true;
  } else {
    hint.textContent = n + ' Spieler:innen bereit.';
    hint.classList.add('ok');
    if (startBtn) startBtn.disabled = false;
  }
}

function renderPlayerChips(containerId, players, withKick) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = players.map(p =>
    `<span class="player-chip">${escHtml(p.name)}${withKick ? ` <button class="kick-btn" title="Entfernen" onclick="kickPlayer('${p.id}')">✕</button>` : ''}</span>`
  ).join('') || '<span class="player-count-hint">Noch niemand beigetreten.</span>';
}

async function kickPlayer(playerId) {
  const ns = await JoStorage.mutate(draft => {
    draft.players = (draft.players || []).filter(p => p.id !== playerId);
    draft.turnOrder = (draft.turnOrder || []).filter(id => id !== playerId);
    if (draft.currentTurnIdx >= draft.turnOrder.length) draft.currentTurnIdx = 0;
  });
  if (ns) {
    gameState = ns;
    onGameStateUpdate(ns);
  }
}

async function startGame() {
  if ((gameState.players || []).length < 3) return;
  gameState.phase = 'playing';
  gameState.turnOrder = gameState.players.map(p => p.id);
  gameState.currentTurnIdx = 0;
  gameState.roundsPlayed = 0;
  gameState.correctCount = 0;
  gameState.usedWordIds = [];
  gameState.currentRound = null;
  await JoStorage.save(gameState);
  showScreen('game-screen');
  renderPlayerChips('game-player-list', gameState.players || [], true);
}

// ── Live-Sync (Lobby + Spiel) ─────────────────────────────────────
function subscribeGame(code) {
  if (gameSub) { gameSub.unsubscribe(); gameSub = null; }
  gameSub = JoStorage.subscribe(code, onGameStateUpdate);
}

function onGameStateUpdate(state) {
  gameState = state;
  if (state.phase === 'lobby') {
    renderPlayerChips('lobby-player-list', state.players || [], true);
    updateLobbyPlayerHint();
  } else if (state.phase === 'playing') {
    if (!document.getElementById('game-screen').classList.contains('active')) {
      showScreen('game-screen');
    }
    renderPlayerChips('game-player-list', state.players || [], true);
  }
}

// ── Spielwähler-Aktionen ────────────────────────────────────────────
async function _gsEnter(code) {
  JoStorage.setCode(code);
  const gs = await JoStorage.load(code);
  if (!gs) { alert('Spiel nicht gefunden.'); showGameSelector(); return; }
  gameState = gs;
  selectedSubcatIds = new Set(gs.activeCategoryIds || []);
  window.history.replaceState({}, '', 'index.html?code=' + code);

  if (gs.phase === 'lobby') {
    showLobbyScreen();
    subscribeGame(code);
  } else if (gs.phase === 'playing') {
    showScreen('game-screen');
    renderPlayerChips('game-player-list', gs.players || [], true);
    subscribeGame(code);
  } else if (gs.phase === 'finished') {
    showScreen('game-screen');
  } else {
    showScreen('setup-screen');
    document.getElementById('setup-game-title').value = gs.meta.title === 'Just One' ? '' : gs.meta.title;
    renderRoundsRow();
    showCodeBannerInline();
  }
}
window._gsEnter = _gsEnter;

async function _gsDelete(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await JoStorage.deleteGame(code);
  showGameSelector();
}
window._gsDelete = _gsDelete;

function confirmAbandonLobby() {
  if (!confirm('Zurück zum Spielwähler? Das Spiel bleibt bestehen und kann über die Spielliste fortgesetzt werden.')) return;
  resetToSelector();
}

function resetToSelector() {
  if (gameSub) { gameSub.unsubscribe(); gameSub = null; }
  JoStorage.setCode(null);
  window.history.replaceState({}, '', 'index.html');
  const banner = document.getElementById('code-banner');
  if (banner) banner.remove();
  showGameSelector();
}

// ── Code-Anzeige ────────────────────────────────────────────────────
function showCodeBannerInline() {
  const code = JoStorage.getCode();
  if (!code) return;
  const banner = document.getElementById('setup-code-banner');
  const val = document.getElementById('setup-code-value');
  if (banner) banner.style.display = '';
  if (val) val.textContent = code;
}

function copyCode(el) {
  if (!el) return;
  const code = el.textContent.trim();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const orig = el.textContent;
    el.textContent = '✓ Kopiert!';
    setTimeout(() => { el.textContent = orig; }, 1200);
  }).catch(() => {});
}
window.copyCode = copyCode;

// ── Start ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  wordlistData = await JoWordlistStorage.load();
  renderRoundsRow();
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) await _gsEnter(urlCode.toUpperCase());
  else showGameSelector();
});
