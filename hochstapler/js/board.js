// board.js – Hochstapler: Tafelansicht (reine Projektion, keine Eingaben)
// Nutzt denselben HsStorage wie Lehrkraft/Schülergerät, aber mit dem festen
// Viewer-Sentinel '*': der Server verbirgt das Geheimwort einer laufenden
// Runde IMMER (die Tafel wird von der ganzen Klasse inkl. Hochstapler
// gesehen) und liefert impostorIds leer.

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

  HsStorage.setCode(code);
  HsStorage.setViewerId('*');
  const state = await HsStorage.load(code);
  if (!state || !state.meta) { errEl.textContent = 'Spiel nicht gefunden.'; return; }

  boardCode = code;
  document.getElementById('btb-code').textContent = code;
  window.history.replaceState({}, '', 'board.html?code=' + code);
  showBoardScreen('board-main');
  renderBoard(state);
  if (boardSub) boardSub.unsubscribe();
  boardSub = HsStorage.subscribe(code, renderBoard);
}

const B_RESULT_TEXT = {
  honest:   { emoji: '🎉', label: 'Hochstapler enttarnt – die Ehrlichen gewinnen!' },
  impostor: { emoji: '🎭', label: 'Der Hochstapler gewinnt!' }
};

function boardResultsHtml(state) {
  const res = state.results || {};
  return `<div class="results-chips">
    <span class="result-chip">🎉 Ehrliche: ${res.honest || 0}</span>
    <span class="result-chip">🎭 Hochstapler: ${res.impostor || 0}</span>
  </div>`;
}

function speakOrderHtml(state, r) {
  return `<div class="speak-order">${(r.speakOrder || []).map((id, i) =>
    `<span class="speak-chip"><span class="speak-num">${i + 1}</span> ${escHtml(vtPlayerName(state, id))}</span>`
  ).join('')}</div>`;
}

function renderBoard(state) {
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

  if (r.phase === 'roleReveal') {
    el.innerHTML = `<div class="board-banner">🎭 Rollen sind verteilt</div>
      <div class="board-sub">Alle schauen auf ihr Gerät – wer kennt das Wort NICHT?</div>`;
  } else if (r.phase === 'hinting') {
    el.innerHTML = `<div class="board-banner">🗣 Hinweisrunde ${r.hintRound} von ${state.settings.hintRounds}</div>
      <div class="board-sub">Reihum nennt jede Person EIN Hinweiswort:</div>
      ${speakOrderHtml(state, r)}`;
  } else if (r.phase === 'voting') {
    const { done, total } = vtVoteProgress(r.votes, (state.players || []).map(p => p.id));
    el.innerHTML = `<div class="board-banner">🗳 ${r.runoffIds ? 'Stichwahl' : 'Abstimmung'}: Wer ist der Hochstapler?</div>
      <div class="board-sub">${done} von ${total} Stimmen abgegeben</div>`;
  } else if (r.phase === 'voteClosed') {
    el.innerHTML = `<div class="board-banner">🗳 Abstimmung beendet</div>
      <div class="board-sub">${r.votedId
        ? 'Gewählt wurde: <strong>' + escHtml(vtPlayerName(state, r.votedId)) + '</strong>'
        : 'Keine eindeutige Wahl.'} – gleich wird aufgelöst …</div>`;
  } else if (r.phase === 'lastChance') {
    el.innerHTML = `<div class="board-banner">⚡ Letzte Chance!</div>
      <div class="board-sub"><strong>${escHtml(vtPlayerName(state, r.votedId))}</strong> wurde enttarnt und darf jetzt das Geheimwort raten …</div>`;
  } else if (r.phase === 'resolved') {
    const rt = B_RESULT_TEXT[r.result] || { emoji: '❔', label: '' };
    const names = (r.impostorIds || []).map(id => escHtml(vtPlayerName(state, id))).join(' &amp; ');
    el.innerHTML = `<div class="board-banner">${rt.emoji} ${escHtml(rt.label)}</div>
      <div class="board-word">${renderRichContent(r.secretWord || '')}</div>
      <div class="board-sub">Hochstapler: <strong>${names}</strong></div>
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
