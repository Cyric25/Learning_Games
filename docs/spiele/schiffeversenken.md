# Schiffeversenken-Quiz

Schiffe versenken für die Klasse: Teams beschießen ein 10×10-Gitter; ein Treffer
setzt eine richtig beantwortete Frage voraus. Wer alle gegnerischen Schiffe
versenkt bzw. als Letztes übrig bleibt, gewinnt.

## Dateien

| Datei | Rolle |
|-------|-------|
| `schiffeversenken/index.html` | Spielleiter (Setup, Alle-Schiffe-Grid, Fragen) — Logik inline |
| `schiffeversenken/view.html` | Spielergerät (schießen, MC beantworten) — Logik inline |
| `schiffeversenken/board.html` | Tafelansicht |
| `schiffeversenken/solo.html` | Einzelspieler gegen KI-Gegner (rein lokal) |
| `schiffeversenken/js/shared.js` | `BsStorage` (Prefix `bs-`, LS `bs_gs_`) |
| `schiffeversenken/css/game.css` | Styles (Dark-Standard, `body.light`) |

`BsStorage` liegt **einmal** in `js/shared.js` und wird von index/view/board
gemeinsam genutzt — im Gegensatz zu den anderen Spielen keine Duplikate.

## Schnelles Client-Sync-Muster

Schiffeversenken verarbeitet MC-Antworten **lokal auf dem Schülergerät** und
speichert den Endzustand direkt, statt über einen Lehrergerät-Round-Trip zu
gehen. Das halbiert die Latenz. Der Poll-Fallback läuft mit 300–500 ms.
Kernfunktion: `submitMCAnswer` (view.html) ruft `applyShot`/`advanceTurn` lokal
und speichert fire-and-forget. Offene Fragen laufen weiterhin über die Lehrkraft.

## Fragenauswahl mit Kategorie-Cycling

`selectQuestionWithCycling` rotiert Ober- und Unterkategorien im Round-Robin
(`questionCycleState: { topIdx, subByTop }` im GameState), damit die Fragen
gleichmäßig aus allen gewählten Kategorien kommen. `flattenQuestions` nutzt die
True-Leaf-Regel.

## Sync-Besonderheiten (behobene Fallstricke)

- **`fireShot` setzt `_shownLqId`:** sonst baut das SSE-Echo des eigenen Saves
  Overlay + MC-Timer neu auf (Timer springt zurück, Buttons unter dem Finger weg).
- **`onRemoteUpdate`-Guard:** die Zuweisung an `remoteState` steht hinter dem
  `submittingShot`-Guard, damit ein verspäteter Poll den lokal fortgeschriebenen
  Stand nicht überschreibt.
- **Team-Beitritt/Kick via `BsStorage.mutate`** (CAS); Kick lädt frisch.
- **`confirmEndGame`** awaitet den Save, bevor `resetToSelector` den Code auf
  null setzt (sonst POST gegen `code=null`, Schüler hängen im Spiel).
- **Frage-Abbrechen:** Das Turn-Banner hat einen „✕ Frage abbrechen"-Button
  (`abortLiveQuestion`) — nötig, falls ein Schülergerät mit offener MC-Frage
  abstürzt; lädt vor dem Abbruch frisch (kein doppelter `advanceTurn`).
- **Join-Subscription:** wer vor Spielstart beitritt, abonniert sofort (sieht
  belegte Teams + Spielstart). Nach Kick wird neu abonniert, der MC-Timer gestoppt.
- **`checkServer`-TTL:** ein einzelner Timeout schaltet das Gerät nicht dauerhaft
  offline (negatives Ergebnis nur 15 s gecacht).
- **SSE-Rückkehr:** nach SSE-Fehler wird nach ~10 s erneut SSE versucht.
- **Solo:** `startSolo` setzt den Code auf null und speichert nicht auf den
  Server (sonst Müll-Spiel unter fremdem Code).
- **XSS:** `color`/`emoji` bei der Deserialisierung geklemmt.

## Wichtige Funktionen (`index.html` inline)

`flattenQuestions` / `buildCategoryUI` · `placeShipsForAllTeams` · `startGame` ·
`renderSLGrid` (alle Schiffe sichtbar) · `renderTurnBanner` · `processShot`
(**Kernlogik: Schuss, Treffer, Versenkung, Sieg**) · `abortLiveQuestion` ·
`kickTeam` · `confirmEndGame`.
`view.html` inline: `selectQuestionWithCycling` · `fireShot` · `submitMCAnswer` /
`handleMCTimeout` · `advanceTurn` · `handleKicked`.
