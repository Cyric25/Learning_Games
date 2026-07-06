# Lernkarten

Spaced-Repetition-Lernkarten nach dem **SM-2-Algorithmus**. Singleplayer, rein
lokal. Zieht Karten aus **zwei** Quellen: der zentralen Fragendatenbank UND den
Memory-Paaren.

## Datei

`lernkarten/index.html` — Single-File-App (Setup, Lernsession, Abschluss).
Light-Standard (Orange), `body.dark`.

## Funktionsweise

- **Quellen** (`setSource`): Fragen aus `data/questions.json` (→ `buildQCards`)
  oder Memory-Paare aus `data/memory/pairs.json` (→ `buildMemCards`).
- **Kategorieauswahl** hierarchisch (gruppiert nach erstem `›`-Segment),
  standardmäßig **nichts** vorausgewählt.
- **SM-2:** Pro Karte werden Wiederholungsintervall, Easiness-Faktor und
  Fälligkeitsdatum im localStorage geführt. Nutzer bewertet nach dem Umdrehen
  (`rateCard`), das Intervall wird angepasst.
- **Session:** fällige + neue Karten (Anzahl neuer Karten per Slider begrenzt);
  Abschluss-Screen zeigt Statistik und nächste Fälligkeit.

## Wichtige Funktionen

`loadMemoryPairs` / `loadQuestions` · `buildMemCards` / `buildQCards` ·
`buildCatGroups` / `renderCatList` · `getFilteredCards` / `refreshStats` ·
`startSession` · `showCard` / `revealCard` / `rateCard` · `showDoneScreen`.
