# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projektübersicht

Interaktive Unterrichtsspiele für Klassenzimmer / digitale Tafel. Kein Build-System, keine externen Abhängigkeiten.

```
Spiele/
  spiele.html                   ← Spielübersicht (Startseite) — Light/Dark Mode
  api.php                       ← PHP-API für Webhosting (Multi-Game + SSE)
  .htaccess                     ← Apache-Routing, SSE-Buffering
  categories.json               ← Kategoriedaten (Stadt Land Fluss legacy)
  stadt-land-fluss/
    index.html                  ← Stadt Land Fluss Spiel — Light/Dark Mode
    categories.json
  memory/
    index.html                  ← Memory Spielseite (Setup + Board + Ergebnis)
    admin.html                  ← Memory Admin (Paare verwalten, MD-Import)
    js/
      memory-shared.js          ← MemoryStorageManager + MemoryModel + MemoryMDParser
      memory.js                 ← Spiellogik (Board, Flip, Match, Scoring)
      memory-admin.js           ← Admin-Logik (Pair-Editor, Import)
    css/
      memory.css                ← Styles (Dark/Light, Card-Flip, responsive)
    lib/
      katex/                    ← KaTeX lokal (JS + CSS + Fonts)
    data/
      pairs.json                ← Memory-Paare Datenbank
      images/                   ← Hochgeladene Bilder für Karten
  quizpfad/
    index.html                  ← QuizPfad Spiel (Setup + Board + Modals)
    admin.html                  ← QuizPfad Fragenverwaltung (Editor + MD-Import)
    js/
      quizpfad.js               ← Spiellogik (Board, Teams, Runden, Bonus)
      quizpfad-admin.js         ← Editor-Logik (Fragen CRUD, MD-Import)
    css/
      quizpfad.css              ← Styles (Brettspiel Classic, responsive)
    data/
      fragen.json               ← Fragedatenbank (Kategorien + Fragen)
  risiko-quiz/
    index.html                  ← Risiko-Quiz Spieloberfläche (Join-Screen + Board)
    admin.html                  ← Risiko-Quiz Admin (Spielwähler + Editor)
    view.html                   ← Spieleransicht für Schüler (SSE-Live)
    practice.html               ← Übungsmodus (nur Questions, kein GameState)
    js/
      shared.js                 ← StorageManager (Multi-Game, SSE) + GameModel
      game.js                   ← Spiellogik + Join-Screen
      admin.js                  ← Admin-Logik + Spielwähler
    css/
      game.css                  ← Spieloberfläche CSS (mit Light Mode vars)
      admin.css                 ← Admin CSS (mit Light Mode vars)
    data/
      questions.json            ← Fragenbank (zentral, alle Spiele)
      gamestate.json            ← Legacy-Spielstand (vor Multi-Game)
      games/
        index.json              ← Registry aller Spiele {CODE: {title,status,...}}
        XXXX.json               ← Spielstand pro Spiel (CODE = 4-stellig)
```

---

## Styling-System

### Theme-Architektur

Alle Seiten teilen denselben localStorage-Key `'spiele_theme'` (`'dark'` / `'light'`).
So bleibt das gewählte Theme beim Navigieren zwischen Spielen erhalten.

**Zwei Muster je nach Standard-Theme:**

| Seite | Standard | Klasse für anderen Mode |
|-------|----------|------------------------|
| `index.html` | Light (SLF-Stil) | `body.dark` |
| `stadt-land-fluss/index.html` | Light (SLF-Stil) | `body.dark` |
| `quizpfad/index.html` | Light (Brettspiel) | `body.dark` |
| `quizpfad/admin.html` | Light (Brettspiel) | `body.dark` |
| `risiko-quiz/index.html` | Dark | `body.light` |
| `risiko-quiz/admin.html` | Dark | `body.light` |

**JS-Muster (immer gleich, nur `'dark'`/`'light'` und Klassenname tauschen):**

```js
(function () {
  const KEY = 'spiele_theme';
  function applyTheme(active) {
    document.body.classList.toggle('dark', active); // oder 'light' wenn Standard dark
    var el = document.getElementById('btn-theme');
    if (el) el.textContent = active ? '☀️ Lightmode' : '🌙 Darkmode';
  }
  window.toggleTheme = function () {
    var isActive = !document.body.classList.contains('dark');
    localStorage.setItem(KEY, isActive ? 'dark' : 'light');
    applyTheme(isActive);
  };
  applyTheme(localStorage.getItem(KEY) === 'dark');
})();
```

### CSS-Variablen-Paletten

**Dark Theme (Risiko-Quiz Standard / `:root` in game.css + admin.css):**
```css
--bg-primary:    #1a1a2e
--bg-secondary:  #16213e
--bg-card:       #0f3460
--bg-card-hover: #1a4a80
--accent:        #e94560       /* Risiko-Quiz Rot */
--text-primary:  #ffffff
--text-secondary:#a8a8b3
--success:       #2ecc71
--danger:        #e74c3c
--warning:       #f39c12
--border:        rgba(255,255,255,0.12)
--input-bg:      rgba(255,255,255,0.06)   /* nur admin.css */
/* Spielfeld-Schwierigkeiten (nur game.css): */
--field-100: #3498db   --field-200: #2ecc71
--field-300: #f39c12   --field-400: #e67e22   --field-500: #e74c3c
--played:    #2a2a3e   --played-text: #555577
--locked:    #1e1e30
```

**Light Theme (SLF-Stil / `:root` in index.html, body.light in CSS-Dateien):**
```css
Hintergrund:  linear-gradient(135deg, #f7971e, #E34F20)   /* orange Gradient */
Container:    #ffffff (weiß, border-radius: 20px, box-shadow)
--accent:     #E34F20       /* SLF Orange-Rot */
Text:         #222 / #555 / #666
Karten:       #f8f9fa (bg), #e0e0e0 (border)
Tags:         #ffe8df (bg), #c73518 (text)
```

**Light Mode Overrides für Risiko-Quiz (body.light in CSS-Dateien):**
```css
--bg-primary:    #fdf6f0
--bg-secondary:  #ffffff
--bg-card:       #fff3ee
--bg-card-hover: #ffe0d0
--accent:        #E34F20
--text-primary:  #1a1a1a
--text-secondary:#666666
--border:        rgba(0,0,0,0.1)
```

### Toggle-Button HTML

Für Seiten mit Dark-als-Standard (Risiko-Quiz):
```html
<!-- Im Header -->
<button class="header-btn" id="btn-theme" title="Design wechseln" onclick="toggleTheme()">☀️</button>
<!-- Im Setup-Screen -->
<button class="setup-btn" id="btn-theme-setup" onclick="toggleTheme()">☀️ Lightmode</button>
```

Für Seiten mit Light-als-Standard (SLF, index):
```html
<button id="btn-theme" onclick="toggleTheme()">🌙 Darkmode</button>
```

### Skalierung / Layout

`index.html` und `stadt-land-fluss/index.html`:
- `html, body { height: 100%; }` für korrekte Flex-Höhe
- `.page-wrap { flex: 1; }` → füllt verfügbaren Raum
- `.content-box { flex: 1; min-height: 0; }` → skaliert mit Viewport
- Padding mit `clamp()` für proportionale Responsive-Anpassung

---

## Stadt Land Fluss (`stadt-land-fluss/index.html`)

Single-file SPA, alle Styles und JS inline.

### State
| Variable | Typ | Zweck |
|----------|-----|-------|
| `excludedLetters` | `Set` | Ausgeschlossene Buchstaben |
| `drawnLetters` | `Set` | Bereits gezogene Buchstaben |
| `selectedCategories` | `Set` | Aktive Kategorien |
| `allCategories` | Array | JSON + localStorage Merge |
| `slf_added_categories` | localStorage | Eigene Kategorien |
| `slf_deleted_categories` | localStorage | Gelöschte JSON-Kategorien |

### Datenfluss
1. `init()` → `loadCategories()` → fetch `categories.json` (Fallback: eingebettete Liste)
2. localStorage-Overlay: hinzugefügte/gelöschte Kategorien werden gemergt
3. DOM-Manipulation ohne Framework

---

## Risiko-Quiz

### Architektur
- Läuft auf PHP-Webhosting; `api.php` + `.htaccess` übernehmen die API-Routen
- Zwei JSON-Dateien: `questions.json` (Fragenbank) + `gamestate.json` (Spielstand)
- `shared.js` enthält `StorageManager` (fetch-API) + `GameModel`
- `admin.js` und `game.js` laden Daten asynchron beim Start

### StorageManager-Endpunkte
| Methode | Endpoint | Zweck |
|---------|----------|-------|
| `loadQuestions()` | GET ?f=questions | Fragenbank laden (zentral) |
| `saveQuestions(qb)` | POST ?f=questions | Fragenbank speichern |
| `loadGamesRegistry()` | GET ?f=games | Spielübersicht laden |
| `loadGameStateByCode(code)` | GET ?f=game&code=X | Spielstand per Code laden |
| `saveGameStateByCode(code,gs)` | POST ?f=game&code=X | Spielstand speichern + Registry updaten |
| `deleteGame(code)` | DELETE ?f=game&code=X | Spiel löschen |
| `subscribeGameState(code,cb)` | GET ?f=sse&code=X | SSE-Echtzeit-Stream |
| `loadGameState()` | dispatcht zu code-basiert | Wenn Code gesetzt → loadGameStateByCode |
| `saveGameState(gs)` | dispatcht zu code-basiert | Wenn Code gesetzt → saveGameStateByCode |

### Multi-Game Architektur
- Jedes Spiel hat einen **4-stelligen Code** (z.B. `A3K7`)
- `StorageManager.setGameCode(code)` setzt den aktiven Code
- Alle Seiten nutzen URL-Parameter `?code=XXXX`
- SSE-Endpunkt liefert Echtzeit-Updates (Polling als Fallback für file://)

### Session-Tracking
Gespielte Fragen/Zellen werden in `gameData.session` gespeichert (nicht in Fragobjekten):
```js
session: {
  playedQuestions: { [questionId]: { playedBy, correct } },
  playedCells:     { [cellKey]: true }
}
cellKey = `${categoryId}-${subcategoryId}-${difficulty}`
```

### Theme (Risiko-Quiz spezifisch)
- Standard: Dark (`:root` in game.css / admin.css)
- `body.light` überschreibt alle CSS-Variablen
- Toggle-Script am Ende jeder HTML-Datei als IIFE

---

## Memory

### Architektur
- Singleplayer-Spiel: Paare finden (Text, Formeln, Bilder)
- KaTeX lokal gebündelt in `memory/lib/katex/` für Formel-Rendering
- `memory-shared.js` enthält `MemoryStorageManager` + `MemoryModel` + `MemoryMDParser`
- API-Endpunkt: `?f=memory-pairs` (GET/POST)

### Datenformat (`pairs.json`)
```json
{
  "categories": [
    {
      "id": "cat-...",
      "name": "Kategoriename",
      "pairs": [
        {
          "id": "pair-...",
          "sideA": { "type": "text|formula|image", "content": "..." },
          "sideB": { "type": "text|formula|image", "content": "..." },
          "difficulty": 1
        }
      ]
    }
  ]
}
```

### MD-Import Format
```markdown
## Kategoriename
- typA | inhaltA | typB | inhaltB | schwierigkeit
```
Typen: `text`, `formula`, `image` (auch `formel`, `bild` als Alias)

### Theme (Memory spezifisch)
- Standard: Dark (`:root` in memory.css)
- `body.light` überschreibt alle CSS-Variablen
- Toggle-Script am Ende jeder HTML-Datei als IIFE

---

## QuizPfad

### Architektur
- Lineares Brettspiel: Teams rücken durch richtige Antworten auf einem Mäander-Pfad vor
- 30 Felder in Schlangen-Layout (6 Spalten, 5 Zeilen, abwechselnd L→R / R→L)
- Eigene Fragenbank: `quizpfad/data/fragen.json`
- API-Endpunkt: `?f=quizpfad-fragen` (GET/POST)
- Kein Multi-Game, kein SSE — reines Einzelspiel im Browser

### Datenformat (`fragen.json`)
```json
{
  "kategorien": [
    { "id": "chemie", "name": "Chemie Grundlagen", "icon": "🧪", "farbe": "#3498db" }
  ],
  "fragen": [
    {
      "id": "q001", "kategorie": "chemie", "schwierigkeit": "leicht",
      "frage": "...", "typ": "multiple_choice",
      "antworten": ["A", "B", "C", "D"], "richtig": 0,
      "erklaerung": "..."
    }
  ]
}
```
Typen: `multiple_choice`, `wahr_falsch`, `offen` (Lehrer entscheidet)

### Bonusfelder
| Typ | Effekt |
|-----|--------|
| `advance` | +2 Felder vor |
| `setback` | -2 Felder zurück |
| `extra` | Sofort nochmal dran |
| `joker` | Frage überspringen (1× pro Spiel) |
| `duel` | Teamduell: gleiche Frage, schneller gewinnt |

### Theme (QuizPfad spezifisch)
- Standard: Light (Brettspiel Classic, warmes Beige)
- `body.dark` überschreibt alle CSS-Variablen (warme Brauntöne)
- Toggle-Script am Ende jeder HTML-Datei als IIFE
