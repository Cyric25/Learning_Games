# Datenformate

## 0. Rich-Content: Formeln + Bilder in allen Inhalts-Strings

Alle Inhaltsfelder des Projekts (Fragen, Optionen, Antworten, Hints,
Rätselkarten, Begriffe, Kategorien, Notizen) sind **weiterhin reine Strings**
— zusätzlich werden beim Rendern Inline-Marker interpretiert
(`js/rich-content.js`, eine Quelle der Wahrheit für alle Seiten):

| Syntax | Bedeutung |
|--------|-----------|
| `$...$` | KaTeX-Formel (inline). Zählt **nur**, wenn direkt nach dem öffnenden und vor dem schließenden `$` kein Leerzeichen steht — „5 $ und 10 $" bleibt Text. |
| `$$...$$` | KaTeX-Formel (display, zentriert) |
| `![Alt](Quelle)` | Bild. Quelle wird geklemmt: nur `data/images/<datei>` (zentrale Upload-Ablage) oder `https://…` — alles andere wird verworfen (nur Alt-Text). |
| `\$` / `\|` | literales Dollar- bzw. Pipe-Zeichen |

**Rückwärtskompatibel:** reine Text-Strings bleiben unverändert gültig, keine
Migration nötig. Text wird immer escaped (XSS-Vertrauensgrenze,
[architektur.md §8](architektur.md#sicherheit)). Ohne geladenes KaTeX
degradieren Formeln zum escapten Quelltext.

API des Moduls: `renderRichContent(str) → HTML` (alle Anzeige-Stellen),
`richToPlainText(str)` (Stellen ohne HTML: Codenames-Karten, Vergleiche wie
`joComputeDuplicateStrikes`), `rcUploadImage(file)` + `rcBindPreview(...)`
(Editoren). KaTeX liegt zentral unter `lib/katex/` (aus `memory/lib/`
verschoben); das CSS injiziert das Modul selbst. Memory behält sein
strukturiertes `{type, content}`-Format — nur sein Renderer delegiert an das
Modul; der Bild-Typ rendert Legacy-URLs unverändert.

Bilder werden über `api.php?f=image-upload` (Admin-Token) nach `data/images/`
hochgeladen — **kein Base64 in den Datenbanken** (Quota-Falle). Details:
[api-referenz.md](api-referenz.md).

## 1. Zentrale Fragendatenbank (`data/questions.json`)

Das **Master-Format**. Von der zentralen `admin.html` bearbeitet; jedes
Quiz-Spiel konvertiert beim Laden in sein internes Format.

```json
{
  "categories": [
    {
      "id": "cat-...",
      "name": "Kategoriename",
      "questions": [ /* optional: Fragen direkt an diesem Knoten */ ],
      "subcategories": [
        {
          "id": "subcat-...",
          "name": "Unterkategorie",
          "questions": [
            {
              "id": "q-...",
              "question": "Fragetext",
              "type": "mc",              // "mc" | "open"
              "difficulty": 100,          // 100 | 200 | 300 | 400 | 500
              "options": ["A","B","C","D"],   // nur bei mc
              "correctIndex": 0,               // nur bei mc (Single)
              "correctIndices": [0,2],         // optional: mehrere Richtige
              "answer": "A",              // Musterlösung / Anzeige
              "hint": "Tipp"              // optional
            }
          ],
          "subcategories": [ /* bis zu 4 Ebenen tief */ ]
        }
      ]
    }
  ]
}
```

### Kritische Regel: True-Leaf-Erkennung

Der Admin erlaubt bis zu vier Ebenen. Dabei entstehen Knoten mit **sowohl
`questions` als auch `subcategories`**. Ein Knoten ist **genau dann ein Blatt**,
wenn er Fragen hat UND keine Unterkategorien:

```js
const subs = node.subcategories || [];
const isLeaf = hasQuestions && subs.length === 0;
```

Falsche Blatt-Erkennung ist ein wiederkehrender Bug (Kategorie-IDs in der
Auswahl passen nicht zu den `kategorieId` der Fragen → Kategorien verschwinden).
Alle Konvertierungs- und Zählfunktionen (`convertRQto…`, `_buildCatNode`,
`_countLeafQ`, `collectLeafCategories`) müssen dieselbe Prüfung verwenden.
Verschachtelte Blätter werden per Pfadname zusammengeführt: `"Ober › Unter"`.

### Standard-Konvertierung (für neue Spiele übernehmen)

| Master-Feld | Konvertiert zu |
|-------------|---------------|
| `difficulty: 100–200` | `"leicht"` |
| `difficulty: 300` | `"mittel"` |
| `difficulty: 400–500` | `"schwer"` |
| `type: "mc"` | `"multiple_choice"` |
| `type: "open"` | `"offen"` |
| verschachtelte Subkategorien | flach (Blatt-Ebenen), Pfad mit `" › "` |

### Multiple-Correct und die `??0`-Falle

Die Wertung bevorzugt `correctIndices` (Array), fällt sonst auf `correctIndex`
zurück. **Wichtig:** Eine MC-Frage ohne gültige Korrektmarkierung (z. B. aus
einem MD-Import, bei dem die Antwort nicht in den Optionen stand →
`correctIndex: null`) darf nicht automatisch als „Option A richtig" gewertet
werden. Das Risiko-Quiz degradiert solche Fragen beim Laden zu offenen Fragen
(`GameModel.normalizePlayableQuestions`), damit die Lehrkraft manuell wertet.

## 2. GameState (Multi-Game-Spiele)

Gemeinsame Pflichtfelder aller server-synchronisierten Spiele:

```js
{
  meta: { gameCode: "A3K7", title: "…", createdAt: "ISO-8601" },
  phase: "setup",              // "setup" | "playing"/"running" | "finished" | spielspezifisch
  teams: [ { id, name, color, emoji, score, … } ],
  activeCategoryIds: [ … ],    // gewählte Blatt-Kategorie-IDs (für Resume)
  usedQuestionIds: [ … ],      // als Array serialisiert, im Client Set (_ser/_deser)
  liveQuestion: null | { … },  // aktuell offene Frage (für Schüleransicht-Sync)
  takenTeams: [ 0, 2 ],        // belegte Team-IDs (nur via mutate() geschrieben)
  _rev: 7                       // server-verwaltet, nicht vom Client setzen
}
```

- **`usedQuestionIds`** wird als Array gespeichert, im Client als `Set`
  gehalten. Die `_ser`/`_deser`-Methoden des Storage-Objekts konvertieren.
- **`liveQuestion`** trägt eine eindeutige `id` (Change-Detection), `teamIdx`/
  `teamId` (wer ist dran), das vollständige Fragen-Objekt (für SSE-Empfänger),
  `resolved`, `selectedMcIndex`/`selectedMcIndices`, `autoCorrect`.
- **`takenTeams`** wird server-seitig gemerged (siehe
  [api-referenz.md](api-referenz.md#nebenlaeufigkeit)); Plain-Saves strippen es
  aus dem POST-Body.
- **`_rev`** vergibt der Server. Clients senden es nicht als Wahrheit, sondern
  ggf. `_baseRev` (den zuletzt gesehenen Stand) für Compare-and-Swap.

Spielspezifische Felder (Board, Positionen, Runden usw.) sind in den jeweiligen
Spiel-Dokumenten beschrieben.

### Registry (`index.json` pro Spiel)

```json
{ "A3K7": { "title": "…", "status": "playing", "createdAt": "…", "updatedAt": "…" } }
```

Der Server aktualisiert den Eintrag automatisch bei jedem `game`-POST. Einträge
älter als 24 h (nach `updatedAt`) werden beim Registry-GET gelöscht.

## 3. Memory-Paare (`data/memory/pairs.json`)

```json
{
  "categories": [
    {
      "id": "cat-...",
      "name": "Kategoriename",
      "pairs": [
        {
          "id": "pair-...",
          "sideA": { "type": "text", "content": "…" },
          "sideB": { "type": "formula", "content": "…" },
          "difficulty": 1
        }
      ]
    }
  ]
}
```

`type`: `text` | `formula` (KaTeX) | `image` (URL oder Base64).

## 4. Escape-Room-Spiel (`data/escape-room/game_<id>.json` bzw. localStorage)

```json
{
  "id": "game_1234567890",
  "published": true,
  "game": { "title": "…", "description": "…", "totalTimer": 2400, "mode": "chain" },
  "rooms": [
    {
      "id": "room_1", "name": "…", "subject": "…", "description": "…",
      "backgroundImage": "", "backgroundType": "flat",
      "unlockCode": "4823", "lockType": "padlock",
      "puzzleCard": { "type": "text", "content": "…" },
      "questions": [
        { "id":"q1", "type":"multiple_choice", "text":"…",
          "options":[], "correctAnswer":"…", "caseSensitive":false,
          "hint":"", "codeDigit":"4",
          "points":[…], "connections":[…] }  // nur bei type line_connect
      ],
      "hotspots": [
        { "id":"hs_...", "type":"puzzle", "label":"…", "icon":"🔍",
          "x":50, "y":30, "color":"#d4a853",
          "requires":["hs_other"], "codeDigit":"3",
          "questionIds":["q1"], "noteText":"…" }
      ]
    }
  ]
}
```

- `mode`: `chain` (Räume der Reihe nach) | `single` (frei wählbar)
- `lockType`: `padlock` (Zahlenrad) | `digital` (Tastatur). Codes müssen Ziffern
  sein — der Editor erzwingt das beim Speichern.
- Fragetypen: `multiple_choice`, `text_input`, `number_code`, `error_find`,
  `line_connect`. Bei `line_connect` normalisiert der Import die Punkt-IDs auf
  `[A-Za-z0-9_-]` (sie landen in `onclick`-Strings).
- Hotspot-Typen: `puzzle` (Fragen → Code-Ziffer), `note` (nur Text),
  `exit` (Ausgang, offen wenn alle Puzzles gelöst). Puzzle-Hotspots **ohne**
  `questionIds` gelten als gelöst (sonst wäre der Raum unlösbar).
- Team-Fortschritt liegt separat in `localStorage['escaperoom_team_<gameId>_<team>']`
  mit `startTime`, `pausedAt`, `lastSavedAt`, `finalTime`, `completedRooms`,
  `roomProgress`.

## 5. Markdown-Import-Formate

### 5a. Fragen (`admin.html`, zentrale DB) — Format A

Eine `##`-Sektion pro (Blatt-)Kategorie, Fragen als `### <difficulty>`:

```markdown
## Kategoriename
### 100
- type: mc
- q: Fragetext
- o: Option A | Option B | Option C
- a: Option B
- hint: Tipp

### 300
- type: open
- q: Offene Frage?
- a: Musterlösung
```

Verschachtelte Kategorien werden über Pfadnamen abgebildet: `## Ober › Unter`.
Der Export (`MDParser.toMarkdown`) erzeugt exakt dieses Format — ein Export lässt
sich verlustfrei re-importieren (per Roundtrip-Test abgesichert).

**Pipes in Inhalten (`\|`):** In den pipe-separierten Zeilen (Optionen `o:`,
Memory-Paare, Escape-Room-Fragen) steht `\|` für ein literales `|` im Inhalt
(z. B. LaTeX `$|x|$`). Der Export escapet automatisch, der Import macht genau
eine Escape-Ebene rückgängig — der Roundtrip bleibt verlustfrei
(`MDParser._splitEscapedPipes` bzw. gleichnamige Helfer in Memory/Escape Room).
Rich-Content-Marker (`$…$`, `![…](…)`) sind Teil des Strings und werden von
allen MD-Dialekten unverändert transportiert.

Es gibt zusätzlich ein **Format B** (`## NNN Punkte` + `### Frage N (Offen)`),
das der Parser automatisch erkennt (`/^## \d+\s+Punkte$/`).

### 5b. Memory-Paare (`memory/admin.html`)

```markdown
## Kategoriename
- text | Inhalt A | formula | \frac{1}{2} | 1
```
Format: `typA | inhaltA | typB | inhaltB | schwierigkeit`.
Typen: `text`, `formula`/`formel`, `image`/`bild`.

### 5c. Escape Room (`escape-room/…`)

```markdown
# Spieltitel
- timer: 30
- modus: kette         (kette | einzeln)

## Raumname
- fach: Physik
- code: 4823
- schloss: padlock     (padlock | digital)
- bild: https://…
- rätselkarte: Hinweistext

### Hotspots
- 🔍 | Bücherregal | 20 | 40 | 3 | 1,2    (icon|label|x%|y%|codeDigit|questionIds)
- 📝 | Notizzettel | 30 | 60             (note-Hotspot)
- 🚪 | Ausgang | 80 | 50                 (exit-Hotspot)

### Fragen
- mc | Frage | A | B | C | D | RichtigeAntwort | Hinweis | Ziffer
- text | Frage | Antwort | Hinweis | Ziffer
- zahl | Frage | 42 | Hinweis | Ziffer
```

Der vollständige Escape-Room-MD-Dialekt (inkl. 360°-Panorama-Flags) steht in
`CLAUDE.md → ## Escape Room → MD-Import Format`.

## 6. Custom-Board-/Labyrinth-Formate (Designer)

**Leiterspiel-Brett** (`data/leiterspiel-designer/boards.json`, Array):
```json
{ "id","name","backgroundImage","aspectRatio",
  "fields":[{"id","number","points":[[x,y]…],"difficulty","bonusType","isStart","isGoal"}],
  "ladders":[{"from","to"}], "snakes":[{"from","to"}] }
```

**Labyrinth** (`data/labyrinth-designer/mazes.json`): Gitter mit Wand-/Tür-Bits
pro Zelle, erzeugt vom `MazeGenerator` oder manuell im Designer.
