// play.js – Just One: Schülergerät (Beitritt, Warteraum, Kick-Erkennung)
// Rundenlogik (Hinweis-Eingabe / Rater-Ansicht) folgt in einer späteren Ausbaustufe.

let code = null;
let myPlayerId = null;
let remoteState = null;
let sub = null;

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function getOrCreatePlayerId(gameCode) {
  const key = 'jo_playerId_' + gameCode;
  let id = localStorage.getItem(key);
  if (!id) {
    id = 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 8);
    localStorage.setItem(key, id);
  }
  return id;
}

function renderPlayerChips(containerId, players) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = players.map(p => `<span class="player-chip">${escHtml(p.name)}</span>`).join('')
    || '<span class="player-count-hint">Noch niemand beigetreten.</span>';
}

// ── Code eingeben ────────────────────────────────────────────────
function submitCode() {
  const input = document.getElementById('join-code-input');
  const c = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4) {
    document.getElementById('join-error').textContent = 'Bitte 4-stelligen Code eingeben.';
    return;
  }
  enterCode(c);
}

async function enterCode(c) {
  document.getElementById('join-error').textContent = '';
  JoStorage.setCode(c);

  // Viewer-Id VOR dem ersten load() setzen: falls dieses Gerät gerade eine
  // laufende Rate-Runde reconnected, muss schon die allererste Antwort
  // gefiltert sein – sonst steckt das Geheimwort kurz im Speicher, auch
  // wenn die UI es nicht anzeigt.
  const storedId = localStorage.getItem('jo_playerId_' + c);
  if (storedId) JoStorage.setViewerId(storedId);

  const state = await JoStorage.load(c);
  if (!state || !state.meta) {
    document.getElementById('join-error').textContent = 'Spiel nicht gefunden. Code prüfen.';
    return;
  }
  code = c;
  remoteState = state;
  window.history.replaceState({}, '', 'view.html?code=' + c);

  if (storedId && (state.players || []).some(p => p.id === storedId)) {
    myPlayerId = storedId;
    enterWaitOrGame(state);
    startSubscription();
  } else {
    JoStorage.setViewerId(null);
    if (storedId) localStorage.removeItem('jo_playerId_' + c); // wurde entfernt, sauberer Neustart
    showScreen('screen-name');
  }
}

// ── Namen eingeben + beitreten ──────────────────────────────────────
async function submitName() {
  const input = document.getElementById('name-input');
  const name = (input ? input.value : '').trim().slice(0, 30);
  const errEl = document.getElementById('name-error');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Bitte einen Namen eingeben.'; return; }

  myPlayerId = getOrCreatePlayerId(code);
  JoStorage.setViewerId(myPlayerId);
  const ns = await JoStorage.mutate(draft => {
    if (!Array.isArray(draft.players)) draft.players = [];
    if (draft.players.some(p => p.id === myPlayerId)) return; // schon dabei (Re-Join)
    draft.players.push({ id: myPlayerId, name, joinedAt: new Date().toISOString() });
  });

  if (!ns) {
    errEl.textContent = 'Beitritt fehlgeschlagen. Bitte erneut versuchen.';
    return;
  }
  remoteState = ns;
  enterWaitOrGame(ns);
  startSubscription();
}

function enterWaitOrGame(state) {
  if (state.phase === 'playing' || state.phase === 'finished') {
    showScreen('screen-game');
    renderPlayScreen(state);
  } else {
    document.getElementById('wait-my-name').textContent = 'Du bist dabei! Warte auf den Spielstart …';
    showScreen('screen-wait');
    renderPlayerChips('wait-player-list', state.players || []);
  }
}

// ── Live-Sync + Kick-Erkennung ───────────────────────────────────────
function startSubscription() {
  if (sub) { sub.unsubscribe(); sub = null; }
  sub = JoStorage.subscribe(code, onRemoteUpdate);
}

function onRemoteUpdate(state) {
  if (myPlayerId && Array.isArray(state.players) && !state.players.some(p => p.id === myPlayerId)) {
    handleKicked();
    return;
  }
  remoteState = state;

  const activeId = document.querySelector('.screen.active')?.id;
  if (state.phase === 'playing' || state.phase === 'finished') {
    if (activeId !== 'screen-game') showScreen('screen-game');
    renderPlayScreen(state);
  } else if (activeId === 'screen-wait') {
    renderPlayerChips('wait-player-list', state.players || []);
  }
}

function handleKicked() {
  if (sub) { sub.unsubscribe(); sub = null; }
  localStorage.removeItem('jo_playerId_' + code);
  myPlayerId = null;
  JoStorage.setViewerId(null);
  showScreen('screen-kicked');
  setTimeout(() => { showScreen('screen-name'); }, 2000);
}

// ── Rundenlogik (Schülergerät) ───────────────────────────────────────
// Das Geheimwort wird serverseitig gefiltert (siehe filterJoState() in
// api.php), solange myPlayerId === currentRound.guesserId und die Runde
// noch nicht aufgelöst ist – die UI blendet es zusätzlich clientseitig aus.

async function submitClue() {
  const input = document.getElementById('clue-input');
  const text = (input ? input.value : '').trim().slice(0, 60);
  const errEl = document.getElementById('clue-error');
  if (errEl) errEl.textContent = '';
  if (!text) return;

  const ns = await JoStorage.mutate(draft => {
    const r = draft.currentRound;
    if (!r || r.phase !== 'collecting') return false;
    if (r.guesserId === myPlayerId) return false;
    r.clues[myPlayerId] = text;
    if (Object.keys(r.clues).length >= joExpectedClueCount(draft)) {
      r.phase = 'review';
      r.struckIds = joComputeDuplicateStrikes(r.clues);
    }
  });

  if (!ns) {
    if (errEl) errEl.textContent = 'Hinweis konnte nicht gespeichert werden – bitte erneut versuchen.';
    return;
  }
  remoteState = ns;
  renderPlayScreen(ns);
}

function renderPlayScreen(state) {
  const roundNum = state.roundsPlayed + (state.currentRound ? 1 : 0);
  document.getElementById('p-game-round-info').textContent =
    'Runde ' + Math.min(roundNum, state.settings.targetRounds) + ' von ' + state.settings.targetRounds + ' · ' + state.correctCount + ' richtig';

  const body = document.getElementById('p-game-body');
  if (state.phase === 'finished') { body.innerHTML = renderPFinishedHtml(state); return; }

  const r = state.currentRound;
  if (!r) {
    body.innerHTML = '<div class="game-card"><div class="round-banner">Warte auf die nächste Runde …</div></div>';
    return;
  }
  const isGuesser = r.guesserId === myPlayerId;
  if (r.phase === 'collecting') body.innerHTML = renderPCollectingHtml(state, r, isGuesser);
  else if (r.phase === 'review') body.innerHTML = renderPReviewHtml();
  else if (r.phase === 'revealed') body.innerHTML = renderPRevealedHtml(state, r, isGuesser);
  else if (r.phase === 'resolved') body.innerHTML = renderPResolvedHtml(state, r);

  if (r.phase === 'collecting' && !isGuesser && !r.clues[myPlayerId]) {
    document.getElementById('clue-input')?.focus();
  }
}

function renderPCollectingHtml(state, r, isGuesser) {
  if (isGuesser) {
    const submitted = Object.keys(r.clues).length;
    const expected = joExpectedClueCount(state);
    return `<div class="game-card">
      <div class="round-banner">🙈 Du rätst!</div>
      <div class="round-subtext">Warte auf die Hinweise deiner Mitspieler:innen … (${submitted}/${expected})</div>
    </div>`;
  }
  const already = r.clues[myPlayerId];
  if (already) {
    return `<div class="game-card">
      <div class="round-banner">✅ Hinweis abgegeben</div>
      <div class="round-subtext">Dein Hinweis: „${escHtml(already)}" – warte auf die anderen …</div>
    </div>`;
  }
  return `<div class="game-card">
    <div class="round-banner">Dein Hinweis?</div>
    <div class="round-subtext">Geheimwort: <strong>${escHtml(r.secretWord)}</strong></div>
    <div class="clue-input-row">
      <input id="clue-input" maxlength="60" placeholder="Ein Wort…" autocomplete="off" onkeydown="if(event.key==='Enter')submitClue()">
      <button class="setup-btn" onclick="submitClue()">Senden</button>
    </div>
    <div class="gs-join-error" id="clue-error" style="margin-top:0.4rem;"></div>
  </div>`;
}

function renderPReviewHtml() {
  return `<div class="game-card">
    <div class="round-banner">🔍 Hinweise werden geprüft</div>
    <div class="round-subtext">Die Lehrkraft sortiert ungültige Hinweise aus …</div>
  </div>`;
}

function renderPRevealedHtml(state, r, isGuesser) {
  const chips = joSurvivingClueTexts(r).map(w => `<span class="reveal-chip">${escHtml(w)}</span>`).join('');
  return `<div class="game-card">
    <div class="round-banner">${isGuesser ? '🙈 Du bist dran!' : 'Hinweise für ' + escHtml(joPlayerName(state, r.guesserId))}</div>
    <div class="reveal-list">${chips || '<span class="round-subtext">Keine gültigen Hinweise übrig.</span>'}</div>
    <div class="round-subtext">${isGuesser ? 'Sag deine Antwort laut!' : 'Wartet auf die Antwort …'}</div>
  </div>`;
}

function renderPResolvedHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">${r.result ? '✅ Richtig!' : '❌ Leider falsch'}</div>
    <div class="resolved-word">${escHtml(r.secretWord)}</div>
    <div class="resolved-result ${r.result ? 'correct' : 'wrong'}">Stand: ${state.correctCount} von ${state.roundsPlayed} Runden</div>
    <div class="round-subtext">Die Lehrkraft startet die nächste Runde …</div>
  </div>`;
}

function renderPFinishedHtml(state) {
  const total = state.roundsPlayed || 0;
  const pct = total > 0 ? Math.round((state.correctCount / total) * 100) : 0;
  const rating = joRatingText(state.correctCount, total);
  return `<div class="game-card">
    <div class="round-banner">🏁 Spiel beendet</div>
    <div class="finish-score">${state.correctCount} / ${total}</div>
    <div class="finish-bar-wrap"><div class="finish-bar" style="width:${pct}%"></div></div>
    <div class="finish-rating"><span class="emoji">${rating.emoji}</span>${escHtml(rating.label)}</div>
  </div>`;
}

// ── Start ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) {
    const input = document.getElementById('join-code-input');
    if (input) input.value = urlCode.toUpperCase();
    enterCode(urlCode.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  }
});
