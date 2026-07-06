# QuizPfad

Lineares Brettspiel: Teams rücken durch richtige Antworten auf einem
Mäander-Pfad vor (Schlangenlayout). Nutzt die zentrale Fragendatenbank.

## Dateien

| Datei | Rolle |
|-------|-------|
| `quizpfad/index.html` | Lehrergerät (Spielwähler, Setup, Brett, Fragen) |
| `quizpfad/js/quizpfad.js` | Spiellogik + `QpStorage` |
| `quizpfad/view.html` | Schülergerät (Team wählen, MC beantworten) |
| `quizpfad/board.html` | Tafelansicht (Beamer, reine Anzeige) |
| `quizpfad/admin.html` | Verweis auf `../admin.html` |
| `quizpfad/css/quizpfad.css` | Styles (Light-Standard „Brettspiel", `body.dark`) |

`QpStorage` ist in `quizpfad.js`, `view.html` und `board.html` **dupliziert** —
Änderungen daran in allen drei Kopien vornehmen (Prefix `qp-`, LS `qp_gs_`).

## Ablauf

1. Spielwähler/Join, Setup (Teamanzahl, Kategorien).
2. Brett aus 30 Feldern im Schlangenlayout. Fragen liefern Felder-Vorschub.
3. Die Lehrkraft wählt pro Zug die Schwierigkeit (`renderDifficultyPicker` →
   `teacherPicksDifficulty`); die zugehörige Frage öffnet sich.
4. MC wird vom Schülergerät ausgewertet (`submitAnswer`/`submitMultiAnswer`),
   offene Fragen von der Lehrkraft.
5. **Bonusfelder** verändern den Zug.

## Bonusfelder

| Typ | Effekt |
|-----|--------|
| `advance` | +2 Felder vor |
| `setback` | −2 Felder zurück |
| `extra` | sofort nochmal dran |
| `joker` | Frage überspringen (1× pro Spiel) |
| `duel` | Teamduell: gleiche Frage, schneller gewinnt |

## Konvertierung

`convertRQtoQuizPfad(rqData)` → flache Blatt-Kategorien mit True-Leaf-Regel,
`kategorie` = Blatt-ID. Standard-Difficulty-Mapping.

## Besonderheiten / behobene Fallstricke

- **Multi-Correct in `view.html`:** Es gibt Toggle-Auswahl + Bestätigen-Button,
  damit Fragen mit ≥2 richtigen Indizes beantwortbar sind (früher wurde jede
  Antwort als falsch gewertet).
- **Deadlock bei Lehrkraft-Reload:** `_gsEnter` schließt eine bereits beantwortete
  `liveQuestion` beim Wiedereinstieg ab; `applyRemoteAnswer` läuft unabhängig von
  der Modal-Sichtbarkeit (sonst fror das Spiel ein).
- **Lost-Update-Schutz:** Schüler-Antworten laden vor dem Speichern frisch
  (`saveAnswer`), Beitritt/Kick über `QpStorage.mutate` (CAS).
- **Sieger-Ermittlung:** Der Index-`reduce` vergleicht direkt gegen
  `teams[best].position` (nicht gegen `-1` bei falsy Index 0).
- **Duell sichtbar:** `startDuel` publiziert das Duell als `qpLiveQ` mit
  `isDuel:true` (teamIdx −1 = read-only) und speichert sofort, damit Schüler-/
  Tafelansicht es sehen und die Frage nicht bei Reload verloren geht.
- **Board.html Setup-Phase** zeigt einen Wartehinweis statt einer leeren Seite.
- **XSS:** `color` wird bei der Deserialisierung geklemmt, `esc()` überall auf
  Namen/Fragetexte in `view.html`/`board.html`.

## Wichtige Funktionen (`js/quizpfad.js`)

`_gsEnter` · `startSSESubscription` / `applyRemoteAnswer` · `convertRQtoQuizPfad` ·
`renderCategorySelector` · `generateBoard` · `renderBoard` ·
`renderDifficultyPicker` / `teacherPicksDifficulty` · `showQuestionModal` ·
`resolveQuestion` / `continueAfterQuestion` · `moveTeam` · `startDuel` ·
`nextTurn` · `kickTeam` · `showWinner`.
