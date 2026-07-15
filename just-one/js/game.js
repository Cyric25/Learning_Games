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
  document.getElementById('lobby-board-link').href = 'board.html?code=' + code;
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
    if (draft.currentRound) {
      if (draft.currentRound.guesserId === playerId) {
        // Rater:in entfernt → Runde kann nicht fortgesetzt werden
        draft.currentRound = null;
      } else {
        delete draft.currentRound.clues[playerId];
        draft.currentRound.struckIds = (draft.currentRound.struckIds || []).filter(id => id !== playerId);
      }
    }
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
  renderGameScreen(gameState);
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
  } else if (state.phase === 'playing' || state.phase === 'finished') {
    if (!document.getElementById('game-screen').classList.contains('active')) {
      showScreen('game-screen');
    }
    renderGameScreen(state);
  }
}

// ── Rundenlogik (Lehrkraft) ─────────────────────────────────────────
// Das Lehrkraft-Gerät setzt nie eine JoStorage-ViewerId und sieht dadurch
// immer den vollständigen Zustand inkl. Geheimwort (siehe filterJoState()
// in api.php) – nur die Rater:in bekommt es serverseitig herausgefiltert.

function drawNextRound(state) {
  if (!state.turnOrder.length) return false;
  const pool = JoWordlistModel.pooledWords(wordlistData, state.activeCategoryIds);
  const draw = JoWordlistModel.drawWord(pool, state.usedWordIds);
  if (!draw) return false;
  state.usedWordIds.push(draw.id);
  const guesserId = state.turnOrder[state.currentTurnIdx % state.turnOrder.length];
  state.currentRound = {
    guesserId, secretWord: draw.word, phase: 'collecting',
    clues: {}, struckIds: [], result: null
  };
  return true;
}

async function beginNextRound() {
  if ((gameState.players || []).length < 3) return;
  const ok = drawNextRound(gameState);
  if (!ok) gameState.phase = 'finished';
  await JoStorage.save(gameState);
  renderGameScreen(gameState);
}

async function forceCloseClues() {
  const ns = await JoStorage.mutate(draft => {
    const r = draft.currentRound;
    if (!r || r.phase !== 'collecting') return false;
    r.struckIds = joComputeDuplicateStrikes(r.clues);
    r.phase = 'review';
  });
  if (ns) onGameStateUpdate(ns);
}

async function toggleStrike(pid) {
  const r = gameState.currentRound;
  if (!r) return;
  const idx = (r.struckIds || []).indexOf(pid);
  if (idx >= 0) r.struckIds.splice(idx, 1);
  else (r.struckIds = r.struckIds || []).push(pid);
  await JoStorage.save(gameState);
  renderGameScreen(gameState);
}

async function releaseClues() {
  gameState.currentRound.phase = 'revealed';
  await JoStorage.save(gameState);
  renderGameScreen(gameState);
}

async function confirmAutoMiss() {
  await resolveRound(false);
}

async function resolveRound(result) {
  const r = gameState.currentRound;
  gameState.roundsPlayed += 1;
  if (result) gameState.correctCount += 1;
  r.phase = 'resolved';
  r.result = result;
  // Rater-Rotation für die nächste Runde vorbereiten
  gameState.currentTurnIdx = (gameState.currentTurnIdx + 1) % Math.max(1, gameState.turnOrder.length);
  await JoStorage.save(gameState);
  renderGameScreen(gameState);
}

async function endGame() {
  gameState.phase = 'finished';
  gameState.currentRound = null;
  await JoStorage.save(gameState);
  renderGameScreen(gameState);
}

function renderGameScreen(state) {
  const roundNum = state.roundsPlayed + (state.currentRound ? 1 : 0);
  document.getElementById('game-round-info').textContent =
    'Runde ' + Math.min(roundNum, state.settings.targetRounds) + ' von ' + state.settings.targetRounds + ' · ' + state.correctCount + ' richtig';
  document.getElementById('game-board-link').href = 'board.html?code=' + JoStorage.getCode();
  renderPlayerChips('game-player-list', state.players || [], true);

  const body = document.getElementById('game-body');
  if (state.phase === 'finished') { body.innerHTML = renderFinishedHtml(state); return; }

  const r = state.currentRound;
  if (!r) { body.innerHTML = renderNoRoundHtml(state); return; }
  if (r.phase === 'collecting') body.innerHTML = renderCollectingHtml(state, r);
  else if (r.phase === 'review') body.innerHTML = renderReviewHtml(state, r);
  else if (r.phase === 'revealed') body.innerHTML = renderRevealedHtml(state, r);
  else if (r.phase === 'resolved') body.innerHTML = renderResolvedHtml(state, r);
}

function renderNoRoundHtml(state) {
  if ((state.players || []).length < 3) {
    return `<div class="game-card">
      <div class="round-banner">Warte auf mehr Spieler:innen</div>
      <div class="round-subtext">Mindestens 3 Spieler:innen nötig (aktuell ${(state.players || []).length}).</div>
    </div>`;
  }
  return `<div class="game-card">
    <div class="round-banner">Bereit für Runde ${state.roundsPlayed + 1} von ${state.settings.targetRounds}</div>
    <button class="setup-btn" onclick="beginNextRound()">&#9658; Runde starten</button>
  </div>`;
}

function renderCollectingHtml(state, r) {
  const expected = joExpectedClueCount(state);
  const submitted = Object.keys(r.clues).length;
  const chips = (state.players || []).filter(p => p.id !== r.guesserId).map(p =>
    `<span class="progress-chip${r.clues[p.id] ? ' done' : ''}">${escHtml(p.name)}</span>`).join('');
  return `<div class="game-card">
    <div class="round-banner">🙈 ${escHtml(joPlayerName(state, r.guesserId))} rät diese Runde</div>
    <div class="round-subtext">${submitted} von ${expected} Hinweisen abgegeben</div>
    <div class="progress-chips">${chips}</div>
    <button class="btn btn-secondary" onclick="forceCloseClues()">Hinweise jetzt schließen</button>
  </div>`;
}

function renderReviewHtml(state, r) {
  const dupIds = new Set(joComputeDuplicateStrikes(r.clues));
  const rows = Object.keys(r.clues).map(pid => {
    const struck = (r.struckIds || []).includes(pid);
    return `<div class="mod-row${struck ? ' struck' : ''}">
      <span class="mod-name">${escHtml(joPlayerName(state, pid))}</span>
      <span class="mod-text">${escHtml(r.clues[pid])}</span>
      ${dupIds.has(pid) ? '<span class="mod-reason">Duplikat</span>' : ''}
      <button class="mod-toggle" onclick="toggleStrike('${pid}')">${struck ? 'Wiederherstellen' : 'Streichen'}</button>
    </div>`;
  }).join('');
  const survivors = joSurvivingClueTexts(r).length;
  return `<div class="game-card">
    <div class="round-banner">Hinweise prüfen</div>
    <div class="round-subtext">Duplikate sind bereits markiert. Weitere ungültige Hinweise (Wortfamilie, Fremdsprache, erfunden) manuell streichen.</div>
    <div class="mod-list">${rows || '<p style="color:var(--text-secondary);">Keine Hinweise abgegeben.</p>'}</div>
    ${survivors > 0
      ? `<button class="setup-btn" onclick="releaseClues()">Freigeben (${survivors} Hinweis${survivors === 1 ? '' : 'e'})</button>`
      : `<button class="setup-btn btn-wrong" onclick="confirmAutoMiss()">Fehlversuch bestätigen &amp; weiter</button>`}
  </div>`;
}

function renderRevealedHtml(state, r) {
  const chips = joSurvivingClueTexts(r).map(w => `<span class="reveal-chip">${escHtml(w)}</span>`).join('');
  return `<div class="game-card">
    <div class="round-banner">🙈 ${escHtml(joPlayerName(state, r.guesserId))} darf raten</div>
    <div class="round-subtext">Hinweise:</div>
    <div class="reveal-list">${chips}</div>
    <div class="round-subtext">Antwort wurde laut gesagt – richtig?</div>
    <div class="result-actions">
      <button class="setup-btn btn-correct" onclick="resolveRound(true)">✓ Richtig</button>
      <button class="setup-btn btn-wrong" onclick="resolveRound(false)">✗ Falsch</button>
    </div>
  </div>`;
}

function renderResolvedHtml(state, r) {
  const isLast = state.roundsPlayed >= state.settings.targetRounds;
  return `<div class="game-card">
    <div class="round-banner">${r.result ? '✅ Richtig!' : '❌ Leider falsch'}</div>
    <div class="resolved-word">${escHtml(r.secretWord)}</div>
    <div class="resolved-result ${r.result ? 'correct' : 'wrong'}">Stand: ${state.correctCount} von ${state.roundsPlayed} Runden</div>
    <button class="setup-btn" onclick="${isLast ? 'endGame()' : 'beginNextRound()'}">${isLast ? 'Spiel beenden' : 'Nächste Runde ▶'}</button>
  </div>`;
}

function renderFinishedHtml(state) {
  const total = state.roundsPlayed || 0;
  const pct = total > 0 ? Math.round((state.correctCount / total) * 100) : 0;
  const rating = joRatingText(state.correctCount, total);
  return `<div class="game-card">
    <div class="round-banner">🏁 Spiel beendet</div>
    <div class="finish-score">${state.correctCount} / ${total}</div>
    <div class="finish-bar-wrap"><div class="finish-bar" style="width:${pct}%"></div></div>
    <div class="finish-rating"><span class="emoji">${rating.emoji}</span>${escHtml(rating.label)}</div>
    <a class="lobby-back-link" style="color:var(--text-secondary);" onclick="resetToSelector()">&#8592; Zurück zum Spielwähler</a>
  </div>`;
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
  } else if (gs.phase === 'playing' || gs.phase === 'finished') {
    showScreen('game-screen');
    renderGameScreen(gs);
    if (gs.phase === 'playing') subscribeGame(code);
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
