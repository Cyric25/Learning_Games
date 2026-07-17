# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Vollständige Projektdokumentation:** `docs/` (Einstieg: `docs/README.md`).
> Diese Datei bleibt die verbindliche Kurzreferenz (Styling-Paletten,
> Copy-Paste-Muster, MD-Dialekte). Für Architektur, API, Datenformate und
> Erweiterung siehe `docs/`.

## ⚠️ Vor JEDER Erweiterung: Spezifikation abfragen

Wenn ein **neues Spiel** oder eine **größere Erweiterung** gewünscht wird, zuerst
die Spezifikation abfragen — **bevor** geplant oder implementiert wird. Nicht mit
Defaults „einfach loslegen". Mindestens klären: (1) Mehrspieler/Multi-Device oder
Einzelspieler? (2) Welche Ansichten — Lehrergerät, Schülergerät, Tafelansicht
(`board.html`), Solo? (3) Zentrale Fragendatenbank ja/nein? (4) Team-Modell
(feste Teams, exklusiver Beitritt, Kick)? (5) Wer wertet aus (MC automatisch /
Lehrkraft)? (6) Persistenz/Reentry? (7) Editor/Designer? (8) Theme.
Vollständiger Fragebogen: `docs/entwicklung.md → §0`.

## Projektübersicht

Interaktive Unterrichtsspiele für Klassenzimmer / digitale Tafel. Kein Build-System, keine externen Abhängigkeiten.

```
Spiele/
  spiele.html                   ← Spielübersicht (Startseite) — Light/Dark Mode + Fragendatenbank-Button
  admin.html                    ← Zentrale Fragendatenbank (Frageneditor, MD-Import, Export)
  api.php                       ← PHP-API für Webhosting (Multi-Game + SSE + Bild-Upload)
  .htaccess                     ← Apache-Routing, SSE-Buffering
  categories.json               ← Kategoriedaten (Stadt Land Fluss legacy)
  js/
    rich-content.js             ← Gemeinsames Rendering: Text + KaTeX-Formeln + Bilder (ALLE Spiele/Editoren)
  lib/
    katex/                      ← KaTeX lokal, zentral (JS + CSS + Fonts; früher memory/lib/katex)
  data/
    questions.json              ← ZENTRALE Fragendatenbank (alle Quiz-Spiele)
    images/                     ← Zentrale Bild-Ablage (?f=image-upload, Admin-Token)
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
    data/
      pairs.json                ← Memory-Paare Datenbank
      images/                   ← Hochgeladene Bilder für Karten (Legacy; neu: data/images/ zentral)
  quizpfad/
    index.html                  ← QuizPfad Spiel (Spielwähler + Setup + Board + Modals)
    view.html                   ← Schüleransicht (SSE-Live, Code-Beitritt, Mini-Board)
    admin.html                  ← Verweis auf zentrale Fragendatenbank (admin.html)
    js/
      quizpfad.js               ← Spiellogik (QpStorage, Board, Teams, Runden, Bonus)
      quizpfad-admin.js         ← Editor-Logik (Fragen CRUD, MD-Import) — Legacy
    css/
      quizpfad.css              ← Styles (Brettspiel Classic, responsive, gs-* Spielwähler)
  escape-room/
    index.html                  ← Escape Room (Admin + Spieler, alles inline) — Lehrkraft-Version
    standalone.html             ← Escape Room (Schüler/Offline, kein Passwort, kein 360°)
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
  just-one/
    index.html                  ← Just One Lehrkraft (Spielwähler + Setup + Kategorien + Moderation)
    view.html                   ← Schülergerät (Beitritt, Warteraum, Hinweis-Eingabe / Rater-Ansicht)
    board.html                  ← Tafelansicht (viewer-gefiltert, Sentinel '*')
    admin.html                  ← Eigener Begriffs-Editor (Kategorien/Unterkategorien, MD-Import)
    js/
      shared.js                 ← JoStorage (Spielverwaltung, mutate/CAS, Viewer-Filterung)
      game.js                   ← Lehrkraft-Logik (Setup, Rundenablauf, Moderation, Scoring)
      play.js                   ← Schülergerät-Logik (Beitritt, Kick-Erkennung, Hinweise, Raten)
      board.js                  ← Tafel-Rendering
      round-shared.js           ← Rundenlogik-Helfer (Duplikat-Erkennung, Bewertungsskala)
      wordlist-shared.js        ← JoWordlistStorage + JoWordlistModel + JoWordlistMDParser
      admin.js                  ← Begriffs-Editor-Logik
    css/
      just-one.css              ← Basis-Styles (Standard Orange/Dunkelblau)
      game.css                  ← Spielwähler/Setup/Lobby/Runden-Styles
      admin.css                 ← Begriffsverwaltungs-Styles
  insider/
    index.html                  ← Insider Lehrkraft (Spielwähler + Setup + Kategorien + Moderation)
    view.html                   ← Schülergerät (Beitritt, Rollenkarte, Timer, Abstimmung)
    board.html                  ← Tafelansicht (viewer-gefiltert, Sentinel '*')
    admin.html                  ← Verweis auf just-one/admin.html (gemeinsame Begriffs-DB)
    js/
      shared.js                 ← InStorage (Duplikat von JoStorage, Prefix in-)
      round-shared.js           ← Timer-Helfer (game/play/board)
      vote-shared.js            ← Abstimmungs-Helfer — auch von Hochstapler eingebunden!
      game.js                   ← Lehrkraft-Logik (Rollen, Timer, Abstimmung, Auflösung)
      play.js                   ← Schülergerät-Logik (Beitritt, Rollenkarte, Stimmabgabe)
      board.js                  ← Tafel-Rendering
    css/
      insider.css               ← Alle Styles (Standard Orange/Dunkelblau)
  hochstapler/
    index.html                  ← Hochstapler Lehrkraft (Spielwähler + Setup + Kategorien + Moderation)
    view.html                   ← Schülergerät (Beitritt, Wort-/Rollenkarte, Abstimmung)
    board.html                  ← Tafelansicht (viewer-gefiltert, Sentinel '*')
    admin.html                  ← Verweis auf just-one/admin.html (gemeinsame Begriffs-DB)
    js/
      shared.js                 ← HsStorage (Duplikat von JoStorage, Prefix hs-)
      game.js                   ← Lehrkraft-Logik (Rollen, Hinweisrunden, Abstimmung, letzte Chance)
      play.js                   ← Schülergerät-Logik (Beitritt, Rollenkarte, Stimmabgabe)
      board.js                  ← Tafel-Rendering
    css/
      hochstapler.css           ← Alle Styles (Duplikat von insider.css + Sprechreihenfolge)
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
| `lernkarten/index.html` | Light (Orange Standard) | `body.dark` |
| `just-one/index.html` / `view.html` / `board.html` / `admin.html` | Light (Orange Standard) | `body.dark` |
| `insider/*` und `hochstapler/*` (alle Seiten) | Light (Orange Standard) | `body.dark` |

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

> **Standard-Farbpalette für neue Spiele: Orange (Light) + Dunkelblau (Dark)**
> Neue Spiele sollen diese Palette verwenden, sofern kein spielspezifischer Grund dagegen spricht.

**Standard Light Theme (Orange — `spiele.html`, `lernkarten/`, neue Spiele):**
```css
/* Hintergrund */
--bg-body:         linear-gradient(135deg, #f7971e 0%, #E34F20 100%)
--bg-container:    #ffffff
--bg-card:         #f8f9fa
--bg-card-back:    #fff3ee        /* Karten-Rückseite / Highlights */
--bg-option:       #fff3ee
--bg-option-hover: #ffe0d0

/* Akzentfarben */
--accent:          #E34F20        /* Orange-Rot (primär) */
--accent-dark:     #c73518        /* Dunkleres Orange-Rot (Hover/aktiv) */
--accent-light:    #f7971e        /* Helles Orange (Gradient-Start) */

/* Text */
--text-primary:    #1e293b
--text-secondary:  #64748b

/* Struktur */
--border:          #e0e0e0
--card-hover-border: #E34F20
--card-shadow-hover: 0 12px 35px rgba(227,79,32,0.2)
--shadow:          0 4px 20px rgba(227,79,32,0.12)
--tag-bg:          #ffe8df
--tag-color:       #c73518

/* Button */
--btn-play-bg:     linear-gradient(135deg, #f7971e 0%, #E34F20 100%)

/* Status */
--success:         #16a34a
--danger:          #dc2626
--warning:         #d97706
```

**Standard Dark Theme (Dunkelblau — `body.dark` für neue Spiele):**
```css
--bg-body:         linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)
--bg-container:    #16213e
--bg-card:         #1a2744
--bg-card-back:    #0f3460
--bg-option:       #1a2744
--bg-option-hover: #1a4a80
--accent:          #f7971e        /* Helles Orange im Dunkelmodus */
--accent-dark:     #E34F20
--text-primary:    #ffffff
--text-secondary:  #a8a8b3
--border:          rgba(255,255,255,0.12)
--success:         #2ecc71
--danger:          #e74c3c
--warning:         #f39c12
--shadow:          0 4px 20px rgba(0,0,0,0.30)
```

**Risiko-Quiz Dark Theme (`:root` in game.css + admin.css — spielspezifisch):**
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

**Risiko-Quiz Light Mode Overrides (body.light in CSS-Dateien):**
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

## Rich-Content: Formeln + Bilder (alle Spiele)

Alle Inhaltsfelder (Fragen, Optionen, Antworten, Hints, Begriffe, Kategorien,
Rätselkarten, Notizen) bleiben **reine Strings**; beim Rendern interpretiert
das gemeinsame Modul `js/rich-content.js` Inline-Marker:
`$...$` (KaTeX inline, kein Leerzeichen direkt nach/vor dem `$`),
`$$...$$` (display), `![Alt](data/images/… oder https://…)` (Bild, src wird
geklemmt), `\$`/`\|` (literale Zeichen). Reine Text-Strings bleiben gültig —
keine Migration.

**Regeln für neuen/geänderten Code:**
- Anzeige IMMER über `renderRichContent(str)` (escaped Text selbst — nie
  zusätzlich escapen, nie rohes `innerHTML = str`). Für Stellen ohne HTML
  (Codenames-Karten, Duplikat-Vergleiche): `richToPlainText(str)`.
- Einbindung pro Seite: `<script src="…/lib/katex/katex.min.js">` +
  `<script src="…/js/rich-content.js">` (Pfadtiefe beachten). Das KaTeX-CSS
  injiziert das Modul selbst; ohne KaTeX degradieren Formeln zu Quelltext.
- Editoren: Upload via `rcUploadImage(file)` (POST `?f=image-upload`,
  Admin-Token, Ablage `data/images/`, kein SVG, max 2 MB), Live-Vorschau via
  `rcBindPreview(input, previewEl)`. **Kein Base64 in Datenbanken.**
- Schülerseite `vorschlaege.html`: Upload über den OFFENEN Endpunkt
  `?f=draft-image-upload` (Prefix `imgv_`, Mengendeckel 200, HTTP 429 bei
  vollem Kontingent) — das Admin-Token gehört nicht in Schülerseiten.
- MD-Dialekte mit `|`-Trennern: Inhalte escapen `|` als `\|`
  (`MDParser._splitEscapedPipes`-Muster, Roundtrip bleibt verlustfrei).
- Bildverwaltung (Liste/Löschen): zentrale `admin.html` → Karte
  „🖼 Bildverwaltung" (`?f=images`, `?f=image` DELETE).

---

## Zentrale Fragendatenbank

### Prinzip
Alle fragenbasierten Spiele nutzen eine **gemeinsame Fragendatenbank**: `data/questions.json`.
Das Risiko-Quiz-Format ist das Master-Format. Spiele, die ein anderes internes Format benötigen, konvertieren beim Laden automatisch.

**Bei der Implementierung eines neuen Spiels MUSS nachgefragt werden**, ob die zentrale Fragendatenbank verwendet werden soll. Standardmäßig ja — Ausnahmen nur, wenn die Spielmechanik ein grundlegend anderes Datenformat erfordert (z.B. Paare statt Fragen).

### Nutzer der zentralen DB

| Spiel | Konvertierung | Admin |
|-------|--------------|-------|
| Risiko-Quiz | Nativ (Master) | Zentrale `admin.html` (Root-Ebene) |
| QuizPfad | `convertRQtoQuizPfad()` | Verweist auf Risiko-Quiz Admin |
| Labyrinth-Quiz | `convertRQtoLabyrinth()` | Verweist auf Risiko-Quiz Admin |
| Leiterspiel-Quiz | `convertRQtoLeiterspiel()` | Verweist auf Risiko-Quiz Admin |

### Spiele mit eigener Datenbank (spielmechanikbedingt)

| Spiel | Eigene DB | Grund |
|-------|-----------|-------|
| Memory | `memory/data/pairs.json` | Paare (sideA/sideB) statt Fragen |
| Stadt Land Fluss | `categories.json` | Kategorienamen statt Fragen |
| Escape Room | localStorage | Raumgebundene Fragen mit Codes/Hotspots |
| Just One | `data/just-one/wordlists.json` | Offener Begriffs-Pool statt Fragen; Codenames-Wortlisten bewusst nicht wiederverwendet (dort fest auf 25 Wörter) |
| Insider | **teilt** die Just-One-Begriffs-DB | Braucht einzelne Geheimwörter; `wordlist-shared.js` wird per `<script src>` eingebunden, kein eigener Editor (admin.html = Verweis auf `just-one/admin.html`) |
| Hochstapler | **teilt** die Just-One-Begriffs-DB | wie Insider |

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
- **Im Lehrermodus**: Button "📋 Fragendatenbank" im Header von `spiele.html` → öffnet `admin.html`
- **Eigene Seite**: `admin.html` (Root-Ebene) — eigenständiger Frageneditor, unabhängig von einzelnen Spielen
- **Einzelne Spiele**: Haben keinen eigenen "Fragen"-Button mehr in `spiele.html`; Admin-Seiten verweisen auf `admin.html`
- Nutzt `risiko-quiz/js/shared.js` (StorageManager, GameModel, MDParser) und `risiko-quiz/css/admin.css` für Styling

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
Jedes Spiel, das die zentrale DB nutzt, bietet im Setup-Screen eine **Kategorieauswahl** an.
Fertige Kopiervorlage: `_templates/spielverwaltung/cat-selector.html/.js/.css`

**Verhalten:**
- Oberkategorien (Top-Level aus `questions.json`) standardmäßig **eingeklappt**
- Klick auf Oberkategorie → klappt auf und zeigt Unterkategorien
- Unterkategorien einzeln an/ab-wählbar (Blatt-Ebenen)
- Gruppen-Checkbox im Header → alle Unterkategorien der Gruppe an/aus
- „Alle" / „Keine" Buttons für Gesamt-Toggle
- Info-Zeile zeigt Anzahl Fragen + Kategorien; wird rot bei 0 Fragen

**JS-Voraussetzungen im Spiellogik-JS:**
```js
let rawCategories    = [];          // questions.json .categories (Hierarchie, unverändert)
let allQuestions     = [];          // flach konvertiert, jede Frage mit .kategorieId
let activeCategories = new Set();   // gewählte Blatt-Kategorie-IDs
```
`rawCategories` direkt aus `questionsJson.categories` befüllen (keine Konvertierung nötig).
`allQuestions` via spielspezifische `convertRQ…()`-Funktion; `.kategorieId` muss die Blatt-ID sein.

**CSS-Variablen:** Variante A (Leiterspiel: `--bg-sidebar`/`--bg-field`/`--border`) und
Variante B (Labyrinth: `--bg-secondary`/`--bg-card`/`--border-card`) — im CSS mit
`← Var-A` / `← Var-B` markiert.

---

## Multi-Game Architektur (Paralleles Spielen)

Spiele, die paralleles Spielen unterstützen, verwenden das **Spielverwaltungs-Muster** — vollständig beschrieben in `→ ## Spielverwaltung` weiter unten.

### Spiele mit Spielverwaltung
| Spiel | Spielverwaltung | Schüleransicht |
|-------|----------------|----------------|
| Risiko-Quiz | Ja (admin.html Spielwähler) | view.html via SSE |
| Leiterspiel-Quiz | Ja (index.html Spielwähler) | view.html via SSE |
| QuizPfad | Ja (index.html Spielwähler, `qp-` prefix) | view.html via SSE (Zuschauer) |
| Labyrinth-Quiz | Nein — Einzelspiel | — |
| Memory | Nein — Singleplayer | — |
| Escape Room | Nein — eigenes Multi-Team-System | — |
| Just One | Ja (index.html Spielwähler, `jo-` prefix, offenes Spieler-Roster statt fixer Teams) | view.html via SSE (aktiv mitspielend) + board.html (Tafel, viewer-gefiltert) |
| Insider | Ja (index.html Spielwähler, `in-` prefix, offenes Spieler-Roster) | view.html via SSE (Rollen + Abstimmung) + board.html (Tafel, viewer-gefiltert) |
| Hochstapler | Ja (index.html Spielwähler, `hs-` prefix, offenes Spieler-Roster) | view.html via SSE (Rollen + Abstimmung) + board.html (Tafel, viewer-gefiltert) |

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
- KaTeX kommt aus dem zentralen `lib/katex/` (früher `memory/lib/katex/`);
  Text/Formeln rendern über `js/rich-content.js`, der Bild-Typ behält das
  Legacy-Verhalten (beliebige URL/Pfad, Bestandsdaten!)
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
- Admin verweist auf zentrale Fragendatenbank (`admin.html`)
- **Spielverwaltung**: `QpStorage` mit `qp-` Prefix, Spielwähler in `index.html`, Schüleransicht `view.html`
- API-Endpunkte: `qp-games`, `qp-game`, `qp-sse` in `api.php`; Spielstände in `data/games/quizpfad/`
- Schüleransicht `view.html`: Zuschauerrolle — zeigt Board, aktive Teams, laufende Fragen (kein eigenes Antworten)

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

## Kritisches Muster: True-Leaf-Erkennung in Kategoriehierarchien

**Problem (wiederkehrender Bug)**: Der Risiko-Quiz Admin erlaubt bis zu 4 Ebenen (`createSubSubcategory`, `createLevel4`). Dabei entstehen Knoten mit **sowohl `questions` als auch `subcategories`**. Einfache `if (hasQuestions)`-Checks erkennen solche Knoten als Blatt, obwohl sie auch Unterknoten haben.

**Symptom**: Kategorie-IDs in der Auswahl stimmen nicht mit `kategorieId` in den Fragen überein → manche Kategorien werden nie angezeigt, obwohl Fragen vorhanden sind.

**Regel**: Ein Knoten ist genau dann ein Blatt, wenn `questions.length > 0 && (subcategories || []).length === 0`.

**Alle fünf betroffenen Funktionen** müssen dieselbe Prüfung verwenden:
```js
const subs = node.subcategories || [];
const isLeaf = !subs.length;
if (hasQuestions && isLeaf) { /* Blatt verarbeiten */ return; }
subs.forEach(s => walk(s, ...));
```

Dieses Muster trat in `collectLeafCategories` / `walk` in allen drei Spiele-Konvertierungen auf (Labyrinth, Leiterspiel, QuizPfad) sowie in den dazugehörigen `_buildCatNode`, `allLeaves`, `_countLeafQ` Funktionen.

---

## Kritisches Muster: IIFE-Scope in Single-File-Apps

**Problem (wiederkehrender Bug)**: In Single-File-Apps wird die gesamte Spiellogik in eine IIFE gepackt: `(async function() { ... })()`. Funktionen darin sind **nicht** aus inline `onclick="..."` Attributen erreichbar (globaler Scope). Nur `window.xxx = function()` Exports sind global zugänglich.

**Symptom**: Inline-Click-Handler rufen eine Funktion auf → kein Fehler, nichts passiert → schwer zu debuggen.

**Lösung**: Niemals IIFE-interne Funktionen aus `onclick="..."` aufrufen. Stattdessen Seiteneffekte in einen `window.`-Export verschieben, der dann innerhalb der IIFE ausgeführt wird.

```js
// FALSCH — renderRoomExplorer ist in der IIFE, nicht global:
// <button onclick="renderRoomExplorer(room)">Weiter</button>

// RICHTIG — closeHotspotModal ist window-exportiert und ruft intern renderRoomExplorer auf:
window.closeHotspotModal = function() {
  document.getElementById('hotspot-modal').classList.add('hidden');
  if (explorerMode && currentGame) renderRoomExplorer(currentGame.rooms[currentRoomIdx]);
};
// <button onclick="closeHotspotModal()">Weiter</button>
```

Dieses Muster trat im Escape Room mehrfach auf (Note-Voraussetzungen, Rätsel-Voraussetzungen, Explorer-Re-Render).

---

## Escape Room

### Architektur
- **Zwei Dateien**: `escape-room/index.html` (Lehrkraft-Version) und `escape-room/standalone.html` (Schüler/Offline)
  - `index.html`: Admin-Passwortschutz, Publish-System, Test-Modus, 360°-Panorama (CDN)
  - `standalone.html`: Kein Passwort, kein Löschen-Button, kein 360°; ansonsten identisch
- Kein Server nötig — rein localStorage-basiert
- Admin-Modus über URL-Parameter: `?admin=true`; Spieler-Modus: ohne Parameter (Standard)
- Multiple Games: Lehrkraft erstellt mehrere Spiele, Schüler wählen aus
- Mehrere Teams können gleichzeitig auf verschiedenen Geräten dasselbe Spiel spielen
- Google Fonts: Cinzel (Überschriften), Crimson Text (Fließtext)
- Alle Styles und JS inline; kein Build-System

### Admin-Authentifizierung (nur `index.html`)
- Passwort: `LP_PASSWORD = 'LP@FOS'` (Hardcoded)
- Gespeichert in `sessionStorage` mit Key `spiele_lp_mode = '1'`
- **Publish-System**: Spiele haben `published: boolean`; Spieler sehen nur publizierte Spiele
  - `togglePublish(gameId)` wechselt den Status; UI zeigt "Veröffentlicht" / "Entwurf"
- **Test-Modus**: `isTestMode` Flag + gelbes Banner — Admin kann als Spieler vorschauen ohne Navigationswechsel
  - `testGame(id)` startet Test, `exitTestMode()` kehrt zurück

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
  "published": true,
  "game": { "title": "...", "description": "...", "totalTimer": 2400, "mode": "chain|single" },
  "rooms": [{
    "id": "room_1", "name": "...", "subject": "...", "description": "...",
    "backgroundImage": "", "backgroundType": "flat|360",
    "unlockCode": "4823", "lockType": "padlock|digital",
    "puzzleCard": { "type": "text|image", "content": "..." },
    "questions": [{
      "id": "q1", "type": "multiple_choice|text_input|number_code",
      "text": "...", "options": [], "correctAnswer": "...",
      "caseSensitive": false, "hint": "", "codeDigit": "4"
    }],
    "hotspots": [{
      "id": "hs_...", "type": "puzzle|note|exit",
      "label": "...", "icon": "🔍",
      "x": 50, "y": 30,
      "color": "#d4a853",
      "requires": ["hs_other_id"],
      "codeDigit": "3",
      "questionIds": ["q1", "q2"],
      "noteText": "Nur bei type=note: Freitext"
    }]
  }]
}
```
Modi: `chain` (Räume der Reihe nach), `single` (frei wählbar)

`lockType`: `padlock` = Rad-Schloss (Ziffern scrollen), `digital` = Tastatur-Eingabe (PIN)

`puzzleCard`: Hinweiskarte, die Spieler sehen bevor sie den Code eingeben — enthält Lösungshinweise aus den Hotspots

### Explorer-Modus (Hotspot-Raum)
Ein Raum wechselt automatisch in den Explorer-Modus, wenn er `hotspots` enthält (und optionales `backgroundImage`).

- Spieler sehen ein Hintergrundbild (oder Fallback-Fläche) mit klickbaren Hotspots
- **`puzzle`-Hotspots**: Enthalten Fragen → alle richtig beantworten → Hotspot gilt als gelöst; hat `codeDigit`
- **`note`-Hotspots**: Zeigen nur einen Freitext (`noteText`) — kein Code, keine Fragen; als "gelesen" markiert nach Klick
- **`exit`-Hotspot**: Nur klickbar, wenn alle Puzzle-Hotspots gelöst → führt zum Padlock
- Gelöste/gelesene Hotspots zeigen bei erneutem Klick eine Zusammenfassung (Hilfe für Rätselkarte)
- **Dynamisches Seitenverhältnis**: `window._applyImgRatio(img)` liest `naturalWidth/naturalHeight` und setzt `container.style.aspectRatio` → Portrait- und non-16:9-Bilder werden korrekt angezeigt

### Hotspot-Abhängigkeiten (`requires`)
- Hotspots können `requires: [hsId, ...]` setzen — sie sind unsichtbar, bis alle Voraussetzungen erfüllt sind
- `isHotspotVisible(hs, progress)` prüft `isHotspotCompleted()` für jeden Voraussetzungs-Hotspot
- `isHotspotCompleted(hs, progress)`: puzzle → `isHotspotSolved()`; note → `readNotes.includes(hs.id)`; exit → immer true
- **Wichtig**: Nach dem Lösen eines Hotspots muss `renderRoomExplorer()` neu aufgerufen werden, damit abhängige Hotspots erscheinen

### Hotspot-Farbe
- Jeder Hotspot hat ein optionales `color: "#hexcolor"` Feld (Standard: `#d4a853` Gold)
- `hexToRgba(hex, alpha)` konvertiert zu `rgba(...)` für Border, Hintergrund, Label und `--gold-glow` CSS-Variable
- Im Admin: Color-Picker `<input type="color">` pro Hotspot in der Hotspot-Liste
- Gelöste Hotspots ignorieren die custom color (behalten grünes CSS-Klassen-Styling)

### Hotspot-Bewegung im Admin (Tablet-freundlich)
- **Drag**: Klassisches Drag mit 5px-Threshold (`_hsMarkerDragging`) — Desktop
- **Tap-to-Select**: Hotspot antippen → wählt aus (amber pulsierender Ring, `.selected` Klasse) → leere Stelle antippen → verschiebt dorthin
  - `_selectedHsMove = { rIdx, hsIdx }` Zustand
  - `preview[data-moving]::after` zeigt Banner "Neue Position antippen"
  - Zweites Antippen desselben Hotspots → Auswahl aufheben
  - Kein Konflikt mit Neu-Erstellen: Auswahl wird zuerst geprüft

### Verlassen-Button
- `<button class="leave-game-btn hidden" id="leave-game-btn">← Verlassen</button>` — `position: fixed; top: 16px; left: 16px`
- Sichtbar bei Game-Views: `view-room-select`, `view-room-intro`, `view-room-questions`, `view-room-explorer`, `view-code-reveal`, `view-room-unlock`
- `window.confirmLeaveGame()` zeigt `confirm()`-Dialog → stoppt Timer, kehrt zu `view-player-home` zurück; Fortschritt bleibt erhalten

### MD-Import Format
```markdown
# Spieltitel
- timer: 30         ← Minuten
- modus: kette      ← kette|einzeln
- beschreibung: ...

## Raumname
- fach: Physik
- beschreibung: ...
- code: 4823        ← Unlock-Code (auto-generiert wenn weggelassen)
- schloss: padlock  ← padlock|digital
- bild: https://...  ← Hintergrundbild URL (flat oder Equirectangular für 360°)
- panorama: true    ← Aktiviert 360°-Modus (Pannellum), Synonyme: 360, typ360
- rätselkarte: Hinweistext für die Rätselkarte

### Hotspots
- 🔍 | Bücherregal | 20 | 40 | 3 | 1,2   ← icon|label|x%|y%|codeDigit|questionIds
- 📝 | Notizzettel | 30 | 60 |           ← note-Hotspot (kein codeDigit/questionIds)
- 🚪 | Ausgang     | 80 | 50            ← exit-Hotspot (kein codeDigit/questionIds)

### Fragen
- mc | Fragetext | Opt1 | Opt2 | Opt3 | Opt4 | RichtigeAntwort | Hinweis | Ziffer
- text | Fragetext | Antwort | Hinweis | Ziffer
- zahl | Fragetext | 42 | Hinweis | Ziffer

### F1: mc
- frage: Fragetext
- optionen: A | B | C | D
- antwort: A
- hinweis: Tipp
- ziffer: 4
```

### 360°-Panorama-Modus
Ein Raum wechselt in den 360°-Modus wenn `backgroundType: "360"` gesetzt ist.

- Renderer: **Pannellum** (CDN `pannellum@2.5.6`) — Equirectangular-Bild in `backgroundImage`
- Hotspots: selbe `x/y` (0–100%) wie im Flat-Modus, werden mit `toYawPitch(x,y)` konvertiert
  - `yaw = (x/100 * 360) - 180`
  - `pitch = -((y/100 * 180) - 90)`
- Admin: Checkbox "360° Panorama" im Raum-Editor, Hotspot-Platzierung auf Equirectangular-Vorschau (gleiche Koordinaten)
- `pnlmViewer` (global) wird bei `destroyPnlmViewer()` aufgeräumt (aufgerufen in `renderRoomExplorer` + `goToPadlock`)
- Kein 360°-Support in `standalone.html` (braucht CDN)

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
- Admin verweist auf zentrale Fragendatenbank (`admin.html`)
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

## Exklusiver Team-Beitritt

**Zweck:** Jedes Team kann nur von einem Gerät gleichzeitig gewählt werden. Spielleiter kann Spieler entfernen (z.B. nach Fenster-Schließen), sodass das Team wieder verfügbar wird. Spieler wird dabei automatisch zur Teamwahl zurückgeleitet und sein localStorage-Eintrag gelöscht.

**Referenz-Implementierung:** `Labyrint-Quiz/js/play.js` + `Labyrint-Quiz/js/labyrinth.js`

### Spielstand-Feld

```json
{ "takenTeams": [0, 2] }
```

Array von Team-IDs (= Array-Indizes `0,1,2,...`). Wird von der **Spieler-Seite** geschrieben, vom **Spielleiter** zum Kick bearbeitet.

---

### Spieler-Seite

**`selectTeam(id)` — mit Race-Condition-Schutz:**
```js
async function selectTeam(id) {
  // Frischen Stand laden; remoteState als Fallback wenn Load fehlschlägt
  const fresh = (await GameSync.load(gameCode)) || remoteState;
  if (!fresh) return;
  const taken = new Set(fresh.takenTeams || []);
  if (taken.has(id)) { remoteState = fresh; showTeamSelect(fresh); return; }
  taken.add(id);
  const newState = JSON.parse(JSON.stringify(fresh));
  newState.takenTeams = [...taken];
  await GameSync.save(gameCode, newState);
  remoteState = newState;
  myTeamId = id;
  localStorage.setItem('SPIEL_myteam_' + gameCode, id);
  startPlayView();
}
```

**Kick-Erkennung in `onRemoteUpdate` — ganz am Anfang, vor allen anderen Checks:**
```js
if (myTeamId !== null && Array.isArray(data.takenTeams) &&
    !data.takenTeams.includes(myTeamId)) {
  handleKicked(); return;
}
```
Nur wenn `Array.isArray(data.takenTeams)` → alte Spielstände ohne das Feld lösen keinen falschen Kick aus.

**`handleKicked()`:**
```js
function handleKicked() {
  clearTimer();
  document.getElementById('question-modal')?.classList.remove('active');
  GameSync.unsubscribe();
  localStorage.removeItem('SPIEL_myteam_' + gameCode);  // eigenes LS löschen
  myTeamId = null;
  // Kurze Meldung, dann zurück zur Teamwahl
  setTimeout(async () => {
    const state = await GameSync.load(gameCode);
    if (state?.meta) { remoteState = state; showTeamSelect(state); }
    else showScreen('join-screen');
  }, 1500);
}
```

**`showTeamSelect(state)` — belegte Teams deaktiviert:**
```js
function showTeamSelect(state) {
  showScreen('team-select-screen');
  const taken = new Set(state.takenTeams || []);
  state.teams.forEach(t => {
    const isTaken = taken.has(t.id);
    const btn = document.createElement('button');
    btn.className = 'team-select-btn' + (isTaken ? ' taken' : '');
    btn.disabled = isTaken;
    btn.innerHTML = `${t.emoji} ${t.name}${isTaken ? ' <span class="ts-taken">belegt</span>' : ''}`;
    if (!isTaken) btn.onclick = () => selectTeam(t.id);
    list.appendChild(btn);
  });
}
```

**Auto-Wiederverbindung in `joinGame()` — gespeicherte Teamwahl aus localStorage:**
```js
const saved = localStorage.getItem('SPIEL_myteam_' + code);
if (saved !== null) {
  const tid = parseInt(saved, 10);
  if (state.teams[tid]) { myTeamId = tid; startPlayView(); return; }
}
showTeamSelect(state);
```

---

### Spielleiter-Seite

**`renderTeamList()` — Verbindungsanzeige + Kick-Button:**
```js
const taken = new Set(gameState.takenTeams || []);
gameState.teams.forEach(t => {
  const isTaken = taken.has(t.id);
  const connDot = isTaken ? '<span class="team-conn-dot" title="Gerät verbunden">●</span> ' : '';
  // name-Zeile: connDot + t.name
  if (isTaken) {
    const kickBtn = document.createElement('button');
    kickBtn.className = 'team-kick-btn';
    kickBtn.title = 'Gerät trennen (Team freigeben)';
    kickBtn.textContent = '✕';
    kickBtn.onclick = e => { e.stopPropagation(); kickTeam(t.id); };
    div.appendChild(kickBtn);
  }
});
```

**`kickTeam(teamId)`:**
```js
async function kickTeam(teamId) {
  if (!gameState || !gameCode) return;
  const newState = JSON.parse(JSON.stringify(gameState));
  newState.takenTeams = (newState.takenTeams || []).filter(id => id !== teamId);
  gameState = newState;
  await GameSync.save(gameCode, newState);
  renderTeamList();
}
window.kickTeam = kickTeam;
```

---

### CSS-Klassen

**Spieler-Seite (play.html / view.html):**
```css
.team-select-btn.taken         { opacity: 0.45; cursor: not-allowed; }
.team-select-btn.taken:hover   { border-color: var(--border-card); background: var(--bg-card); }
.ts-taken                      { font-size: 0.8rem; font-weight: 600; color: var(--danger); margin-left: 0.4rem; }
```

**Spielleiter-Seite (labyrinth.css o.ä.):**
```css
.team-conn-dot  { color: #4ade80; font-size: 0.55rem; vertical-align: middle; }
.team-kick-btn  { background: none; border: 1px solid rgba(220,38,38,0.35); color: rgba(220,38,38,0.6);
                  border-radius: 4px; width: 20px; height: 20px; padding: 0; cursor: pointer; font-size: 0.65rem; }
.team-kick-btn:hover { background: rgba(220,38,38,0.15); border-color: #dc2626; color: #dc2626; }
```

---

## Schnelle Client-seitige Synchronisation (Schiffeversenken-Muster)

**Problem:** Klassischer SSE-Flow für MC-Fragen braucht zwei Round-Trips:
1. Spieler speichert Antwort → Server
2. Lehrkraft-View empfängt → verarbeitet → speichert → Server
3. Alle Views empfangen Ergebnis

Bei 300–1000ms Poll-Intervall ergibt das ~1–2s Latenz.

**Lösung: Direkte Client-Verarbeitung**

Für **automatisch auswertbare Aktionen** (MC-Fragen, Timer-Ablauf) verarbeitet die Spieler-View das Ergebnis **lokal** und speichert den Endzustand direkt — ohne Umweg über die Lehrkraft-View.

```
ALT: view.html → save(autoCorrect) → index.html empfängt → processShot → save(lq=null) → alle Views
NEU: view.html → processShot lokal → save(lq=null) direkt → alle Views
```

**Implementierung (Schiffeversenken `view.html`):**

```js
async function submitMCAnswer(idx) {
  const lq = remoteState.liveQuestion;
  const correct = idx === lq.question.correctIndex;

  // 1. Ergebnis sofort visuell anzeigen (kein Warten auf Server)
  showResult(correct);

  // 2. Vollständige Spiellogik lokal ausführen
  const ns = deepCopy(remoteState);
  ns.liveQuestion = null;
  if (correct) applyShot(ns, lq);         // Grid updaten
  checkElimination(ns, lq);               // Schiff/Team-Status
  advanceTurn(ns, lq);                    // Nächster Zug / Sieger
  ns.usedQuestionIds.add(lq.question.id);

  // 3. Fire-and-forget save — blockiert UI nicht
  remoteState = ns;
  BsStorage.save(ns);                      // kein await

  // 4. Kurze Ergebnisanzeige, dann Grid rendern
  setTimeout(() => { hideOverlay(); renderGameView(); }, 1500);
}
```

**Guards:**
- `submittingShot = true` am Anfang, `false` nach dem Timeout → verhindert Doppelklick
- `if (submittingShot) return` in `onRemoteUpdate` → verhindert Re-Render während Ergebnisanzeige
- `if (processingShot) return` in Lehrkraft-View `onStateUpdate` → verhindert State-Override während Verarbeitung

**Poll-Intervall:** 300ms statt 1000ms (in `BsStorage.subscribe → startPoll`)

**Für Lehrkraft-View (offene Fragen):**
- `onStateUpdate` zeigt Modal nur für offene Fragen (`!isMC`)
- Offene Fragen laufen weiterhin über Teacher-Round-Trip (nötig, da manuelle Bewertung)

**`advanceTurn(ns, lq)` — Singleplayer-aware:**
```js
function advanceTurn(ns, lq) {
  if (ns.soloMode) {
    if (!ns.teams.some(t => t.id !== lq.teamIdx && !t.eliminated))
      { ns.phase = 'finished'; ns.winner = lq.teamIdx; }
    // sonst: Spieler immer dran (currentTurnIndex = 0)
  } else {
    const alive = ns.turnOrder.filter(id => !ns.teams[id].eliminated);
    if (alive.length <= 1) {
      ns.phase = 'finished'; ns.winner = alive[0] ?? null;
    } else {
      const prev = alive.indexOf(lq.teamIdx);
      ns.currentTurnIndex = ((prev >= 0 ? prev + 1 : ns.currentTurnIndex + 1)) % alive.length;
    }
  }
}
```

**Wann anwenden:**
- Immer wenn die Spieleransicht Aktionen direkt und vollständig auswerten kann
- MC-Fragen, Timer-Ablauf, automatische Regelprüfungen
- Nicht für: manuelle Lehrkraft-Entscheidungen (offene Fragen, Sonderfälle)

---

## Leiterspiel-Quiz

### Architektur
- Klassisches Leiterspiel (Snakes & Ladders) mit 100 Feldern (10×10 Grid)
- **Zentrale Fragendatenbank** mit Standard-Konvertierung (`convertRQtoLeiterspiel()`) — siehe Abschnitt "Zentrale Fragendatenbank"
- Admin verweist auf zentrale Fragendatenbank (`admin.html`)
- Einzel- und Mehrspielermodus

### Spielmechanik
- 5 Leitern: 4→14, 9→31, 21→42, 28→84, 51→67
- 5 Schlangen: 16→6, 47→26, 62→19, 93→73, 98→87
- Zeitlimits: leicht=30s, mittel=45s, schwer=60s
- Punkte: leicht=10, mittel=20, schwer=30

### Spielverwaltung + Schüleransicht
Nutzt das **Spielverwaltungs-Muster** → siehe `## Spielverwaltung`.
- Storage-Objekt: `LsStorage` (Prefix `ls-` / `ls_gs_`), inline in `leiterspiel.js` und `view.html`
- Spielwähler in `index.html` (erster Screen `#game-selector`)
- Schüler-App: `view.html` — Code eingeben, Team wählen, Würfeln, MC antworten
- Bonus-Felder (roll_again, free_move, swap) werden nur vom Lehrkraft-Device behandelt

---

## Just One

### Architektur
- Kooperatives Worträtsel: pro Runde eine Rater:in, alle anderen schreiben
  geheim je einen Ein-Wort-Hinweis; Duplikate werden automatisch gestrichen,
  die Lehrkraft kann weitere ungültige Hinweise manuell streichen
- **Eigene Begriffsdatenbank** (`data/just-one/wordlists.json`), nicht die
  zentrale Fragendatenbank und nicht die Codenames-Wortlisten (dort fest auf
  25 Wörter) — siehe Abschnitt "Zentrale Fragendatenbank →
  Spiele mit eigener Datenbank"
- Details, Rundenablauf, Sync-Besonderheiten: `docs/spiele/just-one.md`

### Viewer-gefilterter State (Just One, Insider, Hochstapler)
Die meisten Spiele synchronisieren denselben JSON-Zustand an jedes Gerät.
Just One filtert `currentRound.secretWord` serverseitig pro Betrachter
(`filterJoState()` in `api.php`, angewendet über einen optionalen
`$filterFn`-Parameter in `gameEndpoint()`/`sseStream()` — Zuordnung im
`$gameFilters`-Array, für alle übrigen Spiele-Prefixe `null`, also
unverändert). Client schickt `?playerId=…` (`JoStorage.setViewerId()`); die
Tafelansicht schickt den Sentinel `'*'` und wird dadurch immer wie die
Rater:in behandelt (Klasse könnte mitschauen).

Insider (`filterInsiderState`) und Hochstapler (`filterHsState`) nutzen
denselben Mechanismus mit einer Erweiterung: Dort schreiben **gefilterte**
Viewer während der Runde (Abstimmung per `mutate()`), daher stellt
`protectSecretRoundFields()` beim POST die Geheimfelder (`secretWord`,
`insiderId` bzw. `impostorIds`; `$gameProtectedFields`-Array) aus dem
gespeicherten Stand wieder her, solange `currentRound.num` übereinstimmt —
analog zum `takenTeams`-Merge. Neue Runden brauchen deshalb zwingend eine
neue `num`.

### Spielverwaltung + Schüleransicht
Nutzt das **Spielverwaltungs-Muster** (`jo-` Prefix) mit einer Abweichung:
**offenes Spieler-Roster** statt fixer Teamliste (`takenTeams`) — beliebig
viele Personen treten mit selbstgewähltem Namen bei, `playerId` in
`localStorage` (analog `codenames/game.js` `getOrCreatePlayerId`). Kick
entfernt aus `players[]` **und** `turnOrder[]`. Zusätzlich `board.html`
(Tafelansicht, viewer-gefiltert wie oben).

---

## Insider

### Architektur
- Deduktionsspiel (nach Oink Games): Master beantwortet mündliche
  Ja/Nein-Fragen zum Geheimwort, ein heimlicher Insider hilft mit; nach
  Erraten digitale Abstimmung „Wer war der Insider?"
- **Begriffe aus der Just-One-Begriffs-DB** (`wordlist-shared.js` per
  `<script src>` eingebunden, admin.html = Verweis auf `just-one/admin.html`)
- Spielverwaltung wie Just One (`in-` Prefix, offenes Roster), Rundenphasen
  `roleReveal → questioning → voting → voteClosed → resolved`
- Viewer-Filter + Geheimfeld-Schutz: siehe „Viewer-gefilterter State" oben
- Timer nur als `timerStartedAt`+`timerSec` im State, Restzeit lokal gerechnet
- Abstimmung: letzte Stimme schließt im selben `mutate()` (`vtCloseVote` in
  `insider/js/vote-shared.js`), Gleichstand → einmalige Stichwahl; Aufdecken
  nur durch die Lehrkraft (nur ihr Gerät kennt `insiderId`)
- Details: `docs/spiele/insider.md`

---

## Hochstapler

### Architektur
- Bluffspiel (Imposter-Prinzip): alle sehen das Geheimwort außer dem
  Hochstapler; mündliche Hinweisrunden in gemischter Sprechreihenfolge,
  dann digitale Abstimmung; enttarnter Hochstapler hat eine letzte Chance
  (Wort mündlich erraten, Lehrkraft wertet)
- **Begriffe aus der Just-One-Begriffs-DB**, Abstimmungs-Helfer aus
  `../insider/js/vote-shared.js` (Cross-Include wie `wordlist-shared.js`)
- Spielverwaltung wie Just One (`hs-` Prefix, offenes Roster), Rundenphasen
  `roleReveal → hinting → voting → voteClosed → (lastChance) → resolved`
- Optional 2 Hochstapler (Setup-Schalter, ab 5 Spieler:innen); der Filter
  reduziert `impostorIds` auf die eigene Id — sie kennen einander nicht
- Viewer-Filter + Geheimfeld-Schutz: siehe „Viewer-gefilterter State" oben
- Details: `docs/spiele/hochstapler.md`

---

## Spielverwaltung

**Wann sinnvoll?** Wenn mehrere Klassen/Gruppen das Spiel gleichzeitig auf eigenen Geräten spielen sollen (parallele Sessions) — und/oder Schüler auf eigenen Geräten aktiv mitspielen. Beim Implementieren eines neuen Spiels **nachfragen**.

Referenz-Implementierungen: Risiko-Quiz (`admin.html` + `shared.js`), Leiterspiel-Quiz (`index.html` + `leiterspiel.js`).

**Kopiervorlagen** für neue Spiele in `_templates/spielverwaltung/`:
| Datei | Inhalt |
|-------|--------|
| `gs-selector.html` | HTML-Block Spielwähler-Screen (admin.html-Stil, mit Card-Wrapper) |
| `index-selector.html` | HTML-Block Spielwähler-Screen (index.html-Stil, kein Card-Wrapper) |
| `gs-styles.css` | Alle `.gs-*` CSS-Regeln (kanonisch, Variante A + B) |
| `XxxStorage.js` | Storage-Objekt mit API + localStorage-Fallback |
| `game-manager.js` | Spielwähler-JS (createNewGame, _gsEnter, _gsDelete, …) |
| `cat-selector.html` | HTML-Block Kategorieauswahl (Setup-Screen) |
| `cat-selector.js` | Kategorieauswahl-JS (buildCategoryUI, toggleAllCategories, …) |
| `cat-selector.css` | Kategorieauswahl-CSS (Akkordeon, Variante A + B) |

→ `_templates/README.md` erklärt die Checkliste und Regeln für die Integration.

---

### Einheitlicher Spielwähler-Look (verbindliche Regel)

**Überall, wo dieselbe Spiel-erstellen-Logik verwendet wird** (Spielwähler:
Code-Beitritt + Spielliste + „+ Neues Spiel erstellen"), **sieht der
Startscreen auch gleich aus** — Risiko-Quiz-Optik über die gemeinsame Datei
`css/spielwaehler.css` (Hell- und Dunkel-Palette fest eingebaut, unabhängig
von der Farbwelt des Spiels; die eigene Spiel-Palette gilt erst NACH dem
Spielwähler). Einbindung pro Spiel:

1. `<link rel="stylesheet" href="../css/spielwaehler.css">` (nach der Spiel-CSS)
2. Selector-Screen bekommt die Klasse **`gs-screen`** und das kanonische
   gs-Markup (`gs-container` → `gs-header`/`gs-body`; Referenz:
   `just-one/index.html`)
3. Dunkel-Zuordnung: Seiten mit Shared-Theme wie gehabt über `body.dark`;
   Seiten mit eigenem Theme-System (Codenames) spiegeln ihren Dunkelzustand
   zusätzlich als `body.gs-theme-dark`.

Umgestellt: QuizPfad, Leiterspiel, Schiffeversenken, Just One, Insider,
Hochstapler, Codenames; Referenz-Optik ist der Risiko-Quiz-Spielwähler
(`risiko-quiz/admin.html`). Die alten ungescopten `gs-*`-Stile in den
Spiel-CSS bleiben bewusst bestehen (die Beitrittsscreens von `view.html`/
`board.html` nutzen sie weiter) — `css/spielwaehler.css` überstimmt sie im
Spielwähler durch Scoping auf `.gs-screen`.

---

### Konzept & Ablauf

1. **Spielwähler** — Lehrkraft sieht alle aktiven Spiele, erstellt neues Spiel → **4-stelliger Code** (`A3K7`)
2. **Setup** — Lehrkraft konfiguriert Spiel; Code wird sofort beim Erstellen generiert (nicht erst beim Start)
3. **Beitreten** — Schüler öffnen `view.html?code=XXXX` oder geben Code manuell ein
4. **Sync** — alle Geräte erhalten Updates per SSE (`?f=PREFIX-sse&code=XXXX`) bzw. Polling-Fallback
5. **Auto-Cleanup** — Spiele werden **24 Stunden nach letztem Update** automatisch gelöscht (`api.php`)

---

### Dateistruktur

```
SPIEL/data/games/
  index.json          ← Registry: { "A3K7": { title, status, createdAt, updatedAt } }
  A3K7.json           ← Spielstand für Code A3K7
```

---

### API-Endpunkte in `api.php`

Prefix pro Spiel wählen (Risiko-Quiz: kein Prefix; Leiterspiel: `ls-`):

```
GET  ?f=PREFIX-games              → Registry laden (löst 24h-Cleanup aus)
POST ?f=PREFIX-games              → Registry speichern (selten nötig, da POST game die Registry auto-updated)
GET  ?f=PREFIX-game&code=XXXX     → Spielstand laden
POST ?f=PREFIX-game&code=XXXX     → Spielstand speichern + Registry auto-update (title, status, updatedAt)
DELETE ?f=PREFIX-game&code=XXXX   → Spielstand + Registry-Eintrag löschen
GET  ?f=PREFIX-sse&code=XXXX      → SSE-Stream (sendet Spielstand bei jeder Änderung)
```

**PHP-Muster** (analog zu `ls-*` Blöcken in `api.php`):
- Registry-Abruf ruft `cleanupExpiredGames($dir)` auf → löscht abgelaufene Einträge + Dateien mit `LOCK_EX`
- POST auf game aktualisiert Registry-Eintrag automatisch (`title`, `status`, `createdAt`, `updatedAt`)
- SSE streamt die Spielstand-Datei bei Änderungen (30s-Reconnect-Keepalive)

---

### Storage-Objekt (`XxxStorage`)

Inline in Spiellogik-JS und `view.html` kopieren. Prefix für localStorage-Keys pro Spiel wählen.

```js
const XxxStorage = {
  _code: null, _serverOk: null,

  setCode(c)   { this._code = c ? c.toUpperCase() : null; },
  getCode()    { return this._code; },

  generateCode() {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // kein O/I/1/0 → Verwechslungsgefahr
    return Array.from({length:4}, () => ch[Math.floor(Math.random()*ch.length)]).join('');
  },

  async checkServer() {
    if (this._serverOk !== null) return this._serverOk;
    if (window.location.protocol === 'file:') { this._serverOk = false; return false; }
    try {
      await fetch('../api.php?f=PREFIX-game&code=PING', {method:'HEAD', signal:AbortSignal.timeout(2000)});
      this._serverOk = true;
    } catch { this._serverOk = false; }
    return this._serverOk;
  },

  // Set-Felder (z.B. usedQuestionIds) vor JSON serialisieren / nach JSON wiederherstellen
  _ser(gs)  { return {...gs, usedQuestionIds: [...(gs.usedQuestionIds instanceof Set ? gs.usedQuestionIds : (gs.usedQuestionIds||[]))]}; },
  _deser(d) { return {...d, usedQuestionIds: new Set(d.usedQuestionIds||[])}; },

  async save(gs) {
    if (!this._code) return;
    const json = JSON.stringify(this._ser(gs));
    localStorage.setItem('PREFIX_gs_'+this._code, json);
    if (await this.checkServer())
      try { await fetch('../api.php?f=PREFIX-game&code='+this._code, {method:'POST', body:json, headers:{'Content-Type':'application/json'}}); } catch {}
  },

  async load(code) {
    code = (code||this._code||'').toUpperCase();
    if (!code) return null;
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=PREFIX-game&code='+code); if (r.ok) { const d=await r.json(); if(d&&d.meta) return this._deser(d); } } catch {}
    const s = localStorage.getItem('PREFIX_gs_'+code);
    if (s) try { return this._deser(JSON.parse(s)); } catch {}
    return null;
  },

  async loadGamesRegistry() {
    if (await this.checkServer())
      try { const r = await fetch('../api.php?f=PREFIX-games'); if (r.ok) return await r.json(); } catch {}
    // localStorage-Fallback: alle PREFIX_gs_*-Einträge scannen
    const reg = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('PREFIX_gs_')) {
        const code = k.slice('PREFIX_gs_'.length);
        try { const d = JSON.parse(localStorage.getItem(k)); if (d&&d.meta) reg[code] = { title: d.meta.title||'Spiel', status: d.phase||'setup', updatedAt: d.meta.createdAt||'' }; } catch {}
      }
    }
    return reg;
  },

  async deleteGame(code) {
    localStorage.removeItem('PREFIX_gs_' + code.toUpperCase());
    if (await this.checkServer())
      try { await fetch('../api.php?f=PREFIX-game&code='+code, {method:'DELETE'}); } catch {}
  },

  subscribe(code, cb) {
    code = code.toUpperCase();
    let stopped = false, src = null, timer = null;
    const startSSE = () => {
      if (stopped) return;
      src = new EventSource('../api.php?f=PREFIX-sse&code='+code);
      src.onmessage = e => { if(stopped) return; try { const d=JSON.parse(e.data); if(d&&d.meta) cb(this._deser(d)); } catch {} };
      src.addEventListener('reconnect', () => { src&&src.close(); src=null; if(!stopped) setTimeout(startSSE,500); });
      src.onerror = () => { src&&src.close(); src=null; if(!stopped) startPoll(); };
    };
    const startPoll = () => {
      if(stopped||timer) return;
      const fn = async () => { if(stopped) return; try { const r=await fetch('../api.php?f=PREFIX-game&code='+code); if(r.ok){const d=await r.json();if(d&&d.meta)cb(this._deser(d));} } catch {} };
      fn(); timer = setInterval(fn, 1000);
    };
    const startLocalPoll = () => {
      if(stopped||timer) return; let last='';
      timer = setInterval(() => { if(stopped) return; const s=localStorage.getItem('PREFIX_gs_'+code); if(s&&s!==last){last=s;try{const d=JSON.parse(s);if(d&&d.meta)cb(this._deser(d));}catch{}} }, 500);
    };
    (async () => { if (await this.checkServer()) startSSE(); else startLocalPoll(); })();
    return { unsubscribe() { stopped=true; src&&src.close(); timer&&clearInterval(timer); } };
  }
};
```

---

### Spielwähler — HTML

Erster Screen (`.screen.active`) in der Spiel-HTML-Datei. Der Spielwähler ist der **einzige Einstiegspunkt** für alle — Schüler geben einen Code ein und landen in `view.html`, Lehrkräfte sehen die Spielliste und können neue Spiele erstellen. Kein separater "Schüleransicht"-Button in `spiele.html` nötig.

> **onclick-Kompatibilität**: `onclick="createNewGame()"` funktioniert nur, wenn `createNewGame` im globalen Scope liegt. `window.xxx = async function()` ist eine **Zuweisung** — sie ist NICHT hoisted und scheitert, wenn ein Laufzeitfehler davor auftritt. Stattdessen: `async function createNewGame()` als top-level **Function Declaration** → wird gehoisted und ist automatisch `window.createNewGame`. Für `window._gsEnter` / `window._gsDelete` (explizit `window.`-qualifiziert im onclick-String) separate Declarations + manuelle Exports nach den Declarations (siehe JS-Abschnitt).

```html
<div class="screen active" id="game-selector">
  <div class="gs-container">
    <div class="gs-header">
      <div class="gs-title">🎮 Spielname</div>
      <div style="display:flex;gap:8px;">
        <a href="../spiele.html" class="header-btn">← Übersicht</a>
        <button class="header-btn" onclick="toggleTheme()">🌙 Darkmode</button>
      </div>
    </div>
    <div class="gs-body">

      <!-- Schüler: Beitreten -->
      <h2 class="gs-section-title">Als Schüler/in beitreten</h2>
      <p class="gs-subtitle">Gib den Code deiner Lehrkraft ein.</p>
      <div class="gs-join-row">
        <input type="text" id="gs-code-input" class="gs-code-input" maxlength="4" placeholder="CODE"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"
          onkeydown="if(event.key==='Enter')joinAsStudent()">
        <button class="btn-join-student" onclick="joinAsStudent()">Beitreten →</button>
      </div>
      <div class="gs-join-error" id="gs-join-error"></div>

      <div class="gs-divider"></div>

      <!-- Lehrkraft: Spiele verwalten -->
      <h2 class="gs-section-title">Als Lehrkraft</h2>
      <p class="gs-subtitle">Wähle ein bestehendes Spiel oder erstelle ein neues.</p>
      <div id="gs-game-list" class="gs-game-list"></div>
      <div style="margin-top:1.2rem;">
        <button class="btn-start-game" onclick="createNewGame()">+ Neues Spiel erstellen</button>
      </div>

    </div>
  </div>
</div>
```

---

### Spielwähler — CSS-Klassen

**Kanonische Version** (Referenz: `risiko-quiz/css/admin.css`). Fertige Kopiervorlage: `_templates/spielverwaltung/gs-styles.css`.

Zwei Varianten je nach CSS-Variable-Schema des Spiels:
- **Variante A** (`--bg-sidebar`, `--bg-field`, `--border`) → Leiterspiel-Stil
- **Variante B** (`--bg-card`, `--bg-secondary`, `--border-card`) → Labyrinth-Stil

```css
/* Screen: Vollbild-Overlay (wie Risiko-Quiz admin.css) */
/* display:none/flex kommt vom .screen/.screen.active Mechanismus */
#game-selector { position:fixed; inset:0; background:var(--bg-primary); z-index:600; align-items:center; justify-content:center; padding:2rem; }
/* Leiterspiel-Stil: background:var(--bg-body) statt --bg-primary */

/* Container-Karte — bg-secondary (Panel), bg-card (Einträge), wie Risiko-Quiz */
/* Variante A (Leiterspiel): --bg-sidebar ≈ --bg-secondary, --bg-field ≈ --bg-card */
.gs-container  { width:100%; max-width:640px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:18px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.3); }

/* Header mit Trennlinie */
.gs-header     { display:flex; align-items:center; justify-content:space-between; padding:1.2rem 1.5rem; border-bottom:1px solid var(--border); }
.gs-title      { font-size:clamp(1.4rem,3vw,1.9rem); font-weight:700; color:var(--accent); }

/* Body */
.gs-body       { padding:1.5rem; display:flex; flex-direction:column; }
.gs-section-title { font-size:1.1rem; font-weight:700; margin-bottom:4px; color:var(--text-primary); }
.gs-subtitle   { color:var(--text-secondary); font-size:0.9rem; margin-bottom:1rem; }

/* Spielliste — max 50vh, eigene Scrollbar */
.gs-game-list  { display:flex; flex-direction:column; gap:0.5rem; max-height:50vh; overflow-y:auto; }
.gs-empty      { color:var(--text-secondary); font-style:italic; }

/* Spielkarte */
.gs-game-card  { display:flex; align-items:center; gap:1rem; background:var(--bg-card); border:1.5px solid var(--border); border-radius:12px; padding:0.9rem 1.2rem; cursor:pointer; transition:border-color .2s,background .2s; }
/* Variante A: background:var(--bg-field); hover: var(--bg-field-hover) */
.gs-game-card:hover { border-color:var(--accent); background:var(--bg-card-hover); }
.gs-game-code  { font-size:1.3rem; font-weight:800; font-family:'Consolas','SF Mono',monospace; letter-spacing:0.15em; color:var(--accent); min-width:5ch; }
.gs-game-info  { flex:1; min-width:0; }
.gs-game-title { font-weight:600; font-size:1rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gs-game-meta  { font-size:0.82rem; color:var(--text-secondary); margin-top:0.15rem; }
.gs-game-actions { flex-shrink:0; }
.gs-btn-delete { background:none; border:1px solid var(--border); color:var(--danger); border-radius:8px; width:30px; height:30px; cursor:pointer; }
.gs-btn-delete:hover { background:var(--danger); color:#fff; border-color:var(--danger); }

/* Beitreten-Sektion */
.gs-join-row   { display:flex; gap:8px; margin-top:4px; }
.gs-code-input { flex:1; padding:12px 14px; font-size:1.4rem; font-weight:800; letter-spacing:6px; text-align:center; text-transform:uppercase; background:var(--bg-field); border:2px solid var(--border); border-radius:12px; color:var(--text-primary); font-family:monospace; outline:none; transition:border-color .2s; }
.gs-code-input:focus { border-color:var(--accent); }
.btn-join-student { padding:12px 20px; background:linear-gradient(135deg,var(--accent-warm),var(--accent)); color:#fff; border:none; border-radius:12px; font-size:1rem; font-weight:700; cursor:pointer; white-space:nowrap; transition:opacity .2s; }
.btn-join-student:hover { opacity:.9; }
.gs-join-error { color:var(--danger); font-size:0.85rem; min-height:1.2em; margin-top:6px; }
.gs-divider    { border:none; border-top:1px solid var(--border); margin:20px 0; }
```

---

### Spielwähler — JS-Logik

> **Hoisting-Regel**: `createNewGame` als `async function createNewGame()` deklarieren (Function Declaration), **nicht** als `window.createNewGame = async function()` (Assignment). Function Declarations werden gehoisted → `onclick="createNewGame()"` findet die Funktion immer. `_gsEnter` / `_gsDelete` können nicht direkt als `window._gsEnter` deklariert werden; stattdessen als reguläre Declarations definieren und danach manuell exportieren: `window._gsEnter = _gsEnter;` — das geschieht nach dem Laden der anderen Deklarationen, aber bevor DOMContentLoaded feuert, also bevor der User klicken kann.

```js
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function showGameSelector() {
  showScreen('game-selector');
  const list = document.getElementById('gs-game-list');
  list.innerHTML = '<p class="gs-empty">Lade Spiele…</p>';
  const registry = await XxxStorage.loadGamesRegistry();
  const entries = Object.entries(registry);
  if (entries.length === 0) { list.innerHTML = '<p class="gs-empty">Noch keine Spiele vorhanden.</p>'; return; }
  entries.sort((a,b) => (b[1].updatedAt||b[1].createdAt||'').localeCompare(a[1].updatedAt||a[1].createdAt||''));
  list.innerHTML = entries.map(([code, info]) => {
    const statusLabel = {playing:'🟢 Läuft', finished:'🏁 Beendet', 'dice-order':'🎲 Startreihe'}[info.status] || '⚙ Setup';
    const date = info.updatedAt ? new Date(info.updatedAt).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    const ts = info.updatedAt||info.createdAt;
    let expiryHint = '';
    if (ts) { const rem = 24*3600000-(Date.now()-new Date(ts).getTime()); if(rem>0){const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000); expiryHint=` · ${h}h ${m}m übrig`;} }
    return `<div class="gs-game-card" onclick="window._gsEnter('${code}')">
      <div class="gs-game-code">${code}</div>
      <div class="gs-game-info">
        <div class="gs-game-title">${escapeHtml(info.title||'Spiel')}</div>
        <div class="gs-game-meta">${statusLabel} · ${date}${expiryHint}</div>
      </div>
      <div class="gs-game-actions">
        <button class="gs-btn-delete" onclick="event.stopPropagation();window._gsDelete('${code}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Schüler beitreten ─────────────────────────────────────────
// Kein window.xxx nötig — Function Declaration ist automatisch global
function joinAsStudent() {
  const input = document.getElementById('gs-code-input');
  const errEl = document.getElementById('gs-join-error');
  const code = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (errEl) errEl.textContent = '';
  if (!code || code.length < 4) { if (errEl) errEl.textContent = 'Bitte 4-stelligen Code eingeben.'; return; }
  window.location.href = 'view.html?code=' + code;
}

// ── Lehrkraft: Spiel erstellen ────────────────────────────────
// Function Declaration → gehoisted → automatisch window.createNewGame
async function createNewGame() {
  const code = XxxStorage.generateCode();
  XxxStorage.setCode(code);
  await XxxStorage.save({ meta:{gameCode:code,title:'Spielname',createdAt:new Date().toISOString()}, phase:'setup', teams:[], usedQuestionIds:new Set(), liveQuestion:null });
  window.history.replaceState({}, '', 'index.html?code=' + code);
  showScreen('setup-screen');
  const t = document.getElementById('setup-game-title'); if(t) t.value='';
  showCodeBanner();
}

// ── Spielwähler-Aktionen ──────────────────────────────────────
// _gsEnter/_gsDelete als Declarations + manuell auf window exportieren
// (onclick-Strings verwenden window._gsEnter / window._gsDelete explizit)
async function _gsEnter(code) {
  XxxStorage.setCode(code);
  const gs = await XxxStorage.load(code);
  if (!gs) { alert('Spiel nicht gefunden.'); showGameSelector(); return; }
  window.history.replaceState({}, '', 'index.html?code=' + code);
  gameState = gs;
  if (gs.phase === 'playing') {
    // Kategorien wiederherstellen, Board rendern, SSE starten
    if (gs.activeCategoryIds) selectedCategoryIds = new Set(gs.activeCategoryIds);
    showScreen('game-screen'); renderBoard(); startSSESubscription(); showCodeBanner();
  } else if (gs.phase === 'dice-order') {
    if (gs.activeCategoryIds) selectedCategoryIds = new Set(gs.activeCategoryIds);
    showScreen('dice-order-screen'); initDiceOrder(); startSSESubscription(); showCodeBanner();
  } else {
    showScreen('setup-screen'); showCodeBanner();
  }
}
async function _gsDelete(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await XxxStorage.deleteGame(code);
  showGameSelector();
}
// Exports NACH den Declarations (vor DOMContentLoaded, also sicher)
window._gsEnter  = _gsEnter;
window._gsDelete = _gsDelete;

// init(): URL-Code direkt einsteigen oder Spielwähler zeigen
document.addEventListener('DOMContentLoaded', async () => {
  await loadData(); // Fragen / Spielkonfiguration laden
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) await _gsEnter(urlCode.toUpperCase());
  else showGameSelector();
});

// Zurück zum Spielwähler (z.B. nach Spielende oder Quit)
function resetToSelector() {
  XxxStorage.setCode(null);
  window.history.replaceState({}, '', 'index.html');
  const banner = document.getElementById('code-banner'); if(banner) banner.remove();
  showGameSelector();
}
```

---

### Code-Badge (Lehrkraft-View)

Fixiertes Badge unten-rechts, zeigt Code + Link zu `view.html?code=XXXX`:

```js
function showCodeBanner() {
  const code = XxxStorage.getCode(); if (!code) return;
  const existing = document.getElementById('code-banner');
  if (existing) { existing.querySelector('.code-val').textContent = code; return; }
  const b = document.createElement('div');
  b.id = 'code-banner';
  b.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999;background:var(--bg-card,#1a2744);color:var(--text-primary,#fff);border-radius:12px;padding:10px 16px;font-size:.85rem;box-shadow:0 2px 12px rgba(0,0,0,.4);display:flex;align-items:center;gap:10px;';
  b.innerHTML = '<span>📱 Schüler:</span><strong class="code-val" style="font-size:1.2rem;letter-spacing:2px">'+code+'</strong><a href="view.html?code='+code+'" target="_blank" style="color:var(--accent);font-size:.8rem;text-decoration:none">Link ↗</a>';
  document.body.appendChild(b);
}
```

---

### `gameState` — Pflichtfelder

```js
gameState = {
  meta: { gameCode: '', title: 'Spielname', createdAt: '' },
  phase: 'setup',          // 'setup' | 'playing' | 'finished' | spielspezifisch
  teams: [],
  usedQuestionIds: new Set(),   // wird als Array serialisiert (_ser/_deser)
  activeCategoryIds: [],         // gewählte Kategorien → für Resume nötig
  liveQuestion: null,            // Pflicht für Schüleransicht-Sync
  // ...spielspezifische Felder...
};
```

**`liveQuestion`-Struktur** (wenn Schüleransicht vorhanden):
```js
liveQuestion: {
  id: questionId,          // eindeutige ID für Change-Detection
  teamIdx: number,         // welches Team ist dran
  question: { ... },       // vollständiges Fragen-Objekt (für SSE-Empfänger)
  resolved: boolean,       // Antwort eingegangen
  selectedMcIndex: null | number,
  autoCorrect: null | boolean
}
```

---

### Schüleransicht (`view.html`) — Pflicht-Screens

| Screen | Inhalt |
|--------|--------|
| `screen-join` | Code-Input (4 Zeichen), "Beitreten"-Button |
| `screen-team` | Team-Liste aus `gameState.teams`, Zuschauer-Option |
| `screen-wait` | Warte-Screen während Setup/Dice-Order |
| `screen-game` | Spielbrett + Status + Aktions-Button (nur wenn dran) |
| Question-Overlay | MC-Buttons (nur wenn dran), offene Fragen → warten |

**SSE-Reaktion in `view.html`:**
```js
sub = XxxStorage.subscribe(code, function onUpdate(newGs) {
  // liveQuestion neu → Frage-Overlay zeigen (wenn dran)
  // liveQuestion null → Overlay schließen, Board updaten
  // phase=finished → Gewinner-Screen
});
```

**SSE-Reaktion im Lehrkraft-View:**
```js
lsSub = XxxStorage.subscribe(code, function onSSEUpdate(newGs) {
  // liveQuestion vom Schüler gesetzt → Frage-Modal öffnen (offene Fragen)
  // liveQuestion=null → Modal schließen, Board neu rendern
});
```

---

### Verantwortlichkeitstrennung

| Aktion | Wer |
|--------|-----|
| Spiel erstellen + Code | Lehrkraft |
| Würfeln / Ziehen | Schüler (primär), Lehrkraft als Fallback |
| MC-Frage beantworten | Schüler → schreibt Ergebnis + save() |
| Offene Frage auswerten | Lehrkraft → klickt Richtig/Falsch + save() |
| Sonderfelder / Bonus | Lehrkraft (kann lokal bleiben) |

---

### Saves — wann & was

| Stelle | Was |
|--------|-----|
| `createNewGame()` | Skeleton-State mit Code + meta |
| `proceedToGame()` / Spielstart | Teams, Board, activeCategoryIds, phase=playing |
| `rollDice()` | `liveQuestion` setzen, fire-and-forget save |
| `resolveQuestion()` | `liveQuestion.resolved=true`, `autoCorrect` |
| `nextTurn()` | `liveQuestion=null`, Positionen/Scores |
| Spielende | `phase='finished'` |
