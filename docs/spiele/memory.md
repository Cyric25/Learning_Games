# Memory

Singleplayer-Spiel: Paare finden (Text, Formeln, Bilder). Eigene Paar-Datenbank,
**nicht** die zentrale Fragendatenbank (andere Datenstruktur: Paare statt Fragen).

## Dateien

| Datei | Rolle |
|-------|-------|
| `memory/index.html` | Spielseite (Setup, Board, Ergebnis) |
| `memory/admin.html` | Paar-Verwaltung (Erstellen, MD-Import, Löschen) |
| `memory/js/memory.js` | Spiellogik (Board, Flip, Match, Scoring) |
| `memory/js/memory-admin.js` | Admin-Logik |
| `memory/js/memory-shared.js` | `MemoryStorageManager` + `MemoryModel` + `MemoryMDParser` |
| `memory/css/memory.css` | Styles (Dark-Standard, `body.light`) |
| `memory/lib/katex/` | KaTeX lokal gebündelt (Formel-Rendering) |
| `memory/data/pairs.json` | Paar-Datenbank |
| `memory/data/images/` | hochgeladene Kartenbilder |

## Daten & API

Format siehe [datenformate.md → Memory-Paare](../datenformate.md#3-memory-paare-datamemorypairsjson).
API-Endpunkt: `?f=memory-pairs` (GET/POST) in der zentralen `api.php`.
Kartentypen: `text`, `formula` (KaTeX), `image`. Kein Server-Sync/Multiplayer —
reines Einzelspiel, Zustand im Speicher.

## Ablauf

Setup (Kategorien, Schwierigkeit, Rastergröße) → Board (Karten aufdecken,
Paare matchen, Züge/Zeit zählen) → Ergebnis (Sterne, Statistik).

## Wichtige Funktionen (`memory.js`)

`renderCategoryList` · `startGame` · `renderBoard` / `renderCardContent` ·
`flipCard` · `checkMatch` · `showResult`.
