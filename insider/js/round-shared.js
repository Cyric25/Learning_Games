// round-shared.js – Insider: Timer-Helfer, gemeinsam für Lehrkraft (game.js),
// Schülergerät (play.js) und Tafel (board.js). Reine Funktionen, kein State.
//
// Der Timer wird nie synchron getickt: im Spielstand stehen nur
// timerStartedAt (ISO) + timerSec, jedes Gerät rechnet die Restzeit lokal.

function inTimerRemaining(r) {
  if (!r || !r.timerStartedAt) return null;
  const end = new Date(r.timerStartedAt).getTime() + (r.timerSec || 0) * 1000;
  return Math.ceil((end - Date.now()) / 1000);
}

function inTimerText(rem) {
  if (rem === null) return '–:––';
  if (rem <= 0) return '⏰ Zeit abgelaufen!';
  const m = Math.floor(rem / 60), s = rem % 60;
  return m + ':' + String(s).padStart(2, '0');
}
