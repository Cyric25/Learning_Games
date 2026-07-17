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
| `spielverwaltung/game-manager.js` | Spielwähler-JS (createNewGame, _gsEnter, _gsDelete, copyCode, …) | Immer |

### Setup-Flow (3 Screens: Setup → Kategorien → Lobby)

| Datei | Inhalt | Wann verwenden |
|-------|--------|----------------|
| `spielverwaltung/setup-screen.html` | HTML-Block Setup-Screen (Teams + Einstellungen) | Screen 2 im Setup-Flow |
| `spielverwaltung/setup-screen.css` | CSS für Setup + Category + Lobby Screen | Immer |
| `spielverwaltung/lobby-screen.html` | HTML-Block Lobby "Bereit!" | Screen 3, wenn Spielverwaltung aktiv |

### Kategorieauswahl (zentrale Fragendatenbank)

| Datei | Inhalt | Wann verwenden |
|-------|--------|----------------|
| `spielverwaltung/cat-selector.html` | HTML-Block Kategorie-Screen (Akkordeon-Liste) | Screen zwischen Setup + Lobby |
| `spielverwaltung/cat-selector.js` | JS: buildCategoryUI, toggleAllCategories, updateCatSelectInfo | Immer wenn zentrale DB genutzt |
| `spielverwaltung/cat-selector.css` | CSS: Akkordeon-Gruppen + Blatt-Items (Variante A + B) | Immer wenn zentrale DB genutzt |

---

## Screen-Ablauf (vollständig)

```
#game-selector     ← Spielwähler (gs-selector.html / index-selector.html)
        ↓
#setup-screen      ← Teams & Einstellungen (setup-screen.html)
        ↓
#category-screen   ← Kategorieauswahl (cat-selector.html)  [nur mit Fragendatenbank]
        ↓
#lobby-screen      ← "Bereit!" + Spielcode (lobby-screen.html)  [nur mit Spielverwaltung]
        ↓
#game-screen       ← Spielfeld (spielspezifisch)
```

Screens ohne Spielverwaltung (z.B. QuizPfad):
```
#setup-screen → #category-screen → #game-screen
```

---

## Checkliste: Neues Spiel mit Spielverwaltung

1. **HTML**: Spielwähler als ersten `.screen.active` einfügen
   - Kein Card-Wrapper → `index-selector.html`
   - Mit Card-Wrapper → `gs-selector.html`
2. **HTML**: Setup-Screen einfügen → `setup-screen.html`
3. **HTML**: Kategorie-Screen einfügen → `cat-selector.html`
4. **HTML**: Lobby-Screen einfügen → `lobby-screen.html`
5. **CSS**: `../css/spielwaehler.css` einbinden — der Spielwähler bekommt damit
   den **einheitlichen Look** (Risiko-Quiz-Optik, Klasse `gs-screen`,
   verbindliche Regel, siehe `CLAUDE.md → Einheitlicher Spielwähler-Look`).
   `gs-styles.css` nur noch für die Beitrittsscreens von view/board kopieren;
   `setup-screen.css` + `cat-selector.css` wie gehabt in die Spiel-CSS:
   - Variante A (Leiterspiel: `--bg-sidebar`/`--bg-field`/`--border`) oder
   - Variante B (Labyrinth: `--bg-secondary`/`--bg-card`/`--border-card`) wählen
   - `--bg-primary` in `:root` + `body.dark` definieren (flache Farbe, kein Gradient)
6. **JS**: `XxxStorage.js` + `game-manager.js` + `cat-selector.js` in Spiellogik-JS kopieren
7. **Suchen & Ersetzen**:
   - `XxxStorage` → Name des Storage-Objekts (z.B. `LsStorage`)
   - `PREFIX` → Kleinbuchstaben-API-Prefix (z.B. `ls-`)
   - `PREFIX_gs_` → localStorage-Key-Prefix (z.B. `ls_gs_`)
   - `'Spielname'` → tatsächlicher Spieltitel
   - `selectedCategoryIds` → konsistent im ganzen JS (oder eigener Name)
   - `updateCatSelectInfo()` → spielspezifische Zähllogik eintragen
   - `_countLeafQ()` → Option A/B/C wählen (Kommentar im Template)
8. **api.php**: Neuen Block für `PREFIX-games`, `PREFIX-game`, `PREFIX-sse` einfügen
9. **CLAUDE.md** → `## Spielverwaltung` Tabelle um neues Spiel ergänzen

---

## Checkliste: Kategorieauswahl einbauen

Für Spiele die die **zentrale Fragendatenbank** (`data/questions.json`) nutzen:

1. **HTML**: `cat-selector.html` als eigenen `.screen` einfügen (nicht mehr als `<section>` im Setup-Screen)
2. **CSS**: `cat-selector.css` kopieren — Variante wählen:
   - Variante A (Leiterspiel): `--bg-sidebar`/`--bg-field`/`--border`
   - Variante B (Labyrinth): `--bg-secondary`/`--bg-card`/`--border-card`
3. **JS**: `cat-selector.js` kopieren, dann anpassen:
   - `selectedCategoryIds` → ggf. umbenenn auf spielinternen Namen
   - `_countLeafQ()` → Option im Kommentar wählen (A: cat.questions.length, B: fragenBank, C: allQuestions)
   - `updateCatSelectInfo()` → spielspezifische Fragenbank-Abfrage eintragen
4. **rawCategories befüllen**: `rawCategories = questionsJson.categories;`
5. **Aufruf**: `buildCategoryUI()` in `proceedToCategories()` aufrufen (nicht beim Laden)
6. **Filterung beim Spielstart**: `fragen.filter(q => selectedCategoryIds.has(q.kategorie))` o.ä.
7. **Speichern**: `activeCategoryIds: [...selectedCategoryIds]` im Spielstand mitspeichern

---

## Checkliste: Lobby-Screen einbauen

Für Spiele **mit Spielverwaltung** (Spielcode vorhanden):

1. **HTML**: `lobby-screen.html` einfügen (nach `#category-screen`, vor `#game-screen`)
2. **CSS**: Lobby-Styles sind in `setup-screen.css` enthalten — keine extra Datei
3. **JS** in `game-manager.js`:
   - `showLobbyScreen(summaryText)` aufrufen statt direkt zu `#game-screen` zu wechseln
   - `startGame()` als window-Funktion exportieren: `window.startGame = startGame`
4. **Beispiel-Aufruf** (in `proceedFromCategories()` o.ä.):
   ```js
   const n = teams.length;
   const q = activeFragenBank.length;
   showLobbyScreen(n + ' Teams · ' + selectedCategoryIds.size + ' Kategorien · ' + q + ' Fragen');
   ```

---

## Wichtige Regeln

### Spielverwaltung
- `createNewGame` **muss** als `async function createNewGame()` deklariert werden (nicht `window.xxx = ...`)
  → Function Declarations werden gehoisted, Assignments nicht.
- `_gsEnter` / `_gsDelete` als reguläre Declarations definieren, danach manuell exportieren:
  `window._gsEnter = _gsEnter;` (nach den Declarations, vor DOMContentLoaded)
- Bei Spielen mit lokalem State (Maze-Grid, SVG-Board): State in `_gsEnter()` aus Spielstand wiederherstellen.

### Kategorieauswahl
- `rawCategories` enthält die **rohe** Hierarchie aus questions.json — nicht die konvertierte Flat-Liste.
  Die Konvertierung (`convertRQ…()`) liefert die spielspezifische Fragenbank; `rawCategories` separat setzen.
- `selectedCategoryIds` enthält **Blatt-Kategorie-IDs** (tiefste Ebene mit eigenen Fragen).
- Beim Speichern des Spielstands `activeCategoryIds: [...selectedCategoryIds]` mitspeichern,
  damit beim Laden eines laufenden Spiels die Kategorien wiederhergestellt werden können.

### CSS-Varianten (light-first vs dark-first)
- **Light-first** (Leiterspiel, Labyrinth, QuizPfad, neue Spiele):
  Default-Werte in `setup-screen.css` sind light-freundlich (`rgba(0,0,0,…)`)
  → `body.dark`-Overrides am Ende aktivieren dark mode
- **Dark-first** (Risiko-Quiz Stil):
  Default-Werte sind dark-freundlich (`rgba(255,255,255,…)`)
  → `body.light`-Overrides für light mode hinzufügen
  → Im Template mit `← DARK-FIRST` markierte Stellen tauschen

### copyCode
- In `game-manager.js` enthalten, manuell auf window exportiert: `window.copyCode = copyCode`
- Verwendet `navigator.clipboard` (HTTPS / localhost) mit `execCommand`-Fallback
- onclick-Verwendung: `onclick="copyCode(this)"` auf dem Element das den Code als Text enthält
