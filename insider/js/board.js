// board.js – Insider: Tafelansicht (reine Projektion, keine Eingaben)
// Nutzt denselben InStorage wie Lehrkraft/Schülergerät, aber mit dem festen
// Viewer-Sentinel '*': der Server verbirgt Geheimwort UND Insider-Identität
// einer laufenden Runde IMMER – die Tafel ist für die ganze Klasse sichtbar.
// (Das Lehrergerät ist wegen der Geheimnisse nicht projizierbar; genau dafür
// gibt es diese Ansicht: Timer, Abstimmungsfortschritt, Auflösung.)

let boardCode = null;
let boardSub = null;
let boardState = null;

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showBoardScreen(id) {
  document.querySelectorAll('.board-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function updateTimerDisplays() {
  const rem = inTimerRemaining(boardState?.currentRound);
  document.querySelectorAll('.timer-remaining').forEach(el => {
    el.textContent = inTimerText(rem);
    el.classList.toggle('expired', rem !== null && rem <= 0);
  });
}
setInterval(updateTimerDisplays, 500);

async function boardJoin() {
  const input = document.getElementById('board-code-input');
  const errEl = document.getElementById('board-join-error');
  const code = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  errEl.textContent = '';
  if (code.length < 4) { errEl.textContent = 'Bitte 4-stelligen Code eingeben.'; return; }

  InStorage.setCode(code);
  InStorage.setViewerId('*');
  const state = await InStorage.load(code);
  if (!state || !state.meta) { errEl.textContent = 'Spiel nicht gefunden.'; return; }

  boardCode = code;
  document.getElementById('btb-code').textContent = code;
  window.history.replaceState({}, '', 'board.html?code=' + code);
  showBoardScreen('board-main');
  renderBoard(state);
  if (boardSub) boardSub.unsubscribe();
  boardSub = InStorage.subscribe(code, renderBoard);
}

const B_RESULT_TEXT = {
  team:    { emoji: '🎉', label: 'Insider enttarnt – Master & Bürger:innen gewinnen!' },
  insider: { emoji: '🕵️', label: 'Insider unentdeckt – der Insider gewinnt allein!' },
  allLose: { emoji: '💀', label: 'Wort nicht erraten – alle verlieren gemeinsam.' }
};

function boardResultsHtml(state) {
  const res = state.results || {};
  return `<div class="results-chips">
    <span class="result-chip">🎉 Team: ${res.team || 0}</span>
    <span class="result-chip">🕵️ Insider: ${res.insider || 0}</span>
    <span class="result-chip">💀 Alle verloren: ${res.allLose || 0}</span>
  </div>`;
}

function renderBoard(state) {
  boardState = state;
  document.getElementById('btb-round').textContent =
    'Runde ' + (state.roundsPlayed + (state.currentRound ? 1 : 0) || 1) + ' · ' + state.roundsPlayed + ' gespielt';

  const el = document.getElementById('board-content');
  if (state.phase === 'lobby') {
    el.innerHTML = `<div class="board-banner">🕓 Warteraum</div>
      <div class="board-sub">${(state.players || []).length} Spieler:in(nen) beigetreten</div>`;
    return;
  }
  if (state.phase === 'finished') {
    el.innerHTML = `<div class="board-banner">🏁 Spiel beendet</div>${boardResultsHtml(state)}`;
    return;
  }

  const r = state.currentRound;
  if (!r) {
    el.innerHTML = `<div class="board-banner">Bereit für die nächste Runde</div>`;
    return;
  }
  const masterName = vtPlayerName(state, r.masterId);

  if (r.phase === 'roleReveal') {
    el.innerHTML = `<div class="board-banner">🎭 Rollen sind verteilt</div>
      <div class="board-sub">Master dieser Runde: <strong>${escHtml(masterName)}</strong><br>Alle schauen auf ihr Gerät!</div>`;
  } else if (r.phase === 'questioning') {
    el.innerHTML = `<div class="board-banner">❓ Frage-Runde</div>
      <div class="timer-remaining board-timer"></div>
      <div class="board-sub">Stellt <strong>${escHtml(masterName)}</strong> eure Ja/Nein-Fragen!</div>`;
    updateTimerDisplays();
  } else if (r.phase === 'voting') {
    const { done, total } = vtVoteProgress(r.votes, (state.players || []).map(p => p.id));
    el.innerHTML = `<div class="board-banner">🗳 ${r.runoffIds ? 'Stichwahl' : 'Abstimmung'}: Wer ist der Insider?</div>
      <div class="board-sub">${done} von ${total} Stimmen abgegeben</div>`;
  } else if (r.phase === 'voteClosed') {
    el.innerHTML = `<div class="board-banner">🗳 Abstimmung beendet</div>
      <div class="board-sub">${r.votedId
        ? 'Gewählt wurde: <strong>' + escHtml(vtPlayerName(state, r.votedId)) + '</strong>'
        : 'Keine eindeutige Wahl.'} – gleich wird aufgedeckt …</div>`;
  } else if (r.phase === 'resolved') {
    const rt = B_RESULT_TEXT[r.result] || { emoji: '❔', label: '' };
    el.innerHTML = `<div class="board-banner">${rt.emoji} ${escHtml(rt.label)}</div>
      <div class="board-word">${escHtml(r.secretWord || '')}</div>
      <div class="board-sub">Der Insider war: <strong>${escHtml(vtPlayerName(state, r.insiderId))}</strong></div>
      ${boardResultsHtml(state)}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) {
    const input = document.getElementById('board-code-input');
    if (input) input.value = urlCode.toUpperCase();
    boardJoin();
  }
});
