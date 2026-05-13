# Vorlagen für neue Spiele

Fertige Templates zum Kopieren — Platzhalter `Xxx`/`xxx`/`PREFIX` durch den Spielnamen ersetzen.

## Dateien

| Datei | Inhalt |
|-------|--------|
| `spielverwaltung/gs-selector.html` | Kompletter HTML-Block für den Spielwähler-Screen |
| `spielverwaltung/gs-styles.css` | Alle `.gs-*` CSS-Regeln (kanonische Version) |
| `spielverwaltung/XxxStorage.js` | Storage-Objekt mit API + localStorage-Fallback |
| `spielverwaltung/game-manager.js` | Spielwähler-JS (createNewGame, _gsEnter, _gsDelete, …) |

## Checkliste für ein neues Spiel mit Spielverwaltung

1. **HTML**: `gs-selector.html` als ersten `.screen.active` einfügen
2. **CSS**: `gs-styles.css` ans Ende der Spiel-CSS-Datei kopieren — Variable-Variante wählen (Kommentar im File)
3. **JS**: `XxxStorage.js` + `game-manager.js` in die Spiellogik-JS kopieren
4. **Suchen & Ersetzen**:
   - `Xxx` → PascalCase Spielname (z.B. `Leiterspiel`)
   - `xxx` / `PREFIX` → Kleinbuchstaben-Prefix für localStorage + API (z.B. `ls-` / `ls_`)
   - Spielname im Template-Text (Titel, Labels)
5. **api.php**: Neuen Block für `PREFIX-games`, `PREFIX-game`, `PREFIX-sse` nach dem `ls-`-Block einfügen
6. **CLAUDE.md** `## Spielverwaltung` → Tabelle um neues Spiel ergänzen

## Wichtige Regeln

- `createNewGame` **muss** als `async function createNewGame()` deklariert werden (nicht als `window.xxx = ...`)  
  → Function Declarations werden gehoisted, Assignments nicht.
- `_gsEnter` / `_gsDelete` als reguläre Declarations definieren, danach manuell exportieren:  
  `window._gsEnter = _gsEnter;`
- Bei Spielen mit lokalem State (z.B. Maze-Grid, SVG-Board): In `_gsEnter()` den State aus dem gespeicherten Spielstand wiederherstellen.
