// play.js – Hochstapler: Schülergerät (Beitritt, Wort-/Rollenanzeige,
// Abstimmung). Struktur nach just-one/js/play.js bzw. insider/js/play.js.
//
// Das Geheimwort wird serverseitig vor dem/den Hochstapler(n) verborgen und
// impostorIds auf höchstens die eigene Identität reduziert (siehe
// filterHsState() in api.php) – bei zwei Hochstaplern kennen sie einander
// nicht. Die UI verlässt sich deshalb NIE darauf, dass diese Felder
// vollständig sind.

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
  const key = 'hs_playerId_' + gameCode;
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
  HsStorage.setCode(c);

  // Viewer-Id VOR dem ersten load() setzen: falls dieses Gerät in eine
  // laufende Runde reconnected, muss schon die allererste Antwort gefiltert
  // sein – sonst stünde das Geheimwort kurz im Speicher.
  const storedId = localStorage.getItem('hs_playerId_' + c);
  if (storedId) HsStorage.setViewerId(storedId);

  const state = await HsStorage.load(c);
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
    HsStorage.setViewerId(null);
    if (storedId) localStorage.removeItem('hs_playerId_' + c); // wurde entfernt, sauberer Neustart
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
  HsStorage.setViewerId(myPlayerId);
  const ns = await HsStorage.mutate(draft => {
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
  sub = HsStorage.subscribe(code, onRemoteUpdate);
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
  localStorage.removeItem('hs_playerId_' + code);
  myPlayerId = null;
  HsStorage.setViewerId(null);
  showScreen('screen-kicked');
  setTimeout(() => { showScreen('screen-name'); }, 2000);
}

// ── Abstimmung ───────────────────────────────────────────────────────
// Umkämpfter Pfad: viele Geräte schreiben parallel → mutate() (CAS).
// Gibt die LETZTE erwartete Person ihre Stimme ab, schließt derselbe
// mutate()-Aufruf die Abstimmung (vtCloseVote) – die Auszählung braucht
// nur die votes, nie die gefilterten Geheimfelder.
async function submitVote(suspectId) {
  const ns = await HsStorage.mutate(draft => {
    const r = draft.currentRound;
    if (!r || r.phase !== 'voting') return false;
    if (suspectId === myPlayerId) return false;
    if (r.runoffIds && !r.runoffIds.includes(suspectId)) return false;
    r.votes[myPlayerId] = suspectId;
    const voterIds = (draft.players || []).map(p => p.id);
    if (vtAllVoted(r.votes, voterIds)) vtCloseVote(r);
  });
  if (ns) {
    remoteState = ns;
    renderPlayScreen(ns);
  }
}
window.submitVote = submitVote;

// ── Rollen-Anzeige (gedrückt halten zum Aufdecken) ───────────────────
function revealRole(show) {
  document.getElementById('role-secret')?.classList.toggle('revealed', !!show);
}
window.revealRole = revealRole;

function amImpostor(r) {
  return (r.impostorIds || []).includes(myPlayerId);
}

function roleCardHtml(r) {
  let inner;
  if (amImpostor(r)) {
    inner = `<div class="role-name">🎭 Du bist der HOCHSTAPLER</div>
      <div class="role-word">???</div>
      <div class="role-hint">Du kennst das Geheimwort nicht. Höre gut zu, bluffe mit einem passenden Hinweiswort – und flieg nicht auf!</div>`;
  } else {
    inner = `<div class="role-name">✅ Du kennst das Wort</div>
      <div class="role-word">${escHtml(r.secretWord || '')}</div>
      <div class="role-hint">Nenne ein passendes Hinweiswort – aber das Geheimwort selbst ist tabu!</div>`;
  }
  return `<div class="role-card">
    <div class="role-secret" id="role-secret">${inner}</div>
    <button class="btn btn-secondary reveal-btn"
      onpointerdown="revealRole(true)" onpointerup="revealRole(false)"
      onpointerleave="revealRole(false)" oncontextmenu="return false">👁 Gedrückt halten zum Anzeigen</button>
  </div>`;
}

function speakOrderHtml(state, r) {
  return `<div class="speak-order">${(r.speakOrder || []).map((id, i) =>
    `<span class="speak-chip${id === myPlayerId ? ' me' : ''}"><span class="speak-num">${i + 1}</span> ${escHtml(vtPlayerName(state, id))}</span>`
  ).join('')}</div>`;
}

// ── Rendering ────────────────────────────────────────────────────────
const P_RESULT_TEXT = {
  honest:   { emoji: '🎉', label: 'Hochstapler enttarnt – die Ehrlichen gewinnen!' },
  impostor: { emoji: '🎭', label: 'Der Hochstapler gewinnt!' }
};

function renderPlayScreen(state) {
  document.getElementById('p-game-round-info').textContent =
    'Runde ' + (state.roundsPlayed + (state.currentRound ? 1 : 0) || 1) + ' · ' + state.roundsPlayed + ' gespielt';

  const body = document.getElementById('p-game-body');
  if (state.phase === 'finished') { body.innerHTML = renderPFinishedHtml(state); return; }

  const r = state.currentRound;
  if (!r) {
    body.innerHTML = '<div class="game-card"><div class="round-banner">Warte auf die nächste Runde …</div></div>';
    return;
  }
  if (r.phase === 'roleReveal') body.innerHTML = renderPRoleRevealHtml(state, r);
  else if (r.phase === 'hinting') body.innerHTML = renderPHintingHtml(state, r);
  else if (r.phase === 'voting') body.innerHTML = renderPVotingHtml(state, r);
  else if (r.phase === 'voteClosed') body.innerHTML = renderPVoteClosedHtml(state, r);
  else if (r.phase === 'lastChance') body.innerHTML = renderPLastChanceHtml(state, r);
  else if (r.phase === 'resolved') body.innerHTML = renderPResolvedHtml(state, r);
}

function renderPRoleRevealHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">🎭 Deine Rolle</div>
    ${roleCardHtml(r)}
    <div class="round-subtext">Die Lehrkraft startet gleich die Hinweisrunden …</div>
  </div>`;
}

function renderPHintingHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">🗣 Hinweisrunde ${r.hintRound} von ${state.settings.hintRounds}</div>
    <div class="round-subtext">Reihum nennt jede Person mündlich EIN Hinweiswort:</div>
    ${speakOrderHtml(state, r)}
    ${roleCardHtml(r)}
  </div>`;
}

function renderPVotingHtml(state, r) {
  const voterIds = (state.players || []).map(p => p.id);
  const { done, total } = vtVoteProgress(r.votes, voterIds);
  const myVote = (r.votes || {})[myPlayerId] || null;
  const candidates = (state.players || []).filter(p =>
    p.id !== myPlayerId &&
    (!r.runoffIds || r.runoffIds.includes(p.id)));
  const btns = candidates.map(p =>
    `<button class="vote-btn${myVote === p.id ? ' selected' : ''}" onclick="submitVote('${p.id}')">${escHtml(p.name)}</button>`
  ).join('');
  return `<div class="game-card">
    <div class="round-banner">🗳 ${r.runoffIds ? 'Stichwahl' : 'Abstimmung'}: Wer ist der Hochstapler?</div>
    ${r.runoffIds ? '<div class="round-subtext">Gleichstand – stimmt noch einmal ab!</div>' : ''}
    <div class="vote-list">${btns || '<p class="round-subtext">Keine Auswahl möglich.</p>'}</div>
    <div class="round-subtext">${myVote ? 'Deine Stimme: <strong>' + escHtml(vtPlayerName(state, myVote)) + '</strong> (antippen zum Ändern)' : 'Tippe auf einen Namen.'}</div>
    <div class="round-subtext">${done} von ${total} Stimmen abgegeben.</div>
  </div>`;
}

function renderPVoteClosedHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">🗳 Abstimmung beendet</div>
    <div class="round-subtext">${r.votedId
      ? 'Gewählt wurde: <strong>' + escHtml(vtPlayerName(state, r.votedId)) + '</strong>'
      : 'Keine eindeutige Wahl.'}</div>
    <div class="round-subtext">Die Lehrkraft löst gleich auf …</div>
  </div>`;
}

function renderPLastChanceHtml(state, r) {
  const isMe = r.votedId === myPlayerId;
  return `<div class="game-card">
    <div class="round-banner">⚡ Letzte Chance!</div>
    <div class="round-subtext">${isMe
      ? 'Du wurdest enttarnt! Errate jetzt das Geheimwort – sag es laut!'
      : '<strong>' + escHtml(vtPlayerName(state, r.votedId)) + '</strong> wurde enttarnt und darf jetzt das Geheimwort raten …'}</div>
  </div>`;
}

function renderPResolvedHtml(state, r) {
  const rt = P_RESULT_TEXT[r.result] || { emoji: '❔', label: '' };
  const wasMe = (r.impostorIds || []).includes(myPlayerId);
  const names = (r.impostorIds || []).map(id => escHtml(vtPlayerName(state, id))).join(' &amp; ');
  return `<div class="game-card">
    <div class="round-banner">${rt.emoji} ${escHtml(rt.label)}</div>
    <div class="resolved-word">${escHtml(r.secretWord || '')}</div>
    <div class="round-subtext">Hochstapler: <strong>${names}</strong>${wasMe ? ' – also du! 🎭' : ''}</div>
    <div class="round-subtext">Die Lehrkraft startet die nächste Runde …</div>
  </div>`;
}

function renderPFinishedHtml(state) {
  const res = state.results || {};
  return `<div class="game-card">
    <div class="round-banner">🏁 Spiel beendet</div>
    <div class="results-chips">
      <span class="result-chip">🎉 Ehrliche: ${res.honest || 0}</span>
      <span class="result-chip">🎭 Hochstapler: ${res.impostor || 0}</span>
    </div>
    <div class="round-subtext">Danke fürs Mitspielen!</div>
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
