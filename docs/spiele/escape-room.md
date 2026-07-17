# Escape Room

Rätselräume für Teams: Fragen und Hotspots ergeben Code-Ziffern, mit denen ein
Schloss geöffnet wird. Rein **localStorage-basiert** (optional Server-Sync der
Spiele-Bibliothek). Nutzt **nicht** die zentrale Fragendatenbank — Fragen werden
pro Raum im Editor angelegt.

## Zwei Dateien, bewusst getrennt

| Datei | Rolle |
|-------|-------|
| `escape-room/index.html` | **Lehrkraft-Version**: Admin-Passwort (`LP@FOS`), Publish-System, Test-Modus, 360°-Panorama (Pannellum via CDN) |
| `escape-room/standalone.html` | **Schüler/Offline-Version**: kein Passwort, kein Löschen, kein 360° — sonst funktionsgleich |

**Divergenz-Warnung:** Beide Dateien sind fast identisch (alles inline). Fixes
und Features müssen in der Regel in **beiden** Dateien gepflegt werden. In der
Vergangenheit sind mehrere Korrekturen nur in einer Datei gelandet (Quota-Status,
iOS-Export, `allPuzzlesSolved`). Beim Ändern immer beide prüfen.

## Modi & Speicherung

- Admin-Modus über `?admin=true`; Spieler-Modus ohne Parameter.
- Mehrere Spiele in einer Bibliothek (`localStorage['escaperoom_library']`,
  optional Server unter `data/escape-room/game_*.json`).
- `published: boolean` — Schüler sehen nur publizierte Spiele.
- Team-Fortschritt pro Spiel/Team in `localStorage['escaperoom_team_<gameId>_<team>']`.
- Ranglisten in `localStorage['escaperoom_scores_<gameId>']`.
- Modi: `chain` (Räume der Reihe nach) | `single` (frei wählbar).

## Raum-Elemente

- **Fragen:** `multiple_choice`, `text_input`, `number_code`, `error_find` (Bild),
  `line_connect` (Punkte verbinden). Richtige Antworten ergeben Code-Ziffern.
- **Hotspots** (Explorer-Modus, wenn ein Raum Hotspots hat): `puzzle` (Fragen →
  Ziffer), `note` (Text), `exit` (offen wenn alle Puzzles gelöst). Sichtbarkeit
  über `requires` (Abhängigkeiten).
- **Schloss:** `padlock` (Zahlenrad) oder `digital` (Tastatur) — Codes müssen
  Ziffern sein.

## Besonderheiten (behobene Fallstricke)

- **Timer im Explorer-Modus:** `startTimer` bespielt beide Timer-Elemente
  (`#timer-el` und `#timer-el-explorer`) — sonst kein Countdown in Hotspot-Räumen.
- **Pause:** Verlassen speichert `pausedAt`; Tab-Schließen wird beim Fortsetzen
  über `lastSavedAt` als Pause erkannt (sonst frisst die Pause die Spielzeit).
  `finalTime` friert die Bestzeit beim ersten Abschluss ein.
- **Quota:** `saveGame` fängt `QuotaExceededError` (Base64-Bilder!) und meldet ihn
  (auch in `standalone.saveCurrentGame`). Bilder sollten klein gehalten werden.
- **Doppel-Push:** `onCorrectAnswer`/`onHotspotCorrect` prüfen auf Duplikate,
  sonst gilt ein Raum bei Doppelklick vorzeitig als gelöst.
- **`startGame`** fragt vor dem Überschreiben eines vorhandenen Spielstands nach.
- **Puzzle ohne Fragen** gilt als gelöst; `requires`-Zyklen werden beim Speichern
  aufgelöst — sonst wäre der Raum unlösbar.
- **XSS:** `escAttr` escaped auch `'`; `line_connect`-Punkt-IDs werden beim Import
  normalisiert (landen in `onclick`-Strings). MC-Antwort steht nicht mehr im DOM.
- **IIFE-Reset:** „Neues Spiel" ruft `window.resetToGameSelect()` statt
  window-Globals zu setzen (bekanntes IIFE-Scope-Muster).
- **iOS-Export:** `downloadJSON` nutzt `<a download>` mit data-URI (kein
  blockiertes `window.open('data:…')`).

## Wichtige Funktionen (beide Dateien)

`saveGame` · `startGame` / `resumeGame` · `enterRoom` · `isHotspotSolved` /
`isHotspotVisible` / `isHotspotCompleted` · `renderRoomExplorer` · `startTimer` /
`getElapsed` · `checkMC` / `checkTextAnswer` / `checkLineConnect` · `goToPadlock`
· `syncRoomsFromDOM` · `normalizeImportedGame` · `downloadJSON`.

Ausführlicher MD-Import-Dialekt und Explorer/360°-Details in
`CLAUDE.md → ## Escape Room`.

## Rich-Content (seit Juli 2026)

Fragetexte, MC-Optionen, Hints, Rätselkarten (Text) und Note-Hotspots rendern
über `js/rich-content.js` (Formeln `$…$`, Bilder `![Alt](data/images/…)`) —
in **beiden** Dateien identisch (`index.html` UND `standalone.html`,
Divergenz-Falle!). Nur die Lehrkraft-Datei hat zusätzlich „Bild hochladen →
Marker kopieren" (zentrale Ablage, Admin-Token) — analog zum fehlenden
Löschen-Button in `standalone.html`. Wird `standalone.html` solo (ohne
Projektordner) kopiert, degradieren Formeln zum Quelltext. Im MD-Import steht
`\|` in Fragen-/Optionen-Zeilen für ein literales Pipe.