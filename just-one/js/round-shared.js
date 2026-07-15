// round-shared.js – Rundenlogik-Helfer, gemeinsam für Lehrkraft (game.js) und
// Schülergerät (play.js). Reine Funktionen, kein State.
//
// Rundenphasen: collecting → review → revealed → resolved
// (Sicherheits-Hinweis: das Geheimwort wird erst in einer späteren
// Ausbaustufe serverseitig vor der Rater:in verborgen – siehe CLAUDE.md /
// Projekt-Plan "Viewer-gefilterter State".)

function joNormalizeClue(s) {
  return String(s || '').trim().toLowerCase();
}

// Liefert die playerIds, deren Hinweis mit mindestens einem anderen
// übereinstimmt (exakt, getrimmt, case-insensitive – keine Fuzzy-Erkennung
// für Plural/Genus, das übernimmt bewusst die Lehrkraft manuell).
function joComputeDuplicateStrikes(clues) {
  const counts = {};
  for (const pid in clues) {
    const n = joNormalizeClue(clues[pid]);
    if (!n) continue;
    counts[n] = (counts[n] || 0) + 1;
  }
  const struck = [];
  for (const pid in clues) {
    const n = joNormalizeClue(clues[pid]);
    if (n && counts[n] > 1) struck.push(pid);
  }
  return struck;
}

function joPlayerName(state, playerId) {
  const p = (state.players || []).find(p => p.id === playerId);
  return p ? p.name : '(entfernt)';
}

// Anzahl erwarteter Hinweise: alle Spieler:innen außer der Rater:in.
function joExpectedClueCount(state) {
  return Math.max(0, (state.players || []).length - 1);
}

function joSurvivingClueTexts(round) {
  const struck = new Set(round.struckIds || []);
  return Object.keys(round.clues || {})
    .filter(pid => !struck.has(pid))
    .map(pid => round.clues[pid]);
}

// Eigene, kurze Bewertungsskala nach Trefferquote fürs Spielende (bewusst
// eigener Text, nicht die Skala aus der Spielschachtel).
function joRatingText(correct, total) {
  if (total <= 0) return { emoji: '🤷', label: 'Keine Runde gespielt.' };
  const pct = correct / total;
  if (pct >= 0.9) return { emoji: '🧠', label: 'Telepathisch! Bessere Teamarbeit geht kaum.' };
  if (pct >= 0.7) return { emoji: '🎉', label: 'Klasse gespielt!' };
  if (pct >= 0.5) return { emoji: '👍', label: 'Solide Teamleistung.' };
  if (pct >= 0.3) return { emoji: '🙂', label: 'Ausbaufähig – beim nächsten Mal mehr Absprache!' };
  return { emoji: '😅', label: 'Puh, das war knifflig – nächstes Mal wird’s besser!' };
}
