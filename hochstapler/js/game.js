// game.js – Hochstapler: Lehrkraft-Logik (Spielwähler, Setup, Kategorien,
// Lobby, Rundenmoderation). Struktur nach just-one/js/game.js bzw.
// insider/js/game.js; Begriffe kommen aus der Just-One-Begriffs-DB
// (../just-one/js/wordlist-shared.js), Abstimmungs-Helfer aus
// ../insider/js/vote-shared.js.
//
// Das Lehrkraft-Gerät setzt nie eine HsStorage-ViewerId und sieht dadurch
// immer den vollständigen Zustand inkl. Geheimwort und Hochstapler-Identität
// (siehe filterHsState() in api.php).

let gameState = null;
let wordlistData = { categories: [] };
let selectedSubcatIds = new Set();
let gameSub = null;

const MIN_PLAYERS = 3;
const MIN_PLAYERS_TWO_IMPOSTORS = 5;
const HINT_ROUND_OPTIONS = [1, 2, 3, 4];

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Spielwähler ─────────────────────────────────────────────────────
async function showGameSelector() {
  showScreen('game-selector');
  const list = document.getElementById('gs-game-list');
  list.innerHTML = '<p class="gs-empty">Lade Spiele…</p>';
  const registry = await HsStorage.loadGamesRegistry();
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
  const code = HsStorage.generateCode();
  HsStorage.setCode(code);
  gameState = {
    meta: { gameCode: code, title: 'Hochstapler', createdAt: new Date().toISOString() },
    phase: 'setup',
    players: [],
    activeCategoryIds: [],
    usedWordIds: [],
    settings: { hintRounds: 2, twoImpostors: false },
    roundsPlayed: 0,
    results: { honest: 0, impostor: 0 },
    roundHistory: [],
    currentRound: null
  };
  await HsStorage.save(gameState);
  window.history.replaceState({}, '', 'index.html?code=' + code);
  showScreen('setup-screen');
  document.getElementById('setup-game-title').value = '';
  renderSettingsRows();
  showCodeBannerInline();
}

// ── Setup ───────────────────────────────────────────────────────────
function renderSettingsRows() {
  const rounds = gameState?.settings?.hintRounds || 2;
  document.getElementById('hint-rounds-row').innerHTML = HINT_ROUND_OPTIONS.map(n =>
    `<button type="button" class="param-btn${n === rounds ? ' active' : ''}" onclick="setHintRounds(${n})">${n}</button>`
  ).join('');
  const two = !!gameState?.settings?.twoImpostors;
  document.getElementById('impostors-row').innerHTML =
    `<button type="button" class="param-btn${!two ? ' active' : ''}" onclick="setTwoImpostors(false)">1</button>` +
    `<button type="button" class="param-btn${two ? ' active' : ''}" onclick="setTwoImpostors(true)">2</button>`;
}

function setHintRounds(n) {
  if (!gameState) return;
  gameState.settings.hintRounds = n;
  renderSettingsRows();
}

function setTwoImpostors(v) {
  if (!gameState) return;
  gameState.settings.twoImpostors = !!v;
  renderSettingsRows();
}

async function proceedToCategories() {
  const title = document.getElementById('setup-game-title').value.trim();
  gameState.meta.title = title || 'Hochstapler';
  buildCategoryUI();
  showScreen('category-screen');
}

// ── Kategorien (Just-One-Begriffs-DB: Kategorie → Unterkategorie) ──
// Dokumentiertes Duplikat der Kategorie-UI aus just-one/js/game.js.
function buildCategoryUI() {
  const list = document.getElementById('cat-select-list');
  list.innerHTML = '';

  if (!wordlistData.categories.length) {
    list.innerHTML = '<p class="gs-empty">Noch keine Begriffe vorhanden. Bitte zuerst in der Just-One-Begriffsverwaltung anlegen.</p>';
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
  await HsStorage.save(gameState);
  showLobbyScreen();
  subscribeGame(HsStorage.getCode());
}

// ── Lobby ───────────────────────────────────────────────────────────
function showLobbyScreen() {
  const code = HsStorage.getCode();
  document.getElementById('lobby-code-val').textContent = code || '----';
  document.getElementById('lobby-board-link').href = 'board.html?code=' + code;
  const count = JoWordlistModel.pooledWords(wordlistData, gameState.activeCategoryIds).length;
  document.getElementById('lobby-summary').textContent =
    gameState.activeCategoryIds.length + ' Unterkategorie(n) · ' + count + ' Begriffe · ' +
    gameState.settings.hintRounds + ' Hinweisrunde(n) · ' + (gameState.settings.twoImpostors ? '2 Hochstapler' : '1 Hochstapler');
  showScreen('lobby-screen');
  renderPlayerChips('lobby-player-list', gameState.players || [], true);
  updateLobbyPlayerHint();
}

function updateLobbyPlayerHint() {
  const hint = document.getElementById('lobby-player-hint');
  const n = (gameState.players || []).length;
  const startBtn = document.getElementById('btn-start-game');
  if (n < MIN_PLAYERS) {
    hint.textContent = n + ' Spieler:in(nen) beigetreten – mindestens ' + MIN_PLAYERS + ' nötig.';
    hint.classList.remove('ok');
    if (startBtn) startBtn.disabled = true;
  } else {
    hint.textContent = n + ' Spieler:innen bereit.' +
      (gameState.settings.twoImpostors && n < MIN_PLAYERS_TWO_IMPOSTORS
        ? ' (Für 2 Hochstapler sind ' + MIN_PLAYERS_TWO_IMPOSTORS + ' nötig – sonst spielt nur einer.)' : '');
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
  const ns = await HsStorage.mutate(draft => {
    draft.players = (draft.players || []).filter(p => p.id !== playerId);
    const r = draft.currentRound;
    if (r) {
      r.impostorIds = (r.impostorIds || []).filter(id => id !== playerId);
      if (!r.impostorIds.length) {
        // Kein Hochstapler mehr übrig → Runde kann nicht fortgesetzt werden
        draft.currentRound = null;
      } else {
        r.speakOrder = (r.speakOrder || []).filter(id => id !== playerId);
        if (r.votes) {
          delete r.votes[playerId];
          for (const voterId in r.votes) {
            if (r.votes[voterId] === playerId) delete r.votes[voterId];
          }
        }
        if (r.runoffIds) r.runoffIds = r.runoffIds.filter(id => id !== playerId);
      }
    }
  });
  if (ns) {
    gameState = ns;
    onGameStateUpdate(ns);
  }
}

async function startGame() {
  if ((gameState.players || []).length < MIN_PLAYERS) return;
  gameState.phase = 'playing';
  gameState.roundsPlayed = 0;
  gameState.results = { honest: 0, impostor: 0 };
  gameState.roundHistory = [];
  gameState.usedWordIds = [];
  gameState.currentRound = null;
  await HsStorage.save(gameState);
  showScreen('game-screen');
  renderGameScreen(gameState);
}

// ── Live-Sync (Lobby + Spiel) ─────────────────────────────────────
function subscribeGame(code) {
  if (gameSub) { gameSub.unsubscribe(); gameSub = null; }
  gameSub = HsStorage.subscribe(code, onGameStateUpdate);
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
function drawNextRound(state) {
  const players = state.players || [];
  if (players.length < MIN_PLAYERS) return false;
  const pool = JoWordlistModel.pooledWords(wordlistData, state.activeCategoryIds);
  const draw = JoWordlistModel.drawWord(pool, state.usedWordIds);
  if (!draw) return false;
  state.usedWordIds.push(draw.id);
  const ids = players.map(p => p.id);
  const impostorCount = (state.settings.twoImpostors && players.length >= MIN_PLAYERS_TWO_IMPOSTORS) ? 2 : 1;
  state.currentRound = {
    num: state.roundsPlayed + 1,
    impostorIds: shuffleArray(ids).slice(0, impostorCount),
    secretWord: draw.word,
    speakOrder: shuffleArray(ids),
    hintRound: 0,
    phase: 'roleReveal',
    votes: {}, runoffIds: null, votedId: null,
    result: null
  };
  return true;
}

async function beginNextRound() {
  if ((gameState.players || []).length < MIN_PLAYERS) return;
  const ok = drawNextRound(gameState);
  if (!ok) gameState.phase = 'finished';
  await HsStorage.save(gameState);
  renderGameScreen(gameState);
}

async function startHinting() {
  const r = gameState.currentRound;
  if (!r || r.phase !== 'roleReveal') return;
  r.phase = 'hinting';
  r.hintRound = 1;
  await HsStorage.save(gameState);
  renderGameScreen(gameState);
}

async function nextHintRound() {
  const r = gameState.currentRound;
  if (!r || r.phase !== 'hinting') return;
  if (r.hintRound >= gameState.settings.hintRounds) return;
  r.hintRound += 1;
  await HsStorage.save(gameState);
  renderGameScreen(gameState);
}

async function openVote() {
  const r = gameState.currentRound;
  if (!r || r.phase !== 'hinting') return;
  r.phase = 'voting';
  r.votes = {};
  await HsStorage.save(gameState);
  renderGameScreen(gameState);
}

// Abstimmung schließen: umkämpfter Pfad (Schüler stimmen parallel per CAS
// ab) → mutate() statt Force-Write. vtCloseVote() kann auch eine Stichwahl
// auslösen (Phase bleibt dann 'voting').
async function forceCloseVote() {
  const { done, total } = vtVoteProgress(gameState.currentRound?.votes, (gameState.players || []).map(p => p.id));
  if (done < total && !confirm('Erst ' + done + ' von ' + total + ' Stimmen abgegeben. Abstimmung trotzdem schließen?')) return;
  const ns = await HsStorage.mutate(draft => {
    const r = draft.currentRound;
    if (!r || r.phase !== 'voting') return false;
    vtCloseVote(r);
  });
  if (ns) onGameStateUpdate(ns);
}

// Auflösen erst durch die Lehrkraft: nur ihr Gerät kennt die
// Hochstapler-Identität (Schüler-Clients sind serverseitig gefiltert).
// Wurde ein Hochstapler gewählt → letzte Chance (mündlich raten);
// sonst gewinnt der Hochstapler sofort.
async function resolveVote() {
  const r = gameState.currentRound;
  if (!r || r.phase !== 'voteClosed') return;
  if (r.votedId && (r.impostorIds || []).includes(r.votedId)) {
    r.phase = 'lastChance';
  } else {
    r.phase = 'resolved';
    r.result = 'impostor';
    finishRound(r);
  }
  await HsStorage.save(gameState);
  renderGameScreen(gameState);
}

async function lastChanceResolve(guessedCorrectly) {
  const r = gameState.currentRound;
  if (!r || r.phase !== 'lastChance') return;
  r.phase = 'resolved';
  r.result = guessedCorrectly ? 'impostor' : 'honest';
  finishRound(r);
  await HsStorage.save(gameState);
  renderGameScreen(gameState);
}

function finishRound(r) {
  gameState.roundsPlayed += 1;
  gameState.results[r.result] = (gameState.results[r.result] || 0) + 1;
  gameState.roundHistory.push({
    num: r.num,
    word: r.secretWord,
    impostorNames: (r.impostorIds || []).map(id => vtPlayerName(gameState, id)),
    result: r.result
  });
}

async function endGame() {
  if (!confirm('Spiel beenden und Gesamtergebnis zeigen?')) return;
  gameState.phase = 'finished';
  gameState.currentRound = null;
  await HsStorage.save(gameState);
  renderGameScreen(gameState);
}

// ── Rendering (Lehrkraft) ───────────────────────────────────────────
const RESULT_TEXT = {
  honest:   { emoji: '🎉', label: 'Hochstapler enttarnt – die Ehrlichen gewinnen!' },
  impostor: { emoji: '🎭', label: 'Der Hochstapler gewinnt!' }
};

// Detailzeile fürs Ergebnis (aus dem Rundenverlauf ableitbar)
function resultDetail(r) {
  if (r.result !== 'impostor') return 'Enttarnt und das Wort nicht erraten.';
  if (!r.votedId) return 'Keine eindeutige Wahl – unentdeckt geblieben.';
  if ((r.impostorIds || []).includes(r.votedId)) return 'Enttarnt, aber das Geheimwort erraten!';
  return 'Ein:e Unschuldige:r wurde gewählt.';
}

function resultsSummaryHtml(state) {
  const res = state.results || {};
  return `<div class="results-chips">
    <span class="result-chip">🎉 Ehrliche: ${res.honest || 0}</span>
    <span class="result-chip">🎭 Hochstapler: ${res.impostor || 0}</span>
  </div>`;
}

function impostorNamesHtml(state, r) {
  return (r.impostorIds || []).map(id => escHtml(vtPlayerName(state, id))).join(' &amp; ');
}

function speakOrderHtml(state, r) {
  return `<div class="speak-order">${(r.speakOrder || []).map((id, i) =>
    `<span class="speak-chip"><span class="speak-num">${i + 1}</span> ${escHtml(vtPlayerName(state, id))}</span>`
  ).join('')}</div>`;
}

function renderGameScreen(state) {
  document.getElementById('game-round-info').textContent =
    'Runde ' + (state.roundsPlayed + (state.currentRound ? 1 : 0) || 1) + ' · ' + state.roundsPlayed + ' gespielt';
  document.getElementById('game-board-link').href = 'board.html?code=' + HsStorage.getCode();
  renderPlayerChips('game-player-list', state.players || [], true);

  const body = document.getElementById('game-body');
  if (state.phase === 'finished') { body.innerHTML = renderFinishedHtml(state); return; }

  const r = state.currentRound;
  if (!r) { body.innerHTML = renderNoRoundHtml(state); return; }
  if (r.phase === 'roleReveal') body.innerHTML = renderRoleRevealHtml(state, r);
  else if (r.phase === 'hinting') body.innerHTML = renderHintingHtml(state, r);
  else if (r.phase === 'voting') body.innerHTML = renderVotingHtml(state, r);
  else if (r.phase === 'voteClosed') body.innerHTML = renderVoteClosedHtml(state, r);
  else if (r.phase === 'lastChance') body.innerHTML = renderLastChanceHtml(state, r);
  else if (r.phase === 'resolved') body.innerHTML = renderResolvedHtml(state, r);
}

function renderNoRoundHtml(state) {
  if ((state.players || []).length < MIN_PLAYERS) {
    return `<div class="game-card">
      <div class="round-banner">Warte auf mehr Spieler:innen</div>
      <div class="round-subtext">Mindestens ${MIN_PLAYERS} Spieler:innen nötig (aktuell ${(state.players || []).length}).</div>
    </div>`;
  }
  return `<div class="game-card">
    <div class="round-banner">Bereit für Runde ${state.roundsPlayed + 1}</div>
    ${state.roundsPlayed > 0 ? resultsSummaryHtml(state) : ''}
    <button class="setup-btn" onclick="beginNextRound()">&#9658; Runde starten</button>
    ${state.roundsPlayed > 0 ? '<div style="margin-top:0.8rem;"><a class="lobby-back-link" style="color:var(--text-secondary);" onclick="endGame()">🏁 Spiel beenden</a></div>' : ''}
  </div>`;
}

function renderRoleRevealHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">🎭 Rollen sind verteilt</div>
    <div class="secret-word-box">Geheimwort: <strong>${escHtml(r.secretWord)}</strong></div>
    <div class="round-subtext">
      Hochstapler: <strong>${impostorNamesHtml(state, r)}</strong> 🤫<br>
      Alle schauen jetzt auf ihr Gerät. Nur die Hochstapler sehen das Wort NICHT.
    </div>
    <button class="setup-btn" onclick="startHinting()">🗣 Hinweisrunden starten</button>
  </div>`;
}

function renderHintingHtml(state, r) {
  const max = state.settings.hintRounds;
  return `<div class="game-card">
    <div class="round-banner">🗣 Hinweisrunde ${r.hintRound} von ${max}</div>
    <div class="secret-word-box">Geheimwort: <strong>${escHtml(r.secretWord)}</strong></div>
    <div class="round-subtext">Reihum nennt jede Person mündlich EIN Hinweiswort (das Geheimwort selbst ist tabu):</div>
    ${speakOrderHtml(state, r)}
    <div class="result-actions" style="margin-top:1rem;">
      ${r.hintRound < max ? '<button class="setup-btn" onclick="nextHintRound()">Nächste Hinweisrunde ▶</button>' : ''}
      <button class="setup-btn ${r.hintRound < max ? 'setup-btn-ghost' : ''}" onclick="openVote()">🗳 Zur Abstimmung</button>
    </div>
  </div>`;
}

function renderVotingHtml(state, r) {
  const voterIds = (state.players || []).map(p => p.id);
  const { done, total } = vtVoteProgress(r.votes, voterIds);
  const { counts } = vtTally(r.votes);
  const tallyRows = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .map(id => `<div class="mod-row"><span class="mod-text">${escHtml(vtPlayerName(state, id))}</span><span class="mod-name">${counts[id]} Stimme${counts[id] === 1 ? '' : 'n'}</span></div>`)
    .join('');
  return `<div class="game-card">
    <div class="round-banner">🗳 ${r.runoffIds ? 'Stichwahl' : 'Abstimmung'}: Wer ist der Hochstapler?</div>
    ${r.runoffIds ? `<div class="round-subtext">Gleichstand! Zur Wahl stehen nur noch: <strong>${r.runoffIds.map(id => escHtml(vtPlayerName(state, id))).join(', ')}</strong></div>` : ''}
    <div class="round-subtext">${done} von ${total} Stimmen abgegeben. Erst mündlich diskutieren, dann abstimmen!</div>
    <div class="mod-list">${tallyRows || '<p style="color:var(--text-secondary);text-align:center;">Noch keine Stimmen.</p>'}</div>
    <button class="btn btn-secondary" onclick="forceCloseVote()">Abstimmung jetzt schließen</button>
  </div>`;
}

function renderVoteClosedHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">🗳 Abstimmung beendet</div>
    <div class="round-subtext">${r.votedId
      ? 'Gewählt wurde: <strong>' + escHtml(vtPlayerName(state, r.votedId)) + '</strong>'
      : 'Keine eindeutige Wahl – niemand wird enttarnt.'}</div>
    <button class="setup-btn" onclick="resolveVote()">🎭 Auflösen</button>
  </div>`;
}

function renderLastChanceHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">⚡ Letzte Chance!</div>
    <div class="round-subtext"><strong>${escHtml(vtPlayerName(state, r.votedId))}</strong> ist Hochstapler und wurde enttarnt –
      errät er/sie jetzt mündlich das Geheimwort, gewinnt er/sie trotzdem.</div>
    <div class="secret-word-box">Geheimwort: <strong>${escHtml(r.secretWord)}</strong></div>
    <div class="result-actions">
      <button class="setup-btn btn-wrong" onclick="lastChanceResolve(true)">✓ Wort erraten – Hochstapler gewinnt</button>
      <button class="setup-btn btn-correct" onclick="lastChanceResolve(false)">✗ Falsch – Ehrliche gewinnen</button>
    </div>
  </div>`;
}

function renderResolvedHtml(state, r) {
  const rt = RESULT_TEXT[r.result] || { emoji: '❔', label: '' };
  return `<div class="game-card">
    <div class="round-banner">${rt.emoji} ${escHtml(rt.label)}</div>
    <div class="resolved-word">${escHtml(r.secretWord)}</div>
    <div class="round-subtext">Hochstapler: <strong>${impostorNamesHtml(state, r)}</strong> · ${escHtml(resultDetail(r))}</div>
    ${resultsSummaryHtml(state)}
    <div class="result-actions">
      <button class="setup-btn" onclick="beginNextRound()">Nächste Runde ▶</button>
      <button class="setup-btn setup-btn-ghost" onclick="endGame()">🏁 Spiel beenden</button>
    </div>
  </div>`;
}

function renderFinishedHtml(state) {
  const history = (state.roundHistory || []).map(h => {
    const rt = RESULT_TEXT[h.result] || { emoji: '❔' };
    return `<div class="mod-row"><span class="mod-name">R${h.num}</span>
      <span class="mod-text">${escHtml(h.word)} · ${(h.impostorNames || []).map(escHtml).join(' &amp; ')}</span>
      <span>${rt.emoji}</span></div>`;
  }).join('');
  return `<div class="game-card">
    <div class="round-banner">🏁 Spiel beendet</div>
    ${resultsSummaryHtml(state)}
    <div class="mod-list" style="margin-top:1rem;">${history || '<p style="color:var(--text-secondary);text-align:center;">Keine Runde gespielt.</p>'}</div>
    <a class="lobby-back-link" style="color:var(--text-secondary);" onclick="resetToSelector()">&#8592; Zurück zum Spielwähler</a>
  </div>`;
}

// ── Spielwähler-Aktionen ────────────────────────────────────────────
async function _gsEnter(code) {
  HsStorage.setCode(code);
  const gs = await HsStorage.load(code);
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
    document.getElementById('setup-game-title').value = gs.meta.title === 'Hochstapler' ? '' : gs.meta.title;
    renderSettingsRows();
    showCodeBannerInline();
  }
}
window._gsEnter = _gsEnter;

async function _gsDelete(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await HsStorage.deleteGame(code);
  showGameSelector();
}
window._gsDelete = _gsDelete;

function confirmAbandonLobby() {
  if (!confirm('Zurück zum Spielwähler? Das Spiel bleibt bestehen und kann über die Spielliste fortgesetzt werden.')) return;
  resetToSelector();
}

function resetToSelector() {
  if (gameSub) { gameSub.unsubscribe(); gameSub = null; }
  HsStorage.setCode(null);
  window.history.replaceState({}, '', 'index.html');
  const banner = document.getElementById('code-banner');
  if (banner) banner.remove();
  showGameSelector();
}

// ── Code-Anzeige ────────────────────────────────────────────────────
function showCodeBannerInline() {
  const code = HsStorage.getCode();
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
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) await _gsEnter(urlCode.toUpperCase());
  else showGameSelector();
});
