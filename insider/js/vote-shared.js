// vote-shared.js – Abstimmungs-Helfer, gemeinsam für Insider UND Hochstapler
// (hochstapler/ bindet diese Datei per ../insider/js/vote-shared.js ein,
// analog zum Cross-Include von just-one/js/wordlist-shared.js).
// Reine Funktionen, kein State.
//
// votes ist ein Dictionary { voterId: suspectId }. Die Schließ-Logik läuft
// im mutate() der letzten abstimmenden Person bzw. beim "Abstimmung
// schließen" der Lehrkraft — beides braucht nur die (unfilterten) votes,
// nie die Geheimfelder der Runde.

function vtTally(votes) {
  const counts = {};
  let total = 0;
  for (const voterId in (votes || {})) {
    const s = votes[voterId];
    if (!s) continue;
    counts[s] = (counts[s] || 0) + 1;
    total += 1;
  }
  return { counts, total };
}

// suspectIds mit den meisten Stimmen (leer, wenn keine Stimmen abgegeben).
function vtLeaders(votes) {
  const { counts } = vtTally(votes);
  let max = 0;
  for (const id in counts) max = Math.max(max, counts[id]);
  if (max === 0) return [];
  return Object.keys(counts).filter(id => counts[id] === max);
}

function vtAllVoted(votes, voterIds) {
  return (voterIds || []).length > 0 && voterIds.every(id => (votes || {})[id]);
}

function vtVoteProgress(votes, voterIds) {
  const done = (voterIds || []).filter(id => (votes || {})[id]).length;
  return { done, total: (voterIds || []).length };
}

// Abstimmung schließen (wird auf einem round-Draft aufgerufen):
// - eindeutige Mehrheit → votedId gesetzt, phase 'voteClosed'
// - Gleichstand beim ersten Mal → Stichwahl: runoffIds gesetzt, Stimmen
//   geleert, Phase bleibt 'voting'
// - erneuter Gleichstand oder gar keine Stimmen → votedId null (niemand
//   enttarnt), phase 'voteClosed'
function vtCloseVote(round) {
  const leaders = vtLeaders(round.votes);
  if (leaders.length === 1) {
    round.votedId = leaders[0];
    round.phase = 'voteClosed';
    return;
  }
  if (leaders.length > 1 && !round.runoffIds) {
    round.runoffIds = leaders;
    round.votes = {};
    return; // Stichwahl, Phase bleibt 'voting'
  }
  round.votedId = null;
  round.phase = 'voteClosed';
}

function vtPlayerName(state, playerId) {
  const p = (state.players || []).find(p => p.id === playerId);
  return p ? p.name : '(entfernt)';
}
