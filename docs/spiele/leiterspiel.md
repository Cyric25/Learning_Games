# Leiterspiel-Quiz (Snakes & Ladders)

Klassisches Leiterspiel mit 100 Feldern (10×10). Teams würfeln, beantworten
Fragen und rücken vor; Leitern führen hoch, Schlangen runter. Custom-Bretter aus
dem Designer werden unterstützt.

## Dateien

| Datei | Rolle |
|-------|-------|
| `Leiterspiel-quiz/index.html` | Lehrergerät (Setup, Brett, Würfel, Fragen) |
| `Leiterspiel-quiz/js/leiterspiel.js` | Spiellogik + `LsStorage` |
| `Leiterspiel-quiz/view.html` | Schülergerät (Team wählen, würfeln, MC) |
| `Leiterspiel-quiz/solo.html` | Einzelspieler (rein lokal, Highscores) |
| `Leiterspiel-quiz/designer.html` | Brett-Designer (Polygon-Felder, Leitern/Schlangen) |
| `Leiterspiel-quiz/admin.html` | Verweis auf `../admin.html` |

`LsStorage` ist in `leiterspiel.js` und `view.html` dupliziert (Prefix `ls-`,
LS `ls_gs_`).

## Standard-Brett

- 5 Leitern: 4→14, 9→31, 21→42, 28→84, 51→67
- 5 Schlangen: 16→6, 47→26, 62→19, 93→73, 98→87
- Zeitlimits: leicht 30 s, mittel 45 s, schwer 60 s · Punkte: 10/20/30
- Bonusfelder: `roll_again`, `free_move`, `swap` (ein pro Zeile)

## Custom-Bretter

`designer.html` speichert Bretter in `data/leiterspiel-designer/boards.json`
(+ localStorage `ls_custom_boards`). Im Setup wählbar; `gameState.customBoardId`
wird gespeichert. Custom-Bretter können ≠100 Felder haben — die Feldanzahl kommt
aus `getFieldCount()` (bzw. `gs.board.length-1`), nicht aus hartkodierten 100.
Gerendert werden sie als SVG (`renderCustomBoardSVG`), das Standardbrett als Grid.

## Ablauf & Sync

1. Spielwähler, Setup (Teams, Modus, Kategorien), Würfel-Reihenfolge (`dice-order`).
2. Schüler würfelt → `liveQuestion` wird gesetzt → auf dem Lehrergerät öffnet sich
   das Frage-Modal. MC wertet das Schülergerät aus (`doSelectMcAnswer`), bewegt
   die Figur und schaltet den Zug weiter.
3. Der Lehrer-`onSSEUpdate` reagiert auf `phase='finished'` (Schüler-Sieg) und
   überschreibt ihn nicht mehr durch einen lokalen Timer-Ablauf.

## Besonderheiten / behobene Fallstricke

- **Schüler-Sieg:** `onSSEUpdate` behandelt `phase==='finished'` explizit (Modal
  schließen, Timer stoppen, Sieger anzeigen) — sonst machte der lokale Timer den
  Sieg rückgängig.
- **Doppel-Auswertung:** `resolveQuestion` lädt bei per SSE empfangenen Fragen
  frisch und bricht ab, wenn das Schülergerät bereits ausgewertet hat.
- **`freeMove`/Custom-Boards:** alle Sieg-Checks nutzen `getFieldCount()`.
- **Dice-Button nach Reload:** `_gsEnter` stellt bei laufender Frage das Modal
  wieder her bzw. gibt sonst den Würfel frei.
- **Schüleransicht (`view.html`):** eigener `convertRQ` mit True-Leaf-Regel und
  Kategoriefilter (`pickQuestion` respektiert `activeCategoryIds`); Board wird bei
  Spielwechsel über eine Board-Signatur neu aufgebaut; Custom-Boards ≠100 Felder
  werden dynamisch gerendert; Frage-Overlay wird bei remote Spielende geschlossen.
- **XSS:** `emoji` bei der Deserialisierung geklemmt, Team-/Kategorienamen escaped.
- **Deadlock-Schutz:** liefert `pickQuestion()` null, wird der Würfel wieder
  freigegeben statt still hängenzubleiben.

## Wichtige Funktionen (`js/leiterspiel.js`)

`convertRQtoLeiterspiel` · `generateBoard` / `getFieldCount` ·
`renderBoard` / `renderCustomBoardSVG` / `drawLaddersAndSnakes` · `rollDice` ·
`askQuestion` · `resolveQuestion` · `moveTeam` / `freeMove` · `showBonusModal` ·
`nextTurn` · `showWinner` · `onSSEUpdate` · `_gsEnter`.
