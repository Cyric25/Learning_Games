# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projektübersicht

Interaktive Unterrichtsspiele für Klassenzimmer / digitale Tafel. Kein Build-System, keine externen Abhängigkeiten.

```
Spiele/
  spiele.html                   ← Spielübersicht (Startseite) — Light/Dark Mode + Fragendatenbank-Button
  api.php                       ← PHP-API für Webhosting (Multi-Game + SSE)
  .htaccess                     ← Apache-Routing, SSE-Buffering
  categories.json               ← Kategoriedaten (Stadt Land Fluss legacy)
  data/
    questions.json              ← ZENTRALE Fragendatenbank (alle Quiz-Spiele)
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
  escape-room/
    index.html                  ← Escape Room (Admin + Spieler, alles inline)
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
      gamestate.json            ← Legacy-Spielstand (vor Multi-Game)
      games/
        index.json              ← Registry aller Spiele {CODE: {title,status,...}}
        XXXX.json               ← Spielstand pro Spiel (CODE = 4-stellig)
  Leiterspiel-quiz/
    index.html                  ← Leiterspiel (Setup + 10×10 Board + Modals)
    admin.html                  ← Verweis auf Risiko-Quiz Admin
    js/
      leiterspiel.js            ← Spiellogik (Board, Leitern, Schlangen, Fragen)
    css/
      leiterspiel.css           ← Styles (Light default, body.dark)
  Labyrint-Quiz/
    index.html                  ← Labyrinth-Quiz (Setup + Canvas-Board + Modals)
    admin.html                  ← Verweis auf Risiko-Quiz Admin
    js/
      maze.js                   ← SeededRNG + MazeGenerator (16×16, Recursive Backtracker)
      renderer.js               ← Canvas-Renderer (Labyrinth, Figuren, Animationen)
      labyrinth.js              ← Spiellogik (Setup, Turns, Fragen, Scoring)
    css/
      labyrinth.css             ← Styles (Light default, body.dark)
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
| `escape-room/index.html` | Dark (Mystery) / Hell (Admin) | `body.player-mode` / `body.admin-mode` |
| `risiko-quiz/index.html` | Dark | `body.light` |
| `risiko-quiz/admin.html` | Dark | `body.light` |
| `Labyrint-Quiz/index.html` | Light (Mystisch-Lila) | `body.dark` |
| `Labyrint-Quiz/admin.html` | Light (Mystisch-Lila) | `body.dark` |

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

## Zentrale Fragendatenbank

### Prinzip
Alle fragenbasierten Spiele nutzen eine **gemeinsame Fragendatenbank**: `data/questions.json`.
Das Risiko-Quiz-Format ist das Master-Format. Spiele, die ein anderes internes Format benötigen, konvertieren beim Laden automatisch.

**Bei der Implementierung eines neuen Spiels MUSS nachgefragt werden**, ob die zentrale Fragendatenbank verwendet werden soll. Standardmäßig ja — Ausnahmen nur, wenn die Spielmechanik ein grundlegend anderes Datenformat erfordert (z.B. Paare statt Fragen).

### Nutzer der zentralen DB

| Spiel | Konvertierung | Admin |
|-------|--------------|-------|
| Risiko-Quiz | Nativ (Master) | Eigener Admin (`risiko-quiz/admin.html`) |
| QuizPfad | `convertRQtoQuizPfad()` | Verweist auf Risiko-Quiz Admin |
| Labyrinth-Quiz | `convertRQtoLabyrinth()` | Verweist auf Risiko-Quiz Admin |
| Leiterspiel-Quiz | `convertRQtoLeiterspiel()` | Verweist auf Risiko-Quiz Admin |

### Spiele mit eigener Datenbank (spielmechanikbedingt)

| Spiel | Eigene DB | Grund |
|-------|-----------|-------|
| Memory | `memory/data/pairs.json` | Paare (sideA/sideB) statt Fragen |
| Stadt Land Fluss | `categories.json` | Kategorienamen statt Fragen |
| Escape Room | localStorage | Raumgebundene Fragen mit Codes/Hotspots |

### Master-Format (`questions.json`)
```json
{
  "categories": [{
    "id": "cat-...", "name": "Kategoriename",
    "subcategories": [{
      "id": "subcat-...", "name": "Unterkategorie",
      "questions": [{
        "id": "q-...", "question": "Fragetext",
        "type": "mc|open",
        "difficulty": 100|200|300|400|500,
        "options": ["A","B","C","D"], "correctIndex": 0,
        "answer": "...", "hint": "..."
      }]
    }]
  }]
}
```

### Standard-Konvertierung (für neue Spiele übernehmen)
| Master-Feld | Konvertiert |
|-------------|------------|
| `difficulty: 100-200` | `"leicht"` |
| `difficulty: 300` | `"mittel"` |
| `difficulty: 400-500` | `"schwer"` |
| `type: "mc"` | `"multiple_choice"` |
| `type: "open"` | `"offen"` |
| Nested subcategories | Flat (Blatt-Ebenen, Pfad mit ` › `) |

### Zugriff auf die Fragendatenbank
- **Im Lehrermodus**: Button "📋 Fragendatenbank" im Header von `spiele.html` → öffnet `risiko-quiz/admin.html`
- **Einzelne Spiele**: Haben keinen eigenen "Fragen"-Button mehr in `spiele.html`; Admin-Seiten verweisen auf die zentrale DB
- **Risiko-Quiz Admin** (`risiko-quiz/admin.html`) ist der **zentrale Frageneditor** für alle Quiz-Spiele

### Laden der Fragendatenbank (Standard-Pattern)
```js
async function loadQuestions() {
  // 1. Versuch: API (Webhosting)
  try {
    const r = await fetch('../api.php?f=questions');
    if (r.ok) return await r.json();
  } catch(e) {}
  // 2. Versuch: Direkt (file:// oder statisch)
  try {
    const r = await fetch('../data/questions.json');
    if (r.ok) return await r.json();
  } catch(e) {}
  // 3. Fallback: localStorage
  const cached = localStorage.getItem('rq_questions');
  return cached ? JSON.parse(cached) : { categories: [] };
}
```

### Kategorieauswahl im Setup (Standard-Pattern)
Jedes Spiel, das die zentrale DB nutzt, bietet im Setup-Screen eine **Kategorieauswahl** an:
- Alle Kategorien (Blatt-Ebenen) werden als Toggle-Buttons angezeigt
- "Alle auswählen" / "Keine" Buttons verfügbar
- Nur Fragen aus gewählten Kategorien werden im Spiel verwendet
- Kategorien erhalten automatisch Icons und Farben aus einer festen Palette

---

## Multi-Game Architektur (Paralleles Spielen)

### Prinzip
Wenn ein Spiel **paralleles Spielen** mit mehreren Klassen/Gruppen unterstützen soll, wird das Multi-Game-Muster des Risiko-Quiz verwendet. Bei der Implementierung eines neuen Spiels **nachfragen**, ob Multi-Game sinnvoll ist (z.B. wenn mehrere Klassen gleichzeitig spielen könnten).

### Ablauf
1. **Spiel erstellen**: Lehrkraft erstellt ein neues Spiel im Admin → generiert einen **4-stelligen Zugangscode** (z.B. `A3K7`)
2. **Beitreten**: Spieler geben den Code ein → URL-Parameter `?code=XXXX`
3. **Spielstand pro Spiel**: Jedes Spiel hat eine eigene JSON-Datei (`games/XXXX.json`)
4. **Registry**: `games/index.json` enthält alle aktiven Spiele mit Metadaten (Titel, Status, Zeitstempel)
5. **Echtzeit-Sync**: SSE-Endpunkt (`?f=sse&code=XXXX`) liefert Live-Updates an alle Clients
6. **Auto-Cleanup**: Spiele werden **nach 24 Stunden automatisch gelöscht** (serverseitig in `api.php`)

### Technische Umsetzung
```
api.php Endpunkte:
  GET  ?f=games            → Registry aller Spiele laden
  POST ?f=games            → Registry speichern
  GET  ?f=game&code=XXXX   → Spielstand laden
  POST ?f=game&code=XXXX   → Spielstand speichern + Registry updaten
  DELETE ?f=game&code=XXXX → Spiel löschen
  GET  ?f=sse&code=XXXX   → Server-Sent Events Stream

Dateistruktur:
  risiko-quiz/data/games/
    index.json              ← Registry: { "A3K7": { title, status, createdAt, updatedAt } }
    A3K7.json               ← Spielstand für Spiel A3K7
```

### Cleanup-Logik (`cleanupExpiredGames`)
- Wird bei jedem Registry-Abruf (`GET ?f=games`) ausgeführt
- Löscht Spiele, deren `updatedAt`/`createdAt` > 24 Stunden alt ist
- Entfernt sowohl die Spieldatei als auch den Registry-Eintrag
- File-Locking (`LOCK_EX`) für konkurrierende Zugriffe

### Spiele mit Multi-Game
| Spiel | Multi-Game | Grund |
|-------|-----------|-------|
| Risiko-Quiz | Ja | Mehrere Klassen parallel, SSE-Live-Updates |
| QuizPfad | Nein | Einzelspiel im Browser |
| Labyrinth-Quiz | Nein | Einzelspiel im Browser |
| Leiterspiel-Quiz | Nein | Einzelspiel im Browser |
| Memory | Nein | Singleplayer |
| Escape Room | Nein | localStorage-basiert, eigenes Multi-Team-System |

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
- Verwaltet die **zentrale Fragendatenbank** (`data/questions.json`) — siehe Abschnitt "Zentrale Fragendatenbank"
- Läuft auf PHP-Webhosting; `api.php` + `.htaccess` übernehmen die API-Routen
- Zwei JSON-Dateien: `questions.json` (Fragenbank) + `gamestate.json` (Spielstand)
- `shared.js` enthält `StorageManager` (fetch-API) + `GameModel`
- `admin.js` und `game.js` laden Daten asynchron beim Start
- Der Risiko-Quiz Admin ist der **zentrale Frageneditor** für alle Quiz-Spiele

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
- **Zentrale Fragendatenbank** mit Standard-Konvertierung (`convertRQtoQuizPfad()`) — siehe Abschnitt "Zentrale Fragendatenbank"
- Admin verweist auf Risiko-Quiz Admin (`risiko-quiz/admin.html`)
- Kein Multi-Game, kein SSE — reines Einzelspiel im Browser

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

---

## Escape Room

### Architektur
- Single-HTML-File-Anwendung: `escape-room/index.html` (Admin + Spieler in einer Datei)
- Kein Server nötig — rein localStorage-basiert
- Admin-Modus über URL-Parameter: `?admin=true`
- Spieler-Modus: ohne Parameter (Standard)
- Multiple Games: Lehrkraft erstellt mehrere Spiele, Schüler wählen aus
- Mehrere Teams können gleichzeitig auf verschiedenen Geräten dasselbe Spiel spielen
- Google Fonts: Cinzel (Überschriften), Crimson Text (Fließtext)

### localStorage Keys
| Key | Inhalt |
|-----|--------|
| `escaperoom_library` | JSON-Array aller Spiele (vom Admin angelegt) |
| `escaperoom_scores_{gameId}` | Rangliste pro Spiel |
| `escaperoom_team_{gameId}_{teamname}` | Spielstand pro Team pro Spiel |

### Datenformat (Spiel-Objekt)
```json
{
  "id": "game_...",
  "game": { "title": "...", "description": "...", "totalTimer": 2400, "mode": "chain|single" },
  "rooms": [{
    "id": "room_1", "name": "...", "subject": "...", "description": "...",
    "backgroundImage": "", "unlockCode": "4823",
    "questions": [{
      "id": "q1", "type": "multiple_choice|text_input|number_code",
      "text": "...", "options": [], "correctAnswer": "...",
      "caseSensitive": false, "hint": "", "codeDigit": "4"
    }]
  }]
}
```
Modi: `chain` (Räume der Reihe nach), `single` (frei wählbar)

### Theme (Escape Room spezifisch)
- Spieler-Modus: Dark/Mystery (`body.player-mode`) — Tiefes Dunkelblau, Gold-Akzente, Noise-Overlay
- Admin-Modus: Light/Clean (`body.admin-mode`) — Weißes Interface, Blau-Akzente
- Kein Shared-Theme-Toggle (eigenes System, nicht `spiele_theme`)

---

## Labyrinth-Quiz

### Architektur
- Canvas-basiertes Labyrinth-Spiel: Teams navigieren ein 16×16 Labyrinth
- **Zentrale Fragendatenbank** mit Standard-Konvertierung (`convertRQtoLabyrinth()`) — siehe Abschnitt "Zentrale Fragendatenbank"
- `maze.js` generiert Labyrinth mit SeededRNG (Recursive Backtracker + Extra-Verbindungen)
- `renderer.js` zeichnet das Labyrinth auf HTML5 Canvas
- Admin verweist auf Risiko-Quiz Admin (`risiko-quiz/admin.html`)
- Kein Multi-Game, kein SSE — reines Einzelspiel im Browser (Phase 1)

### Spielmechanik
- 2–6 Gruppen mit SVG-Figuren (🛡️🐉🦉🦊🧙🤖)
- Symbole (6–18) im Labyrinth verteilt, anteilig auf gewählte Kategorien
- Türen (geschlossen) blockieren Wege → Frage beantworten zum Öffnen
- Symbole einsammeln → Frage beantworten → +10 Punkte
- Ziel erreichen mit allen Symbolen → +50 Bonus → Sieg

### Punkte-System
| Aktion | Punkte |
|--------|--------|
| Symbol eingesammelt (richtig) | +10 |
| Tür geöffnet (richtig) | 0 |
| Ziel + alle Symbole | +50 Bonus |
| Falsche Antwort | 0 |

### Theme (Labyrinth-Quiz spezifisch)
- Standard: Light (Mystisch-Lila Akzentfarbe `#7c3aed`)
- `body.dark` überschreibt alle CSS-Variablen (dunkles Lila/Indigo)
- Toggle-Script am Ende jeder HTML-Datei als IIFE

---

## Leiterspiel-Quiz

### Architektur
- Klassisches Leiterspiel (Snakes & Ladders) mit 100 Feldern (10×10 Grid)
- **Zentrale Fragendatenbank** mit Standard-Konvertierung (`convertRQtoLeiterspiel()`) — siehe Abschnitt "Zentrale Fragendatenbank"
- Admin verweist auf Risiko-Quiz Admin (`risiko-quiz/admin.html`)
- Einzel- und Mehrspielermodus

### Spielmechanik
- 5 Leitern: 4→14, 9→31, 21→42, 28→84, 51→67
- 5 Schlangen: 16→6, 47→26, 62→19, 93→73, 98→87
- Zeitlimits: leicht=30s, mittel=45s, schwer=60s
- Punkte: leicht=10, mittel=20, schwer=30
