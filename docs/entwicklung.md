# Entwicklung & Erweiterung

## 0. Vor JEDER Erweiterung: Spezifikation abfragen ⚠️

**Stehende Anweisung des Betreibers:** Wenn ein neues Spiel oder eine größere
Erweiterung gewünscht wird, sind zuerst die folgenden Spezifikationsfragen zu
klären — **bevor** mit dem Planen oder Implementieren begonnen wird. Nicht raten,
nicht mit Defaults „einfach loslegen". Erst fragen, dann planen.

### Spezifikations-Fragebogen (neues Spiel / größere Erweiterung)

1. **Mehrspieler / Multi-Device?**
   - Einzelspieler (rein lokal, kein Server) — wie Memory, Lernkarten, SLF?
   - Oder Multi-Device: mehrere Geräte, ein Spiel, Echtzeit-Sync — wie die
     Quiz-Spiele? → dann Spielverwaltung + Code-System + SSE nötig.

2. **Welche Ansichten werden gebraucht?**
   - Lehrergerät (`index.html`, autoritativ)?
   - Schülergerät (`view.html`/`play.html`)?
   - **Tafelansicht** (`board.html`, Beamer, reine Anzeige)?
   - Einzelspieler-Variante (`solo.html`)?

3. **Fragen aus der zentralen Datenbank (`data/questions.json`) — ja/nein?**
   - Ja (Standard, empfohlen): Konvertierung mit True-Leaf-Regel; Admin verweist
     auf `../admin.html`.
   - Nein: nur wenn die Spielmechanik ein grundlegend anderes Format braucht
     (wie Memory = Paare, Codenames = Wortlisten). Dann eigene Datenstruktur,
     eigener Editor, Grund dokumentieren.

4. **Wenn Multi-Device: Team-Modell?**
   - Feste Teams von der Lehrkraft angelegt?
   - Exklusiver Team-Beitritt (`takenTeams`, ein Gerät pro Team)?
   - Kick durch Lehrkraft nötig?

5. **Wer wertet Antworten aus?**
   - MC automatisch auf dem Schülergerät (schnell) oder über Lehrkraft-Round-Trip?
   - Offene Fragen (immer manuell durch die Lehrkraft)?

6. **Persistenz / Wiederaufnahme?**
   - Soll ein laufendes Spiel nach Reload/Standby fortsetzbar sein
     (Lehrer-Reentry, Schüler-Reconnect)?
   - Highscores (localStorage) bei Einzelspieler?

7. **Editor / Designer nötig?** (z. B. Board-/Labyrinth-Designer)

8. **Theme?** Standard-Palette (Orange hell / Dunkelblau dunkel) oder
   spielspezifisch (Begründung)?

Erst wenn diese Punkte geklärt sind, einen Plan erstellen. Die Antworten
bestimmen, welche der untenstehenden Muster/Vorlagen zum Einsatz kommen.

> Diese Regel gilt auch für KI-Assistenten und ist zusätzlich in `CLAUDE.md`
> verankert.

## 1. Konventionen

- **Sprache:** UI und Code-Kommentare auf Deutsch. Knappe Kommentare, nur wo der
  Code die Einschränkung nicht selbst zeigt.
- **Kein Build, kein Framework, keine neuen Abhängigkeiten.** Reines DOM.
- **Bestehenden Stil je Datei übernehmen** (Namensgebung, Kommentardichte).
- **Öffentliche Funktionsnamen nicht umbenennen** — viele hängen an inline
  `onclick="…"`-Attributen.
- **Styling-Paletten** stehen in `CLAUDE.md → ## Styling-System` (Orange/Dunkelblau
  Standard). Theme-Key: `spiele_theme`.

## 2. Wiederkehrende Muster & Fallstricke

### True-Leaf-Erkennung (Kategoriehierarchien)
Ein Knoten ist nur dann ein Blatt, wenn `questions.length > 0 && (subcategories||[]).length === 0`.
Falsche Prüfung → Kategorien verschwinden. Betrifft alle `convertRQto…`,
`_buildCatNode`, `_countLeafQ`, `collectLeafCategories`.
Details: [datenformate.md](datenformate.md#kritische-regel-true-leaf-erkennung).

### IIFE-Scope bei `onclick`
Funktionen innerhalb `(function(){…})()` sind aus inline `onclick="…"` **nicht**
erreichbar — nur `window.xxx = …`-Exports. Seiteneffekte in einen
`window.`-Export legen. (Trat im Escape Room mehrfach auf.)

### Function Declaration vs. Assignment beim Spielwähler
`onclick="createNewGame()"` findet die Funktion nur, wenn sie eine gehoistete
Function Declaration ist (`async function createNewGame(){}`), nicht als
`window.createNewGame = async function(){}` (nicht gehoistet). `_gsEnter`/
`_gsDelete` als Declarations definieren und danach manuell exportieren.

### Duplizierte Storage-Objekte
`LsStorage`, `QpStorage`, `GameSync` sind über mehrere Dateien kopiert. Eine
Änderung am Storage-Muster in **allen** Kopien vornehmen (Liste in
[architektur.md](architektur.md#schreibmodell)). `StorageManager` und `BsStorage`
liegen dagegen je in einer geteilten `js/`-Datei.

### Schreibmodell nicht verwechseln
Rundenbasierte Spielzüge = Force-Write. Nur umkämpfte Pfade (Beitritt/Kick/
Steal) = `mutate()` mit `_baseRev`. Siehe
[api-referenz.md](api-referenz.md#nebenlaeufigkeit).

### `takenTeams` nur über `mutate()`
Plain-Saves müssen `takenTeams` aus dem POST-Body strippen (localStorage behält
es), der Server merged es. Sonst Phantom-Kicks.

### XSS an der Vertrauensgrenze
`color`/`emoji`/`symbolIcon` aus dem Sync-Zustand bei der Deserialisierung
klemmen (nicht an jeder Render-Stelle). Nutzertexte immer escapen.

### Rich-Content nur über js/rich-content.js
Inhalts-Strings (Fragen, Optionen, Antworten, Begriffe, …) werden mit
`renderRichContent()` angezeigt (escaped selbst, rendert `$…$`-Formeln und
`![…](…)`-Bilder mit geklemmter src) bzw. `richToPlainText()` für Stellen ohne
HTML. Keine eigenen Formel-/Bild-Renderer bauen; pro Seite
`lib/katex/katex.min.js` + `js/rich-content.js` einbinden. Details:
[datenformate.md §0](datenformate.md) und `CLAUDE.md → Rich-Content`.

### Change-Detection im `subscribe`
Callback nur bei tatsächlicher Änderung aufrufen (JSON-Vergleich), sonst
Dauer-Re-Renders / flackernde Timer & Eingabefelder.

## 3. Tests (ohne Test-Framework)

Es gibt kein Test-Framework. Bewährter manueller Prüfablauf nach Änderungen:

- **PHP-Syntax:** `php -l api.php`, `php -l codenames/api.php`
- **JS-Syntax:** `node --check <datei.js>` für jede geänderte `.js`
- **Inline-Scripts (HTML):** jeden `<script>`-Block ohne `src` extrahieren und
  per `new Function(src)` in Node parsen (kleines Wegwerf-Skript).
- **Server-Verhalten:** `php -S 127.0.0.1:8899` + `curl` — z. B. CAS-409,
  `takenTeams`-Merge, Token 403/200, Schüler-Pfade offen. Testspielstände danach
  löschen (`data/games/<spiel>/TSTx.json` + `.lock` + Registry-Eintrag).
  **Achtung:** von `php -S` erzeugte/veränderte Dateien unter `data/` prüfen und
  nicht versehentlich versionierte Dateien (z. B. `data/drafts.json`) committen.
- **Logik-Roundtrips:** wo sinnvoll ein Wegwerf-Node-Skript, das die reine
  Funktion prüft (Beispiel: MD-Export→Parse→Vergleich für `MDParser`).

## 4. Checkliste: neues Multi-Device-Spiel

Wenn der Fragebogen (§0) „Multi-Device + zentrale DB" ergibt:

1. Ordner anlegen; Copy-Paste aus `_templates/spielverwaltung/`
   (`_templates/README.md` erklärt die Integration).
2. In `api.php` einen Prefix im `$gameDirs`-Array ergänzen (Verzeichnis unter
   `data/games/<spiel>/`). SSE/Registry/Game-Endpunkte entstehen automatisch aus
   dem Prefix.
3. In `.htaccess` den SSE-`RewriteCond` und die Deny-Regel um den neuen Prefix
   erweitern.
4. Storage-Objekt (`XxxStorage`) einbinden — inkl. `_ser`/`_deser`,
   `mutate`, `checkServer`-TTL, Change-Detection im `subscribe`, `X-Admin-Key` in
   destruktiven Aufrufen.
5. `index.html` (Spielwähler + Setup + Board), `view.html`, optional
   `board.html`/`solo.html`. `admin.html` als Verweis auf `../admin.html`.
6. Konvertierung `convertRQto<Spiel>` mit True-Leaf-Regel; `activeCategoryIds`
   für Resume speichern.
7. Spiel in `spiele.html` registrieren (`DEFAULT_ENABLED`/`NEW_GAMES`).
8. Dokument unter `docs/spiele/<spiel>.md` anlegen und in `docs/README.md`
   verlinken. `reference_file_map.md` (Memory) aktualisieren.
9. Testablauf aus §3 durchlaufen.

## 5. Backup & Deployment <a id="backup-und-deployment"></a>

Workflow des Betreibers (Reihenfolge einhalten):

1. **Erst Git:** `git add -A && git commit` (Message auf Deutsch), dann
   `git push origin main`.
2. **Dann ZIP:**
   `powershell -ExecutionPolicy Bypass -File ".../create-zip.ps1"`
   - erzeugt `backups/Spiele.zip` (Delta: nur geänderte Dateien seit letztem ZIP,
     **ohne** Spieldaten) → dieses auf den Server hochladen
   - erzeugt ein versioniertes Voll-Archiv unter `backups/FULL/`
   - erzeugt bei Bedarf Pro-Spiel-ZIPs unter `dist/`
3. Immer erwähnen, dass ein ZIP erstellt wurde.

Weitere Skripte: `create-zip-game.ps1` (einzelnes Spiel), `create-zip-memory.ps1`.
GitHub-Repo: https://github.com/Cyric25/Learning_Games

**Nicht committen/löschen:** Inhalte von `data/games/` sind teils versioniert
(bestehende Konvention) — nicht anfassen. Keine Laufzeitdaten committen, die der
Server erzeugt.

## 6. Offene Restrisiken <a id="restrisiken"></a>

Bewusst offen gelassen (Schulkontext-Abwägung):

- **Escape-Room-Lösungen** liegen clientseitig (localStorage/DOM) und sind mit
  Aufwand einsehbar; das Escape-Room-Admin-Passwort `LP@FOS` steht im Quelltext.
- **Admin-Token** `LP-Spiele-2026` ist kein Geheimnis (steht im Client-Quelltext),
  nur eine Vandalismus-Hürde. Bei Bedarf ändern (siehe
  [api-referenz.md → Admin-Token](api-referenz.md#3-admin-token)).
- **Risiko-Quiz `stealCandidates`:** theoretisch durch einen Lehrer-Plain-Save
  überschreibbar (Fenster durch Schüler-CAS + SSE minimal).
- **Memory-Paare / Settings** haben keinen Token-Schutz (nicht Teil der
  Härtungsrunde).
- **SSE bei sehr großen Klassen** hält je Verbindung einen PHP-Worker (bis 30 s).
  Keepalive gibt abgebrochene Verbindungen frei; bei extrem knappem
  Worker-Budget bleibt Long-Polling die sauberere (nicht umgesetzte) Alternative.

## 7. Referenzdokumente

- `CLAUDE.md` — verbindliche Kurzreferenz (Styling-Paletten, Copy-Paste-Muster,
  MD-Dialekte im Detail).
- `memory/reference_file_map.md` (im Memory-Ordner der KI) — Screen-IDs und
  JS-Funktions-Zeilennummern. **Regelmäßig veraltet** — Zeilennummern immer per
  Grep auf Funktionsnamen verifizieren.
- `_templates/README.md` — Integrationsanleitung für die Spielverwaltung.
