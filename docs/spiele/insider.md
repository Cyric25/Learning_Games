# Insider

Deduktionsspiel nach dem Brettspiel-Original (Oink Games), für die Klasse
adaptiert: Pro Runde kennt der **Master** das Geheimwort und beantwortet
mündliche Ja/Nein-Fragen der **Bürger:innen** („Ja" / „Nein" / „Weiß nicht").
Ein heimlicher **Insider** kennt das Wort ebenfalls und hilft unauffällig mit.
Wird das Wort innerhalb des Zeitlimits nicht erraten → alle verlieren. Wird es
erraten → mündliche Diskussion + **digitale Abstimmung**: Wer war der Insider?
Mehrheitlich enttarnt → Master + Bürger:innen gewinnen; unentdeckt → der
Insider gewinnt allein.

**Klassen-Adaption:** Fragen und Diskussion laufen mündlich im Raum. Digital
sind nur Beitritt, Rollen-/Wortanzeige, Timer, Rundensteuerung durch die
Lehrkraft und die Abstimmung auf den Schülergeräten.

## Dateien

| Datei | Rolle |
|-------|-------|
| `insider/index.html` | Lehrkraft: Spielwähler, Setup (Timer), Kategorien, Warteraum, Rundenmoderation |
| `insider/view.html` | Schülergerät: Beitritt, Rollenkarte (gedrückt halten zum Anzeigen), Timer, Abstimmung |
| `insider/board.html` | Tafelansicht (Viewer-Sentinel `'*'`): Timer, Abstimmungsfortschritt, Auflösung — das Lehrergerät ist wegen der Geheimnisse nicht projizierbar |
| `insider/admin.html` | Reiner Verweis auf `just-one/admin.html` (Begriffs-Editor) |
| `insider/js/shared.js` | `InStorage` — **dokumentiertes Duplikat** von `just-one/js/shared.js` (`JoStorage`); Prefixe `in-`/`in_gs_`, `_sanitizeState` klemmt `votes` statt `clues` |
| `insider/js/round-shared.js` | Timer-Helfer (`inTimerRemaining`/`inTimerText`), geteilt von game/play/board |
| `insider/js/vote-shared.js` | Abstimmungs-Helfer (`vtTally`, `vtLeaders`, `vtAllVoted`, `vtCloseVote`, `vtPlayerName`) — **auch von Hochstapler eingebunden** (`../insider/js/vote-shared.js`) |
| `insider/js/game.js` | Lehrkraft-Logik; Kategorie-UI ist ein dokumentiertes Duplikat aus `just-one/js/game.js` |
| `insider/js/play.js` | Schülergerät-Logik (Beitritt, Kick-Erkennung, Rollenkarte, Stimmabgabe) |
| `insider/js/board.js` | Tafel-Rendering |
| `insider/css/insider.css` | Alle Styles; Basis-/gs-/Setup-Blöcke dupliziert aus `just-one/css/*` |
| `data/games/insider/` | Pro-Code Spielstände + `index.json` Registry (Prefix `in-` in `api.php`) |

## Begriffsquelle: Just-One-Begriffs-DB (kein eigener Editor)

Insider zieht seine Geheimwörter aus `data/just-one/wordlists.json` über die
unverändert per `<script src="../just-one/js/wordlist-shared.js">` eingebundenen
`JoWordlistStorage`/`JoWordlistModel` (Pool, Ziehen, Wiederholungsschutz über
`usedWordIds`). Gepflegt werden die Begriffe ausschließlich in
`just-one/admin.html`; `insider/admin.html` ist nur ein Verweis.

## Viewer-gefilterter State + Geheimfeld-Schutz

Wie Just One liefert der Server den Zustand **pro Betrachter** unterschiedlich
aus (`filterInsiderState()` in `api.php`, `?playerId=…`), solange die Runde
nicht `resolved` ist:

| Viewer | `secretWord` | `insiderId` |
|--------|:---:|:---:|
| Lehrkraft (kein `playerId`) | ✔ | ✔ |
| Master | ✔ | – |
| Insider | ✔ | ✔ (die eigene) |
| Bürger:in | – | – |
| Tafel (`'*'`) | – | – |

**Neu gegenüber Just One — Geheimfeld-Schutz beim Schreiben:** Bei Just One
schreibt die gefilterte Person (Rater:in) während einer Runde nie den State.
Hier stimmen gefilterte Viewer aber per `mutate()` (CAS) ab — ihr POST-Body
enthält `secretWord`/`insiderId` nicht. `protectSecretRoundFields()` in
`api.php` (analog zum `takenTeams`-Merge, per `$gameProtectedFields`-Map)
stellt die Geheimfelder aus dem gespeicherten Stand wieder her — aber nur
innerhalb **derselben Runde** (`currentRound.num`-Vergleich), damit beim
Rundenwechsel nichts Altes wiederaufersteht. Deshalb trägt jede Runde
verpflichtend eine `num`.

## Rundenablauf (State Machine)

`currentRound.phase`: `roleReveal` → `questioning` → `voting` →
`voteClosed` → `resolved`

1. **roleReveal** — Lehrkraft zieht Begriff; Master rotiert über
   `turnOrder[currentTurnIdx]` (wie Just-One-Rater-Rotation), Insider wird
   zufällig aus den übrigen gelost (der Master ist nie Insider). Rollenkarte
   auf dem Schülergerät hinter „Gedrückt halten zum Anzeigen" (CSS-Blur).
2. **questioning** — `timerStartedAt` (ISO) + `timerSec` im State, jedes Gerät
   rechnet die Restzeit lokal (kein synchrones Ticken). Lehrkraft beendet mit
   „Wort erraten → Abstimmung" oder „Nicht erraten" (→ `resolved`,
   `result:'allLose'`).
3. **voting** — Diskussion mündlich; Stimmen (`votes[voterId] = suspectId`,
   Dictionary → `{}`→`[]`-Klemmung in `_sanitizeState`!) per `mutate()`. Alle
   stimmen ab (auch Master und Insider); wählbar sind alle außer sich selbst
   und dem Master. Die **letzte** Stimme schließt die Abstimmung im selben
   `mutate()` (`vtCloseVote`): eindeutige Mehrheit → `voteClosed`; Gleichstand
   → einmalige **Stichwahl** (`runoffIds`, Stimmen geleert); erneuter
   Gleichstand → `voteClosed` mit `votedId:null` (niemand enttarnt). Lehrkraft
   kann per „Abstimmung schließen" (ebenfalls `mutate()`) vorzeitig schließen.
4. **voteClosed → resolved** — Aufdecken nur durch die Lehrkraft
   („Ergebnis aufdecken", Force-Write): nur ihr Gerät kennt `insiderId`.
   `result`: `'team'` (Insider enttarnt) / `'insider'` / `'allLose'`.
   Ab `resolved` filtert der Server nicht mehr — Wort und Insider werden für
   alle aufgedeckt.

Kein festes Rundenziel: Lehrkraft beendet mit „Spiel beenden"
(Ergebniszähler `results: {team, insider, allLose}` + `roundHistory`).
Mindestens **4** Spieler:innen (Master + Insider + 2 Bürger:innen).
Kick von Master/Insider bricht die laufende Runde ab (`currentRound=null`);
Späteinsteiger:innen kommen ans Ende der Master-Rotation.

## Theme

Standard-Palette Orange (Light) / Dunkelblau (`body.dark`), kein
spielspezifisches Theme.
