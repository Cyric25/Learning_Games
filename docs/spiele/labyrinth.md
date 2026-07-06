# Labyrinth-Quiz

Canvas-basiertes Labyrinth: 2–6 Teams navigieren ein 16×16-Labyrinth, sammeln
Symbole ein und öffnen Türen durch richtige Antworten. Ziel: mit allen Symbolen
das Ziel erreichen.

## Dateien

| Datei | Rolle |
|-------|-------|
| `Labyrint-Quiz/index.html` | Lehrergerät (Setup, Canvas-Board, Fragen-Bewertung) |
| `Labyrint-Quiz/js/labyrinth.js` | Lehrer-Spiellogik + `GameSync` |
| `Labyrint-Quiz/js/play.js` | Schülergerät (`play.html`) + eigenes `GameSync` |
| `Labyrint-Quiz/js/maze.js` | `SeededRNG` + `MazeGenerator` (Recursive Backtracker) |
| `Labyrint-Quiz/js/renderer.js` | `MazeRenderer` (Canvas: Labyrinth, Figuren, Animationen) |
| `Labyrint-Quiz/board.html` | Tafelansicht |
| `Labyrint-Quiz/solo.html` | Einzelspieler (rein lokal, Stoppuhr + Highscores) |
| `Labyrint-Quiz/designer.html` | Labyrinth-Editor (Wände/Türen setzen) |
| `Labyrint-Quiz/admin.html` | Verweis auf `../admin.html` |

**Ordnername** ist `Labyrint-Quiz` (ohne „h"). `GameSync` (Prefix `labyrinth-`,
LS `lab_`) ist in `play.js`, `labyrinth.js` und `board.html` dupliziert.

## Besonderheit: Labyrinth wird nicht gespeichert, sondern rekonstruiert

Der Spielstand enthält nur `seed` + `config`; das eigentliche Grid wird auf jedem
Gerät aus dem Seed neu erzeugt (`buildLocalGrid`). Das hält die Spielstände klein.

## Spielmechanik & Punkte

| Aktion | Punkte |
|--------|--------|
| Symbol eingesammelt (richtig) | +10 |
| Tür geöffnet (richtig) | 0 |
| Ziel + alle Symbole | +50 Bonus |
| Falsche Antwort | 0 |

Exklusiver Team-Beitritt über `takenTeams` (Referenz-Implementierung des Musters,
siehe `CLAUDE.md → ## Exklusiver Team-Beitritt`).

## Sync-Besonderheiten (behobene Fallstricke)

- **`_rev`-Echo-Filter:** `postState` übernimmt `_lastStateRev` erst aus der
  **bestätigten** Server-Antwort (nicht optimistisch vorab) — sonst würde ein
  fehlgeschlagener POST alle folgenden Fremd-Updates als „veraltet" verwerfen.
  Veraltete Echos werden komplett ignoriert (nicht mehr aufs Canvas gerendert).
- **Kick-Härtung:** `handleKicked` stoppt laufende Würfelanimation (`diceAnimId`)
  und Timer; `postState` bricht bei `myTeamId===null` ab; nach Kick wird die
  Teamauswahl neu abonniert.
- **Renderer-Leak:** `MazeRenderer.destroy()` meldet den Resize-Listener ab; vor
  jeder Neuanlage eines Renderers (index/play/board/solo) aufgerufen — sonst
  zeichneten alte Renderer beim Fensterresize ihren alten Zustand.
- **XSS:** `color`/`emoji`/`symbolIcon` bei der Deserialisierung (`_san`) geklemmt.
- **Board-Poll (board.html):** Change-Detection + 1000 ms Intervall (statt
  400 ms ohne Vergleich).

## Wichtige Funktionen

`labyrinth.js`: `convertRQtoLabyrinth` · `buildSetupUI` · `placeTeamSymbols` ·
`applyRemoteState` · `showTeacherEvalModal` / `resolveOpenQuestion` ·
`renderBoard` · `kickTeam` · `showResult`.
`play.js`: `buildLocalGrid` · `onRemoteUpdate` · `rollDice` /
`chooseDirection` · `showQuestionModal` · `resolveQuestionResult` · `postState` ·
`handleKicked`.
`maze.js`: `MazeGenerator.generate` / `addExtraConnections`.
`renderer.js`: `MazeRenderer.render` / `animateMove` / `animateDoorAlpha` /
`destroy`.
