// play.js – Insider: Schülergerät (Beitritt, Rollenanzeige, Abstimmung)
// Struktur nach just-one/js/play.js.
//
// Geheimwort und Insider-Identität werden serverseitig gefiltert (siehe
// filterInsiderState() in api.php): Bürger:innen bekommen weder secretWord
// noch insiderId; der Master bekommt secretWord; nur der Insider bekommt
// insiderId (die eigene). Die UI verlässt sich deshalb NIE darauf, dass
// diese Felder vorhanden sind.

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
  const key = 'in_playerId_' + gameCode;
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

// ── Timer-Anzeige (Helfer in round-shared.js) ───────────────────────
function updateTimerDisplays() {
  const rem = inTimerRemaining(remoteState?.currentRound);
  document.querySelectorAll('.timer-remaining').forEach(el => {
    el.textContent = inTimerText(rem);
    el.classList.toggle('expired', rem !== null && rem <= 0);
  });
}
setInterval(updateTimerDisplays, 500);

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
  InStorage.setCode(c);

  // Viewer-Id VOR dem ersten load() setzen: falls dieses Gerät in eine
  // laufende Runde reconnected, muss schon die allererste Antwort gefiltert
  // sein – sonst stünden Geheimwort/Insider-Identität kurz im Speicher.
  const storedId = localStorage.getItem('in_playerId_' + c);
  if (storedId) InStorage.setViewerId(storedId);

  const state = await InStorage.load(c);
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
    InStorage.setViewerId(null);
    if (storedId) localStorage.removeItem('in_playerId_' + c); // wurde entfernt, sauberer Neustart
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
  InStorage.setViewerId(myPlayerId);
  const ns = await InStorage.mutate(draft => {
    if (!Array.isArray(draft.players)) draft.players = [];
    if (draft.players.some(p => p.id === myPlayerId)) return; // schon dabei (Re-Join)
    draft.players.push({ id: myPlayerId, name, joinedAt: new Date().toISOString() });
    // Späteinsteiger:innen kommen ans Ende der Master-Rotation
    if (draft.phase === 'playing' && Array.isArray(draft.turnOrder)) {
      draft.turnOrder.push(myPlayerId);
    }
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
  sub = InStorage.subscribe(code, onRemoteUpdate);
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
  localStorage.removeItem('in_playerId_' + code);
  myPlayerId = null;
  InStorage.setViewerId(null);
  showScreen('screen-kicked');
  setTimeout(() => { showScreen('screen-name'); }, 2000);
}

// ── Abstimmung ───────────────────────────────────────────────────────
// Umkämpfter Pfad: viele Geräte schreiben parallel → mutate() (CAS).
// Gibt die LETZTE erwartete Person ihre Stimme ab, schließt derselbe
// mutate()-Aufruf die Abstimmung (vtCloseVote) – die Auszählung braucht
// nur die votes, nie die gefilterten Geheimfelder.
async function submitVote(suspectId) {
  const ns = await InStorage.mutate(draft => {
    const r = draft.currentRound;
    if (!r || r.phase !== 'voting') return false;
    if (suspectId === myPlayerId || suspectId === r.masterId) return false;
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

function myRole(r) {
  if (r.masterId === myPlayerId) return 'master';
  if (r.insiderId === myPlayerId) return 'insider'; // nur beim Insider selbst vorhanden
  return 'citizen';
}

function roleCardHtml(r) {
  const role = myRole(r);
  let inner;
  if (role === 'master') {
    inner = `<div class="role-name">🎩 Du bist der Master</div>
      <div class="role-word">${renderRichContent(r.secretWord || '')}</div>
      <div class="role-hint">Beantworte die Fragen nur mit „Ja", „Nein" oder „Weiß nicht".</div>`;
  } else if (role === 'insider') {
    inner = `<div class="role-name">🤫 Du bist der INSIDER</div>
      <div class="role-word">${renderRichContent(r.secretWord || '')}</div>
      <div class="role-hint">Hilf unauffällig mit gezielten Fragen – lass dich nicht enttarnen!</div>`;
  } else {
    inner = `<div class="role-name">👥 Du bist Bürger:in</div>
      <div class="role-word">???</div>
      <div class="role-hint">Errate das Geheimwort mit Ja/Nein-Fragen an den Master.</div>`;
  }
  return `<div class="role-card">
    <div class="role-secret" id="role-secret">${inner}</div>
    <button class="btn btn-secondary reveal-btn"
      onpointerdown="revealRole(true)" onpointerup="revealRole(false)"
      onpointerleave="revealRole(false)" oncontextmenu="return false">👁 Gedrückt halten zum Anzeigen</button>
  </div>`;
}

// ── Rendering ────────────────────────────────────────────────────────
const P_RESULT_TEXT = {
  team:    { emoji: '🎉', label: 'Insider enttarnt – Master & Bürger:innen gewinnen!' },
  insider: { emoji: '🕵️', label: 'Insider unentdeckt – der Insider gewinnt allein!' },
  allLose: { emoji: '💀', label: 'Wort nicht erraten – alle verlieren gemeinsam.' }
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
  else if (r.phase === 'questioning') body.innerHTML = renderPQuestioningHtml(state, r);
  else if (r.phase === 'voting') body.innerHTML = renderPVotingHtml(state, r);
  else if (r.phase === 'voteClosed') body.innerHTML = renderPVoteClosedHtml(state, r);
  else if (r.phase === 'resolved') body.innerHTML = renderPResolvedHtml(state, r);
  updateTimerDisplays();
}

function renderPRoleRevealHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">🎭 Deine Rolle</div>
    <div class="round-subtext">Master dieser Runde: <strong>${escHtml(vtPlayerName(state, r.masterId))}</strong></div>
    ${roleCardHtml(r)}
    <div class="round-subtext">Die Lehrkraft startet gleich die Frage-Runde …</div>
  </div>`;
}

function renderPQuestioningHtml(state, r) {
  return `<div class="game-card">
    <div class="round-banner">❓ Frage-Runde läuft</div>
    <div class="timer-remaining big"></div>
    <div class="round-subtext">Stellt ${escHtml(vtPlayerName(state, r.masterId))} eure Ja/Nein-Fragen – mündlich!</div>
    ${roleCardHtml(r)}
  </div>`;
}

function renderPVotingHtml(state, r) {
  const voterIds = (state.players || []).map(p => p.id);
  const { done, total } = vtVoteProgress(r.votes, voterIds);
  const myVote = (r.votes || {})[myPlayerId] || null;
  const candidates = (state.players || []).filter(p =>
    p.id !== myPlayerId && p.id !== r.masterId &&
    (!r.runoffIds || r.runoffIds.includes(p.id)));
  const btns = candidates.map(p =>
    `<button class="vote-btn${myVote === p.id ? ' selected' : ''}" onclick="submitVote('${p.id}')">${escHtml(p.name)}</button>`
  ).join('');
  return `<div class="game-card">
    <div class="round-banner">🗳 ${r.runoffIds ? 'Stichwahl' : 'Abstimmung'}: Wer ist der Insider?</div>
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
    <div class="round-subtext">Die Lehrkraft deckt gleich auf …</div>
  </div>`;
}

function renderPResolvedHtml(state, r) {
  const rt = P_RESULT_TEXT[r.result] || { emoji: '❔', label: '' };
  const wasMe = r.insiderId === myPlayerId;
  return `<div class="game-card">
    <div class="round-banner">${rt.emoji} ${escHtml(rt.label)}</div>
    <div class="resolved-word">${renderRichContent(r.secretWord || '')}</div>
    <div class="round-subtext">Der Insider war: <strong>${escHtml(vtPlayerName(state, r.insiderId))}</strong>${wasMe ? ' – also du! 🤫' : ''}</div>
    <div class="round-subtext">Die Lehrkraft startet die nächste Runde …</div>
  </div>`;
}

function renderPFinishedHtml(state) {
  const res = state.results || {};
  return `<div class="game-card">
    <div class="round-banner">🏁 Spiel beendet</div>
    <div class="results-chips">
      <span class="result-chip">🎉 Team: ${res.team || 0}</span>
      <span class="result-chip">🕵️ Insider: ${res.insider || 0}</span>
      <span class="result-chip">💀 Alle verloren: ${res.allLose || 0}</span>
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
