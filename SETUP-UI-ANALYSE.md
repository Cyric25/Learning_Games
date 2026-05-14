# Setup-UI Analyse: Risiko-Quiz
> Grundlage für ein einheitliches Spielerstellungs-Template

---

## Ziel

Das Risiko-Quiz besitzt ein durchdachtes 3-Schritt-Setup-Interface (Landing → Konfiguration → Teams/Einstellungen → Lobby).
Dieses Dokument beschreibt Aufbau, CSS-Klassen und Verhalten aller Setup-Screens exakt, damit dasselbe Frontend-Pattern in anderen Spielen (Schlangen & Leitern, Labyrinth-Quiz, QuizPfad usw.) übernommen werden kann.

---

## Designsystem

Alle Screens teilen dieselbe CSS-Variablen-Basis (`game.css`, `:root`).

### Farben

```css
/* Dark Mode (Standard) */
--bg-primary:    #1a1a2e;   /* Seitenhintergrund */
--bg-secondary:  #16213e;   /* sekundäre Flächen */
--bg-card:       #0f3460;   /* Karten / Listenelemente */
--bg-card-hover: #1a4a80;
--accent:        #e94560;   /* Akzentfarbe: Titel, aktive Elemente, Progressbar */
--text-primary:  #ffffff;
--text-secondary:#a8a8b3;   /* Labels, Untertitel */
--success:       #2ecc71;   /* grün: ausgewählt / bestätigt */
--danger:        #e74c3c;   /* rot: Fehler, Entfernen */
--warning:       #f39c12;   /* orange: besondere Optionen (Klau-Modus) */
--border:        rgba(255,255,255,0.12);

/* Light Mode (body.light) */
--bg-primary:    #fdf6f0;   /* Cremeweiß */
--bg-card:       #fff3ee;
--accent:        #E34F20;
--text-secondary:#666666;
--border:        rgba(0,0,0,0.1);
```

### Typografie

```css
font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
```

### Gemeinsame Button-Klassen

```css
/* Primär-Button (orange) */
.setup-btn {
  padding: 1rem 2rem;
  border-radius: 12px;
  border: none;
  font-size: 1.2rem;
  font-weight: 700;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  margin: 0.5rem;
  transition: transform 0.15s, box-shadow 0.15s;
}
.setup-btn:hover  { transform: scale(1.04); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
.setup-btn:active { transform: scale(0.97); }

/* Ghost-Button (zurück) */
.setup-btn-ghost {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-primary) !important;
}
```

Aktionsbereich immer: `display:flex; gap:1rem; flex-wrap:wrap; justify-content:center`

---

## Screen 0 – Landing / Join-Screen

**HTML-ID:** `#join-screen`
**Layout:** `position:fixed; inset:0; background:var(--bg-primary); z-index:500; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2rem`

### Elemente (von oben nach unten)

| Element | Styling |
|---|---|
| Spielname `<h1>` | `color:var(--accent); font-size:clamp(2rem,5vw,3rem); font-weight:700; margin:0 0 0.5rem` |
| Untertitel `<p>` | `color:var(--text-secondary); font-size:clamp(1rem,2vw,1.2rem); margin:0 0 2rem` |
| Code-Input `<input>` | `font-size:clamp(2rem,5vw,3.5rem); text-align:center; letter-spacing:0.4em; width:7em; padding:0.5em 0.3em; background:var(--bg-secondary); border:2px solid var(--border); border-radius:14px; font-weight:700; text-transform:uppercase` |
| Beitreten-Button | `.setup-btn` |
| Fehlermeldung `#join-error` | `color:var(--danger); font-weight:600; display:none` |
| Trennlinie | `border-top:1px solid var(--border); margin-top:2.5rem; padding-top:1.5rem` |
| Label „Oder als Spielleiter:" | `color:var(--text-secondary); font-size:0.95rem` |
| Erstellen-Button | `.setup-btn` mit `background:var(--success)` (grün) |
| Zurück-Link | `<a>`, `color:var(--text-secondary); font-size:0.9rem` |

### Verhalten
- Code-Input: `oninput` → uppercase, nur `[A-Z0-9]`
- Enter im Input → `joinGame()`
- „+ Neues Spiel erstellen" → `createNewGame()` → wechselt zu Screen 1

---

## Screen 1 – „Spielfeld konfigurieren" (Slot-Screen)

**HTML-ID:** `#slot-screen`
**Layout:** `position:fixed; inset:0; background:var(--bg-primary); overflow-y:auto; padding:2rem 1rem`

Innerer Container: `.slot-container`
```css
.slot-container {
  width: 100%;
  max-width: 960px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin: 0 auto;
}
```

---

### Header-Block (`.slot-header`, `text-align:center`)

**Spielcode-Box** (optional, `display:none` wenn kein Mehrspieler):
```css
/* #slot-game-code */
background: var(--bg-card);
border: 2px solid var(--accent);
border-radius: 12px;
padding: 0.6rem 1.2rem;
margin-bottom: 0.8rem;
```
- Label „Spielcode:" in `--text-secondary`
- Code-Wert: `color:var(--accent); font-size:1.4rem; font-weight:800; letter-spacing:0.15em; cursor:pointer` → onclick kopiert in Clipboard

**Seitentitel `h2`:** `color:var(--accent); font-size:2rem; margin-bottom:0.8rem`

**Fortschrittszeile (`.slot-progress`):**
```css
.slot-progress {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 1rem;
  background: var(--bg-card);
  border-radius: 20px;
}
```
- **Zähler-Badge `#slot-count`:** `display:inline-flex; align-items:center; justify-content:center; min-width:1.6em; height:1.6em; padding:0 4px; background:var(--accent); color:#fff; border-radius:3em; font-weight:800; font-size:1rem`
- Text: `/ 8 Spalten` in `--text-secondary`
- **Progressbar (`.slot-progress-bar`):** `width:120px; height:7px; background:var(--bg-secondary); border-radius:4px; overflow:hidden`
  - Füllung (`.slot-progress-fill`): `height:100%; background:var(--accent); border-radius:4px; transition:width 0.3s`

---

### Zwei-Panel-Layout (`.slot-panels`)

```css
.slot-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}
@media (max-width: 640px) {
  .slot-panels { grid-template-columns: 1fr; }
}
```

**Panel-Titel (`.slot-panel-title`):**
```css
font-size: 0.75rem;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.08em;
color: var(--text-secondary);
border-bottom: 2px solid var(--border);
padding-bottom: 0.5rem;
margin-bottom: 0.8rem;
```

---

### Linkes Panel – „Verfügbare Kategorien"

Hierarchische Baumstruktur (`.slot-tree`): `display:flex; flex-direction:column`

**Kategorie-Header (klickbar, klappt auf/zu):**
- Pfeil-Icon `▶` / `▼` + Name in Großbuchstaben, `font-weight:700`
- Hintergrund wechselt bei Hover / ausgewählt zu `var(--bg-card-hover)`

**Untereinträge (`.slot-tree-item`):**
```css
.slot-tree-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.45rem 0.5rem;
  border-radius: 8px;
  cursor: pointer;
}
.slot-tree-item:hover { background: var(--bg-card-hover); }
.slot-tree-item.active { background: rgba(46,204,113,0.1); }
```

**Add-Button (`.slot-tree-add`):**
```css
.slot-tree-add {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
/* Hover */
.slot-tree-item:hover .slot-tree-add {
  border-color: var(--accent);
  color: var(--accent);
}
/* Ausgewählt */
.slot-tree-item.active .slot-tree-add {
  border-color: var(--success);
  background: var(--success);
  color: #fff;
  content: '✓';   /* Symbol wechselt von + zu ✓ */
}
```

**Label (`.slot-tree-label`):**
```css
font-size: 0.91rem;
color: var(--text-primary);
flex: 1;
line-height: 1.3;
```
- Ausgewählt (`.active`): `color: var(--success); font-weight:600`
- Top-Level (`data-indent="0"`): `font-weight:700`

---

### Rechtes Panel – „Ausgewählte Spalten"

**Leer-Zustand:**
```css
border: 2px dashed var(--border);
border-radius: 12px;
text-align: center;
padding: 2rem;
color: var(--text-secondary);
```
Text: „Noch keine Spalten gewählt."

**Ausgewählte Items (`.slot-selected-item`):**
```css
.slot-selected-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem 0.9rem;
  background: var(--bg-card);
  border-radius: 10px;
  margin-bottom: 0.5rem;
}
```
- **Nummerierungs-Badge:** oranger Kreis (`background:var(--accent); color:#fff; border-radius:50%; width:26px; height:26px; font-weight:800; font-size:0.85rem`) mit Positionsnummer
- **Name:** `flex:1; font-size:0.93rem; font-weight:600`
- **Entfernen-Button (`.slot-remove-btn`):**
  ```css
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
  flex-shrink: 0;
  ```
  Hover: `background:var(--danger); color:#fff; border-color:var(--danger)`

---

### Aktionsbereich

```html
<div class="slot-actions">
  <button class="setup-btn" id="btn-slot-confirm">▶ Weiter</button>
  <button class="setup-btn setup-btn-ghost" id="btn-slot-back">← Zurück</button>
</div>
```

---

## Screen 2 – „Teams & Einstellungen"

**HTML-ID:** `#team-select-screen`
**Layout:** `position:fixed; inset:0; background:var(--bg-primary); z-index:491; display:flex; flex-direction:column; align-items:center; overflow-y:auto; padding:2rem`

Alle Inhaltsblöcke: `max-width:520px; width:100%`

**Spielcode-Box** (identisch mit Screen 1, optional)

**Seitentitel `h2`:** `color:var(--accent); font-size:2rem; margin-bottom:0.5rem`

**Untertitel `p`:** `color:var(--text-secondary); text-align:center; max-width:520px; margin-bottom:1.5rem`

---

### Teams-Block (`#team-select-list`)

Jedes Team: `.team-select-item`
```css
.team-select-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: var(--bg-card);
  border-radius: 12px;
  padding: 0.8rem 1rem;
  margin-bottom: 0.6rem;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}
.team-select-item.selected { border-color: var(--success); }
```

Innerhalb jedes Team-Items:
- **Checkbox (`.team-select-check`):** `width:22px; height:22px; accent-color:var(--accent); cursor:pointer; flex-shrink:0`
- **Farbpunkt (`.team-color-dot`):** `width:24px; height:24px; border-radius:50%; flex-shrink:0`
- **Namensfeld (`.team-name-input`):**
  ```css
  flex: 1;
  background: rgba(255,255,255,0.07);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
  ```
  Focus: `border-color: rgba(255,255,255,0.4)`

**8 Teamfarben (fest definiert):**
`#e74c3c` (rot), `#3498db` (blau), `#2ecc71` (grün), `#f39c12` (gelb),
`#9b59b6` (lila), `#1abc9c` (cyan), `#e67e22` (orange), `#e91e8c` (pink)

---

### Spieleinstellungen-Block

**Abschnitts-Trennlinie:**
```css
font-size: 0.75rem;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.1em;
color: var(--text-secondary);
margin-bottom: 0.8rem;
padding-bottom: 0.5rem;
border-bottom: 2px solid var(--border);
```
Text: `⚙ Spieleinstellungen`

**Einstellungs-Karte (Basis-Styling für alle Zeilen):**
```css
background: rgba(255,255,255,0.05);
border-radius: 12px;
padding: 0.9rem 1.2rem;
margin-bottom: 0.6rem;
border: 2px solid transparent;
transition: border-color 0.2s;
```

**Beschriftungsstruktur jeder Zeile:**
```
[Checkbox/Input]  |  [Emoji + Titel bold, 1rem]
                  |  [Untertitel, --text-secondary, 0.85rem, margin-top:0.1rem]
```

**Verfügbare Einstellungstypen:**

| Typ | HTML | Styling |
|---|---|---|
| Zahl-Input rechts | `display:flex; justify-content:space-between` + `<input type="number">` | `width:100px; text-align:center; font-size:1.1rem; font-weight:700; border-radius:8px; border:1px solid --border; background:rgba(255,255,255,0.07)` |
| Checkbox + Zahl | Checkbox links in `<label>`, Zahl-Input + Einheit rechts | wie oben |
| Checkbox allein | ganzes `<label>` klickbar, `display:flex; gap:1rem; align-items:center` | `cursor:pointer` |
| Dropdown rechts | `display:flex; justify-content:space-between` + `<select>` | `padding:0.4rem 0.8rem; border-radius:8px; border:1px solid --border; background:rgba(255,255,255,0.07); font-weight:600` |

**Checkboxen:** `width:22px; height:22px; accent-color:var(--accent)` (bei Spezialoptionen: `accent-color:var(--warning)`)

**Konkrete Einstellungen im Risiko-Quiz:**

| ID | Emoji | Titel | Typ | Default |
|---|---|---|---|---|
| `ts-start-capital` | 💰 | Startkapital | Zahl | 500 |
| `ts-timer-enabled` + `ts-timer-seconds` | ⏱ | Timer | Checkbox + Zahl + „Sek." | ✓, 30 |
| `ts-show-answer` | 📢 | Antwort für alle anzeigen | Checkbox | ✗ |
| `ts-allow-negative` | 📉 | Negative Punkte | Checkbox | ✗ |
| `ts-steal-mode` | ⚡ | Klau-Modus | Checkbox (warning) | ✗ |
| `ts-steal-penalty` | 💸 | Abzug bei „Weiß nicht" | Checkbox (warning) | ✗ |
| `ts-question-filter` | 🎯 | Fragentyp | Dropdown | Alle Fragen |

---

### Aktionsbereich

```html
<div style="display:flex; gap:1rem; flex-wrap:wrap; justify-content:center;">
  <button class="setup-btn" id="btn-team-confirm">▶ Spiel starten</button>
  <button class="setup-btn setup-btn-ghost" id="btn-team-back">← Zurück</button>
</div>
```

---

## Screen 3 – „Bereit!" Lobby

Wird dynamisch per JS erzeugt (`document.createElement('div')`), nicht als fester HTML-Block.

**Layout:**
```css
position: fixed;
inset: 0;
background: rgba(10,10,30,0.95);
z-index: 600;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
padding: 2rem;
text-align: center;
```

**Inhalt:**
- Titel „Bereit!": `color:var(--accent); font-size:clamp(2rem,5vw,3rem); font-weight:700`
- Zusammenfassung: `color:var(--text-secondary)` – z.B. „8 Teams · 3 Kategorien"
- Spielcode-Box: `background:var(--bg-card); border:2px solid var(--accent); border-radius:14px; padding:0.8rem 2rem; cursor:pointer; margin:1rem 0`
  - Label klein: `--text-secondary`
  - Code groß: `color:var(--accent); font-size:clamp(1.6rem,4vw,2.5rem); font-weight:800; letter-spacing:0.2em`
- Hinweistext: „Spieler können jetzt mit diesem Code beitreten." – `--text-secondary`
- Grüner „▶ Spiel starten" Button: `.setup-btn` mit `background:var(--success)`
- Zurück-Link: `← Zurück`, `--text-secondary; font-size:0.9rem; cursor:pointer; margin-top:0.5rem`

---

## Allgemeines Template-Pattern

### Screen-Wechsel-Logik

Alle Screens liegen übereinander (`position:fixed; inset:0`) und werden per JS ein-/ausgeblendet:
```js
// Screen zeigen
el.style.display = 'flex';
// Screen verstecken
el.style.display = 'none';
```
Der Setup-Flow ist linear:
```
Landing (0) → Konfiguration (1) → Teams & Einstellungen (2) → Bereit! (3) → Spiel
```

### Spielcode-Box (wiederverwendbar)

Dieselbe Komponente erscheint auf Screens 1, 2 und 3:
```html
<div style="text-align:center; padding:0.6rem 1.2rem; background:var(--bg-card);
  border-radius:12px; border:2px solid var(--accent); max-width:520px; width:100%;">
  <span style="color:var(--text-secondary); font-size:0.85rem;">Spielcode:</span>
  <span style="color:var(--accent); font-size:1.4rem; font-weight:800;
    letter-spacing:0.15em; margin-left:0.5rem; cursor:pointer;"
    onclick="copyCode(this)">CODE</span>
  <span style="color:var(--text-secondary); font-size:0.75rem; margin-left:0.5rem;">
    (klicken zum Kopieren)
  </span>
</div>
```

### Responsive Breakpoints

| Breakpoint | Anpassung |
|---|---|
| `<640px` | `.slot-panels` → 1 Spalte |
| `<540px` | `#team-select-screen` Settings-Zeilen → `flex-direction:column`; Number-Inputs volle Breite |
| Allgemein | `clamp()` für alle Schriftgrößen und Abstände |

### Unterschied je Spiel

Screen 1 (Konfiguration) ist spielspezifisch:
- Risiko-Quiz: Kategorie-Auswahl (was kommt auf die Spalten?)
- Schlangen & Leitern: eventuell Kartensatz-Auswahl
- Labyrinth-Quiz: Fragenpool-Auswahl

Screens 0, 2 (Teams & Einstellungen), 3 (Bereit!) können fast 1:1 übernommen werden – nur die Einstellungs-Zeilen in Screen 2 sind spielspezifisch.
