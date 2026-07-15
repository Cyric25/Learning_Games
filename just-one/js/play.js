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
  const state = await JoStorage.load(c);
  if (!state || !state.meta) {
    document.getElementById('join-error').textContent = 'Spiel nicht gefunden. Code prüfen.';
    return;
  }
  code = c;
  remoteState = state;
  window.history.replaceState({}, '', 'view.html?code=' + c);

  const storedId = localStorage.getItem('jo_playerId_' + c);
  if (storedId && (state.players || []).some(p => p.id === storedId)) {
    myPlayerId = storedId;
    enterWaitOrGame(state);
    startSubscription();
  } else {
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
    renderPlayerChips('game-wait-player-list', state.players || []);
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
    renderPlayerChips('game-wait-player-list', state.players || []);
  } else if (activeId === 'screen-wait') {
    renderPlayerChips('wait-player-list', state.players || []);
  }
}

function handleKicked() {
  if (sub) { sub.unsubscribe(); sub = null; }
  localStorage.removeItem('jo_playerId_' + code);
  myPlayerId = null;
  showScreen('screen-kicked');
  setTimeout(() => { showScreen('screen-name'); }, 2000);
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
