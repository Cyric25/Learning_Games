# Vorlagen für neue Spiele

Fertige Templates zum Kopieren — Platzhalter `Xxx`/`xxx`/`PREFIX` durch den Spielnamen ersetzen.

## Dateien

### Spielverwaltung (Spielwähler + Multi-Game)

| Datei | Inhalt | Wann verwenden |
|-------|--------|----------------|
| `spielverwaltung/gs-selector.html` | HTML-Block Spielwähler-Screen | admin.html-Stil (mit Card-Wrapper `.gs-container`) |
| `spielverwaltung/index-selector.html` | HTML-Block Spielwähler-Screen | index.html-Stil (kein Card, full-screen zentriert) |
| `spielverwaltung/gs-styles.css` | Alle `.gs-*` CSS-Regeln (kanonisch) | Für beide Selector-Varianten |
| `spielverwaltung/XxxStorage.js` | Storage-Objekt mit API + localStorage-Fallback | Immer |
| `spielverwaltung/game-manager.js` | Spielwähler-JS (createNewGame, _gsEnter, _gsDelete, …) | Immer |

### Kategorieauswahl (zentrale Fragendatenbank)

| Datei | Inhalt |
|-------|--------|
| `spielverwaltung/cat-selector.html` | HTML-Block für Setup-Screen (Akkordeon-Kategorieliste) |
| `spielverwaltung/cat-selector.js` | JS: buildCategoryUI, toggleAllCategories, updateCategoryInfo, … |
| `spielverwaltung/cat-selector.css` | CSS: Akkordeon-Gruppen + Blatt-Items (Variante A + B) |

---

## Checkliste: Neues Spiel mit Spielverwaltung

1. **HTML**: Spielwähler-HTML als ersten `.screen.active` einfügen
   - admin.html-Stil → `gs-selector.html`
   - index.html-Stil → `index-selector.html`
2. **CSS**: `gs-styles.css` in die Spiel-CSS-Datei kopieren — Variante A oder B wählen (Kommentare im File)
3. **JS**: `XxxStorage.js` + `game-manager.js` in die Spiellogik-JS kopieren
4. **Suchen & Ersetzen**:
   - `Xxx` → PascalCase Spielname (z.B. `Leiterspiel`)
   - `xxx` / `PREFIX` → Kleinbuchstaben-Prefix für localStorage + API (z.B. `ls-` / `ls_`)
   - Spielname im Template-Text (Titel, Labels)
5. **api.php**: Neuen Block für `PREFIX-games`, `PREFIX-game`, `PREFIX-sse` nach dem `ls-`-Block einfügen
6. **CLAUDE.md** `## Spielverwaltung` → Tabelle um neues Spiel ergänzen

## Checkliste: Kategorieauswahl einbauen

Für Spiele, die die **zentrale Fragendatenbank** (`data/questions.json`) nutzen:

1. **HTML**: `cat-selector.html` in den `setup-card` / `setup-section`-Bereich einfügen
2. **CSS**: `cat-selector.css` in die Spiel-CSS-Datei kopieren — Variante A oder B:
   - Variante A (Leiterspiel): `--bg-sidebar`, `--bg-field`, `--border`
   - Variante B (Labyrinth): `--bg-secondary`, `--bg-card`, `--border-card`
3. **JS**: `cat-selector.js` in die Spiellogik-JS-Datei kopieren
4. **Variablen im Spiellogik-JS** sicherstellen:
   ```js
   let rawCategories    = [];          // questions.json .categories (unverändert)
   let allQuestions     = [];          // flach, .kategorieId = Blatt-Kategorie-ID
   let activeCategories = new Set();   // wird von buildCategoryUI() befüllt
   ```
5. **rawCategories befüllen**: `rawCategories = questionsJson.categories;`
6. **buildCategoryUI()** aufrufen, nachdem Fragen geladen wurden
7. **Feldname prüfen**: `allQuestions[i].kategorieId` — ggf. in `updateCategoryInfo()` anpassen

---

## Wichtige Regeln

### Spielverwaltung
- `createNewGame` **muss** als `async function createNewGame()` deklariert werden (nicht als `window.xxx = ...`)
  → Function Declarations werden gehoisted, Assignments nicht.
- `_gsEnter` / `_gsDelete` als reguläre Declarations definieren, danach manuell exportieren:
  `window._gsEnter = _gsEnter;`
- Bei Spielen mit lokalem State (z.B. Maze-Grid, SVG-Board): In `_gsEnter()` den State aus dem
  gespeicherten Spielstand wiederherstellen.

### Kategorieauswahl
- `rawCategories` enthält die **rohe** Hierarchie aus questions.json — nicht die konvertierte Flat-Liste.
  Die Konvertierung (`convertRQ…()`) liefert `allQuestions`; `rawCategories` wird separat gesetzt.
- Die `activeCategories`-Set enthält **Blatt-Kategorie-IDs** (tiefste Ebene).
  Beim Spielstart Fragen filtern: `allQuestions.filter(q => activeCategories.has(q.kategorieId))`.
- Beim Speichern des Spielstands `activeCategoryIds: [...activeCategories]` mitspeichern,
  damit beim Laden eines laufenden Spiels die Kategorien wiederhergestellt werden können.
