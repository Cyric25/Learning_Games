// board.js – Just One: Tafelansicht (reine Projektion, keine Eingaben)
// Nutzt denselben JoStorage wie Lehrkraft/Schülergerät, aber mit dem festen
// Viewer-Sentinel '*': der Server behandelt die Tafel wie die Rater:in und
// verbirgt das Geheimwort einer laufenden Runde IMMER – die Tafel ist für
// die ganze Klasse inkl. der aktuellen Rater:in sichtbar.

let boardCode = null;
let boardSub = null;

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function showBoardScreen(id) {
  document.querySelectorAll('.board-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

async function boardJoin() {
  const input = document.getElementById('board-code-input');
  const errEl = document.getElementById('board-join-error');
  const code = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  errEl.textContent = '';
  if (code.length < 4) { errEl.textContent = 'Bitte 4-stelligen Code eingeben.'; return; }

  JoStorage.setCode(code);
  JoStorage.setViewerId('*');
  const state = await JoStorage.load(code);
  if (!state || !state.meta) { errEl.textContent = 'Spiel nicht gefunden.'; return; }

  boardCode = code;
  document.getElementById('btb-code').textContent = code;
  window.history.replaceState({}, '', 'board.html?code=' + code);
  showBoardScreen('board-main');
  renderBoard(state);
  if (boardSub) boardSub.unsubscribe();
  boardSub = JoStorage.subscribe(code, renderBoard);
}

function renderBoard(state) {
  const roundNum = state.roundsPlayed + (state.currentRound ? 1 : 0);
  document.getElementById('btb-round').textContent =
    (state.settings ? 'Runde ' + Math.min(roundNum, state.settings.targetRounds) + ' von ' + state.settings.targetRounds : '') +
    ' · ' + state.correctCount + ' richtig';

  const el = document.getElementById('board-content');
  if (state.phase === 'lobby') {
    el.innerHTML = `<div class="board-banner">🕓 Warteraum</div>
      <div class="board-sub">${(state.players || []).length} Spieler:in(nen) beigetreten</div>`;
    return;
  }
  if (state.phase === 'finished') {
    const total = state.roundsPlayed || 0;
    const pct = total > 0 ? Math.round((state.correctCount / total) * 100) : 0;
    const rating = joRatingText(state.correctCount, total);
    el.innerHTML = `<div class="board-banner">🏁 Spiel beendet</div>
      <div class="finish-score">${state.correctCount} / ${total}</div>
      <div class="finish-bar-wrap"><div class="finish-bar" style="width:${pct}%"></div></div>
      <div class="finish-rating"><span class="emoji">${rating.emoji}</span>${escHtml(rating.label)}</div>`;
    return;
  }

  const r = state.currentRound;
  if (!r) {
    el.innerHTML = `<div class="board-banner">Bereit für die nächste Runde</div>`;
    return;
  }
  const guesserName = joPlayerName(state, r.guesserId);

  if (r.phase === 'collecting') {
    const expected = joExpectedClueCount(state);
    const submitted = Object.keys(r.clues || {}).length;
    el.innerHTML = `<div class="board-banner">🙈 ${escHtml(guesserName)} rät diese Runde</div>
      <div class="board-sub">${submitted} von ${expected} Hinweisen abgegeben</div>`;
  } else if (r.phase === 'review') {
    el.innerHTML = `<div class="board-banner">🔍 Hinweise werden geprüft</div>
      <div class="board-sub">Die Lehrkraft sortiert ungültige Hinweise aus …</div>`;
  } else if (r.phase === 'revealed') {
    const chips = joSurvivingClueTexts(r).map(w => `<span class="board-reveal-chip">${escHtml(w)}</span>`).join('');
    el.innerHTML = `<div class="board-banner">🙈 ${escHtml(guesserName)} darf raten</div>
      <div class="board-reveal-list">${chips || '<span class="board-sub">Keine gültigen Hinweise übrig.</span>'}</div>`;
  } else if (r.phase === 'resolved') {
    el.innerHTML = `<div class="board-banner">${r.result ? '✅ Richtig!' : '❌ Leider falsch'}</div>
      <div class="board-word">${renderRichContent(r.secretWord)}</div>
      <div class="board-sub">Stand: ${state.correctCount} von ${state.roundsPlayed} Runden</div>`;
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
