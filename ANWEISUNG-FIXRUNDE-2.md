# Arbeitsanweisung: Fix-Runde 2 (Ergebnisse des zweiten Code-Reviews)

**An:** Claude (Opus) — neue Session, kein Vorwissen aus der bisherigen Konversation.
**Repo:** `c:\Users\mtnhu\OneDrive - Bildungsdirektion\#Unterricht\Programme\Spiele` (git, Branch `main`).

---

## 1. Kontext (unbedingt zuerst lesen)

- Interaktive Unterrichtsspiele, HTML/JS/PHP, **kein Build-System**. `CLAUDE.md` im Repo-Root beschreibt Architektur und Muster — lesen.
- Backend: `api.php` (Multi-Game, 4-stellige Codes, SSE) + `codenames/api.php`. Läuft auf PHP-Shared-Hosting. Eine Schulklasse = 25+ gleichzeitige Geräte.
- **Sync-Modell (wichtig, nicht ändern):** Gemischtes Modell.
  - Spielstand-POSTs **ohne** `_baseRev` = autoritative „Plain-Saves" (Lehrergerät, rundenbasierte Spielzüge) → Server schreibt direkt und vergibt `_rev = alt+1`.
  - POSTs **mit** `_baseRev` = Compare-and-Swap: Server prüft unter `flock` gegen gespeichertes `_rev`; bei Abweichung **HTTP 409 + aktueller Stand im Body**. Client-Helfer `mutate(code, fn)` (in `BsStorage`, `QpStorage`, `GameSync`) retryt bei 409 automatisch (max. 6×). Genutzt bisher nur für Team-Beitritt und Kick.
- Es gab bereits eine Fix-Runde 1. Ein zweiter, unabhängiger Review hat (a) Schwächen dieser Fixes und (b) neue Bugs gefunden. Diese Anweisung listet alle abzuarbeitenden Funde.
- **Zeilennummern sind Näherungswerte** (Stand des Reviews). Immer per Grep nach Funktionsname/Code-Schnipsel lokalisieren, nie blind an Zeile X editieren. **Jeden Fund vor dem Fixen am Code verifizieren** — sollte ein Fund nicht (mehr) zutreffen, dokumentieren und überspringen.

## 2. Arbeitsweise / Workflow (verbindlich)

1. Blockweise arbeiten (Reihenfolge wie unten), Todo-Liste führen.
2. Nach **allen** Änderungen prüfen:
   - `php -l api.php` und `php -l codenames/api.php`
   - `node --check` für jede geänderte `.js`-Datei
   - Inline-Skripte geänderter HTML-Dateien: jeden `<script>`-Block ohne `src` per `new Function(src)` in Node syntax-prüfen (kleines Wegwerf-Skript).
   - Für Server-Änderungen (Block A1, A3, C): mit `php -S 127.0.0.1:8899` + `curl` einen kurzen Integrationstest fahren (Plain-Save, CAS-Save, 409-Fall, takenTeams-Merge). Testspielstände danach löschen (`data/games/<spiel>/TSTx.json` + Registry-Eintrag + `.lock`).
3. **Workflow-Präferenz des Nutzers:** erst `git add -A && git commit` (aussagekräftige Message, Ende: `Co-Authored-By: Claude ... <noreply@anthropic.com>`) und `git push origin main`, **danach** ZIP erstellen via:
   `powershell -ExecutionPolicy Bypass -File "C:/Users/mtnhu/OneDrive - Bildungsdirektion/#Unterricht/Programme/Spiele/create-zip.ps1"`
   Explizit erwähnen, dass das ZIP erstellt wurde.
4. Kommentare im Code auf Deutsch, knapp, nur wo der Code die Einschränkung nicht selbst zeigt (bestehenden Stil beibehalten).
5. **Nichts umbauen, was nicht in dieser Liste steht.** Keine Refactorings, keine Formatierungsänderungen.

---

## 3. Block A — Regressionen/Schwächen der Fix-Runde 1 (höchste Priorität)

### A1. Phantom-Kicks: Plain-Saves überschreiben `takenTeams` (Schiffeversenken, Labyrinth, QuizPfad)
**Problem:** Spielzug-Saves (ohne `_baseRev`) enthalten das lokale, evtl. veraltete `takenTeams`. Tritt ein Team bei (CAS-Save) und speichert ein anderes Gerät innerhalb der SSE-Latenz einen Spielzug, ist der Beitritt weg → Kick-Detection (`!takenTeams.includes(myTeamId)`) feuert fälschlich.

**Festgelegte Lösung (genau so umsetzen):**
1. **Server (`api.php`, `gameEndpoint` POST):** Wenn der eingehende State **kein** Feld `takenTeams` enthält, der gespeicherte Stand aber eines hat → gespeichertes `takenTeams` in den eingehenden State kopieren (innerhalb des bestehenden `flock`-Blocks, vor `atomicWrite`). Damit ist `takenTeams` server-merged und nur noch über CAS-Saves (Beitritt/Kick, die es explizit mitsenden) änderbar.
2. **Clients:** In den **Plain-Save-Pfaden** das Feld `takenTeams` aus dem POST-Payload entfernen (NICHT aus der localStorage-Kopie — im file://-Offline-Modus muss es lokal erhalten bleiben):
   - `schiffeversenken/js/shared.js` → `BsStorage.save()`: Payload für den `fetch` ohne `takenTeams` bauen (z.B. `const {takenTeams, ...payload} = this._ser(gs)`), localStorage weiterhin mit vollem State.
   - `quizpfad/js/quizpfad.js` und `quizpfad/view.html` → beide `QpStorage.save()`-Kopien: gleiches Muster.
   - `Labyrint-Quiz/js/play.js` und `Labyrint-Quiz/js/labyrinth.js` → beide `GameSync.save()`-Kopien: gleiches Muster.
   - `Leiterspiel-quiz/js/leiterspiel.js` + `Leiterspiel-quiz/view.html` (`LsStorage.save`): ebenfalls strippen (Leiterspiel hat noch kein takenTeams-Feature, aber so bleibt es zukunftssicher; schadet nicht).
3. **`mutate()`-Pfade unverändert lassen** — sie senden `takenTeams` weiterhin mit (das ist gewollt; sie sind die einzigen legitimen Schreiber).
4. **Integrationstest:** Plain-Save ohne takenTeams gegen Stand mit `takenTeams:[1]` → GET muss `takenTeams:[1]` weiterhin enthalten.

### A2. Labyrinth: `_lastStateRev` läuft dem Server voraus
**Datei:** `Labyrint-Quiz/js/play.js`, Funktion `postState()` und `GameSync.save()`.
**Problem:** `postState` inkrementiert `_lastStateRev` lokal VOR dem fire-and-forget-Save. Schlägt der POST fehl, verwirft der Echo-Filter (`data._rev < _lastStateRev`) fortan alle echten Updates.
**Fix:** `GameSync.save()` soll die Server-Antwort auswerten und das JSON zurückgeben (`{ok, rev}` oder `null` bei Fehler). `postState` setzt `_lastStateRev` **nicht mehr selbst hoch**, sondern via `.then(j => { if (j && j.rev) _lastStateRev = j.rev; })` aus der Antwort (fire-and-forget bleibt erhalten, kein `await` im Aufrufer nötig). Der optimistische lokale Render in `postState` bleibt unverändert.

### A3. `.lock`-Dateien werden gelöscht → flock auf verwaister Inode
**Dateien:** `api.php` (`cleanupExpiredGames`: Zeile mit `@unlink($gamePath . '.lock')`; `gameEndpoint` DELETE: `@unlink($path . '.lock')`) und `codenames/api.php` (`cleanupGames`: `@unlink($dir.'/'.$pin.'.lock')`).
**Fix:** Diese drei `unlink`-Aufrufe auf `.lock`-Dateien **entfernen** (Lock-Dateien sind winzig und dürfen liegen bleiben — sie zu löschen erlaubt zwei parallelen Writern, auf unterschiedlichen Inodes „exklusiv" zu locken). Kurzen Kommentar hinterlassen, warum sie absichtlich nicht gelöscht werden.

### A4. MazeRenderer: Resize-Listener-Leak
**Datei:** `Labyrint-Quiz/js/renderer.js` (Konstruktor registriert `window.addEventListener('resize', ...)` ohne Abmeldung) + `Labyrint-Quiz/js/labyrinth.js` (erzeugt pro `_gsEnter`/`startGame` neue Renderer).
**Fix:** Handler-Referenz im Konstruktor speichern (`this._onResize = () => {...}`), `destroy()`-Methode ergänzen (`window.removeEventListener('resize', this._onResize); this.maze = null; this.gameState = null;`). In `labyrinth.js` vor jeder Neuanlage eines Renderers und in `resetToSelector()` `renderer?.destroy()` aufrufen. In `play.js`/`board.html`/`solo.html` prüfen, ob Renderer mehrfach erzeugt werden — falls ja, gleiches Muster.

### A5. Risiko-Quiz Schüler-Timer startet nach Reload neu statt 0 zu zeigen
**Datei:** `risiko-quiz/view.html`, Funktion `startSQTimer` (Zeilen mit `startedLocal`/`base`).
**Fix:** Die Zeile `const base = (Date.now() - startedLocal > total * 1000) ? Date.now() : startedLocal;` ersetzen: kein Neustart. Stattdessen `base = startedLocal` beibehalten und in `tick()` `remaining = Math.max(0, total - elapsed)` einfach 0 anzeigen lassen (danger-Zustand). Die `Math.min(Date.now(), lq.openedAt)`-Normalisierung gegen Uhren-Skew bleibt.

### A6. Escape Room: Pause greift nur beim „Verlassen"-Button; Quota-Fix fehlt in standalone
**Dateien:** `escape-room/index.html` UND `escape-room/standalone.html` (beide identisch behandeln!).
1. In `saveTeamState()` zusätzlich `currentTeam.lastSavedAt = Date.now();` setzen (vor dem Serialisieren).
2. In `resumeGame()`: wenn **kein** `pausedAt`, aber `lastSavedAt` vorhanden und `Date.now() - lastSavedAt > 60000` → `currentTeam.startTime += Date.now() - currentTeam.lastSavedAt;` (Tab-geschlossen-Lücke als Pause werten). Der bestehende `pausedAt`-Pfad bleibt davor.
3. **Nur standalone.html:** `saveCurrentGame` ist dort noch fire-and-forget und meldet immer „Gespeichert!". Den Fix aus index.html übernehmen: `async`, `const ok = await saveGame(saved)`, Statusmeldung abhängig von `ok` (bei Fehler Warnstatus „Speichern fehlgeschlagen (Speicher voll)").

### A7. Schiffeversenken: `fireShot` setzt `_shownLqId` nicht
**Datei:** `schiffeversenken/view.html`, Funktion `fireShot` (ruft `showQuestionOverlay` direkt auf).
**Fix:** Unmittelbar vor dem direkten `showQuestionOverlay(...)`-Aufruf `_shownLqId = <neue liveQuestion>.id;` setzen — sonst baut das SSE-Echo des eigenen Saves Overlay + MC-Timer neu auf (Timer springt zurück, Buttons werden unterm Finger ersetzt).

### A8. api.php SSE: `md5_file` pro Iteration zu teuer
**Datei:** `api.php`, Funktion `sseStream` (Signatur-Berechnung in der Schleife).
**Fix:** Signatur zweistufig: pro Iteration nur `filemtime.':'.filesize` vergleichen; **nur wenn** sich diese Kurz-Signatur geändert hat, zusätzlich `md5_file` rechnen und die volle Signatur vergleichen/senden. (Der md5 bleibt nötig, um mehrere Saves in derselben Sekunde mit gleicher Größe zu erkennen — aber nur im Änderungsfall.)

---

## 4. Block B — Neue Funde aus Review-Runde 2

### B1. KRITISCH: MD-Export/Re-Import verliert alle Fragen
**Datei:** `risiko-quiz/js/shared.js`, `MDParser.toMarkdown` (und Parser-Gegenstück `parse`, Format A: Schwierigkeit wird über `/^### /` erkannt).
**Problem:** `categories.forEach` schreibt `## sub.name` und ruft `writeNode(sub, 1)` auf → `diffPrefix` wird `####` → beim Re-Import matcht keine Schwierigkeits-Überschrift, alle Fragen gehen still verloren.
**Fix:** Tiefenlogik korrigieren, sodass die direkten Fragen einer `##`-Unterkategorie als `### <difficulty>` exportiert werden und Kind-Unterkategorien eine Ebene tiefer als der jeweilige Fragen-Prefix liegen. **Pflicht-Verifikation:** Roundtrip-Test in Node schreiben (Beispiel-Fragenbank mit 2 Ebenen + Fragen → `toMarkdown` → `parse` → Anzahl Fragen und Felder vergleichen) und ausführen. Der Test kann als Wegwerf-Skript im Scratchpad laufen, muss aber im Commit-Text als „Roundtrip verifiziert" dokumentiert sein.

### B2. HOCH: Lehrergerät nach Reload ausgesperrt (Risiko-Quiz)
**Datei:** `risiko-quiz/js/game.js`, `init()` (entfernt `?code=` per `history.replaceState`) und `joinGame()` (leitet immer zu `view.html`).
**Fix:** (a) Beim erfolgreichen `loadGame(code)` den Code in `localStorage` unter `rq_last_teacher_code` merken. (b) In `init()` ohne URL-Code: wenn `rq_last_teacher_code` existiert und das Spiel noch lädt (`loadGameState` liefert `meta`), einen deutlich sichtbaren Button/Bereich im Join-Screen anzeigen: „▶ Laufendes Spiel <CODE> als Spielleiter fortsetzen" → ruft `loadGame(code)` auf. Kein Auto-Redirect (die Lehrkraft könnte bewusst joinen wollen). (c) Bei `resetGame`/Spielende den Key löschen.

### B3. HOCH: `confirmEndGame` speichert gegen `code=null` (Schiffeversenken)
**Datei:** `schiffeversenken/index.html`, `confirmEndGame` (Save ohne await, danach `resetToSelector()` → `setCode(null)`).
**Fix:** Funktion `async` machen, `await BsStorage.save(gameState);` VOR `resetToSelector()`. Zusätzlich in `BsStorage.save()` (`schiffeversenken/js/shared.js`) den Code am Funktionsanfang in eine lokale Konstante binden und diese für URL + localStorage-Key verwenden (Schutz gegen Code-Wechsel während await).

### B4. HOCH: `checkServer()` cacht einen einzelnen Timeout für immer
**Dateien:** alle Storage-Objekte mit `_serverOk`-Cache: `schiffeversenken/js/shared.js`, `quizpfad/js/quizpfad.js`, `quizpfad/view.html`, `Leiterspiel-quiz/js/leiterspiel.js`, `Leiterspiel-quiz/view.html`, `risiko-quiz/js/shared.js` (dort `_hasServer`/Init prüfen — Muster kann abweichen).
**Fix:** Negatives Ergebnis nur mit TTL cachen: bei `false` zusätzlich `_serverCheckedAt = Date.now()` merken; ist der Cache `false` und älter als 15 s → erneut prüfen. Positives Ergebnis darf dauerhaft gecacht bleiben. (file://-Erkennung bleibt dauerhaft false.)

### B5. Sieger-/Spielende-Logikfehler
1. **QuizPfad falscher Sieger:** `quizpfad/js/quizpfad.js`, SSE-Handler (Suche nach `reduce((b,t,i)`): `t.position > (b ? teams[b].position : -1)` — Index 0 ist falsy. Ersetzen durch `teams.reduce((best,t,i) => t.position > teams[best].position ? i : best, 0)`. Gleiche Muster-Suche über das ganze Repo (`(b ? ` + `position`) und alle Vorkommen fixen (auch `quizpfad/view.html`/`board.html`, dort `reduce((best, t) => ...` mit Objekt statt Index — prüfen, ob korrekt; Objekt-Variante mit `(best ? best.position : -1)` ist OK, nur die Index-Variante ist kaputt).
2. **Leiterspiel `freeMove` Siegcheck:** `Leiterspiel-quiz/js/leiterspiel.js`, in `freeMove()` gibt es nach der Leiter-/Schlangen-Folgebewegung noch einen Check auf `=== 100` bzw. hartkodierte 100 (der erste Zielcheck wurde bereits auf `getFieldCount()` umgestellt — den/die restlichen finden: `grep -n "100" leiterspiel.js` im Bereich freeMove/afterLanding). Alle auf `getFieldCount()` umstellen.

### B6. Multi-Correct-Fragen: `correctIndex ?? 0` + Admin-Editor
1. **Auto-Wertung deaktivieren, wenn keine Korrektmarkierung existiert:** In `risiko-quiz/js/game.js` und `risiko-quiz/view.html` (Funktion `correctSet`/`isMcCorrect`-Äquivalente, Fallback `[q.correctIndex ?? 0]`): Wenn `q.correctIndex == null` UND keine `correctIndices` → Frage wie eine offene Frage behandeln (keine Auto-Wertung; auf dem Lehrergerät Richtig/Falsch-Buttons zeigen). Minimal-invasive Umsetzung wählen; wenn das zu tief eingreift: mindestens beim Laden der Fragenbank (`loadQuestions`-Pfad oder `sanitizeQuestionBank` in `admin.html`) solche MC-Fragen zu `type:'open'` degradieren und eine Konsolen-Warnung ausgeben.
2. **Admin-Editor `correctIndices`:** `risiko-quiz/js/admin.js`, `saveQuestion` + MC-Options-Rendering: Beim Speichern einer Frage, die nur per Radio (Single) bearbeitet wurde, `delete q.correctIndices;` ausführen, damit die Korrektur wirkt. (Vollen Multi-Select-Editor NICHT nachbauen — der existiert bereits in der zentralen `admin.html`; nur den Stale-Daten-Bug beheben.)

### B7. `pressWeissNicht` ohne Absender-Guard
**Datei:** `risiko-quiz/view.html`, `pressWeissNicht`.
**Fix:** Nach dem Fresh-Load prüfen, ob das aktive Team `=== myTeamId` ist (gleiche Guard wie in `selectMcOption`), sonst abbrechen.

### B8. `strtotime(false)`-Löschung + Registry-Härtung
**Datei:** `api.php`, `cleanupExpiredGames`.
**Fix:** `$ts = strtotime($timestamp); if ($ts === false) continue; $age = $now - $ts;`

### B9. XSS-Restlücke: `team.color` und `emoji` (alle Multiplayer-Spiele)
**Problem:** Teamnamen sind escapt, aber `color`/`emoji` gehen roh in `style="background:${...}"` bzw. innerHTML — bei unauthentifiziert beschreibbarem State ein Stored-XSS-Vektor.
**Festgelegte Lösung:** Zentrale kleine Helfer pro Datei (oder pro Storage-Objekt): `safeColor(c)` → `/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#888'`; Emojis: `safeEmoji(e)` → `String(e||'').length <= 8 && !/[<>"'&]/.test(e) ? e : '👥'`. Alle Interpolationsstellen umstellen:
- `risiko-quiz/view.html` (`team.color` in Templates), `risiko-quiz/js/game.js` (`getTeamColor`-Verwendungen in innerHTML-Templates, Steal-Buttons, Ranking)
- `schiffeversenken/index.html` + `view.html` (`t.color`, `t.emoji`)
- `quizpfad/view.html` + `board.html` (`t.color`, `team.color`), `quizpfad/js/quizpfad.js` Setup-Zeile `row.innerHTML = '... value="' + color + '" ...' + name ...` → `escapeHtml(name)` + `safeColor(color)`
- `Labyrint-Quiz/js/play.js` (Team-Buttons: emoji/symbolIcon), `labyrinth.js` (Team-Liste)
- `Leiterspiel-quiz/js/leiterspiel.js` + `view.html` (emoji in Templates)
Vorgehen: pro Datei `grep -n '\${t\.color\|\${team\.color\|\.emoji'` bzw. `+ t.color +` und systematisch ersetzen. Reine `textContent`-Zuweisungen sind OK und bleiben.
Zusätzlich: `escAttr` in beiden Escape-Room-Dateien um `.replace(/'/g,'&#39;')` erweitern; im Escape Room die `onclick="lcClickPoint('<id>')"`-Interpolationen auf `data-`-Attribute + `addEventListener`-Delegation umstellen (IDs aus Importen sind nutzerkontrolliert) — mindestens aber die Punkt-IDs in `normalizeImportedGame` auf `/^[A-Za-z0-9_\-]{1,40}$/` normalisieren (bei Verstoß neue ID generieren; Referenzen in `connections` mit-umschreiben!).

### B10. Escape Room (beide Dateien, sofern nicht anders vermerkt)
1. **Timer im Explorer-Modus unsichtbar:** `startTimer()` aktualisiert nur `#timer-el`; `#timer-el-explorer` bleibt leer/als leere Pille sichtbar. Fix: In `startTimer` beide Elemente beschreiben (gleicher Text/Klassen), `#timer-el-explorer` initial `hidden` geben und nur im Explorer-View einblenden; in `stopTimer` beide verstecken.
2. **„Spiel starten" überschreibt Spielstand:** In `startGame()` vor dem Anlegen von `currentTeam`: wenn `loadTeamState(currentGame.id, name)` einen Stand liefert → `confirm('Für dieses Team existiert ein Spielstand. Wirklich neu starten? Der Fortschritt geht verloren.')`, bei Abbruch `return`.
3. **Puzzle-Hotspot ohne Fragen = Raum unlösbar:** In `isHotspotSolved()` Hotspots mit leerem/fehlendem `questionIds` als gelöst werten (`return true`), PLUS im Editor (`syncRoomsFromDOM` oder Hotspot-Speichern) eine Warnung anzeigen, wenn ein Puzzle-Hotspot keine Fragen hat.
4. **`requires`-Zyklen:** Beim Setzen einer requires-Checkbox im Admin per einfacher DFS prüfen, ob dadurch ein Zyklus entsteht → `alert` + Checkbox zurücksetzen.
5. **Unlock-Code Nicht-Ziffern:** Editor-Feld (`data-field="unlockCode"`) auf Ziffern beschränken (beim `syncRoomsFromDOM` `String(...).replace(/\D/g,'')` + Warnhinweis, falls etwas entfernt wurde); MD-Import (`code:`-Zeile) ebenso.
6. **`||`-Fallback verhindert Feld-Leeren:** In `syncRoomsFromDOM()` alle Muster `x?.value || alt` für Textfelder auf `x ? x.value : alt` umstellen (betrifft u.a. `q.text`, `q.hint`, `q.codeDigit`). Achtung: Nur dort, wo das Eingabefeld wirklich existiert, sonst Datenverlust beim Teil-Rendering — deshalb exakt die Ternary-Form verwenden.
7. **Fortschritt an Raum-Indizes:** NICHT auf IDs migrieren (zu invasiv). Stattdessen defensive Variante: in `resumeGame`/`enterRoom` Indizes validieren (`currentRoom >= rooms.length` → auf 0 klemmen statt `showGameComplete`); `completedRooms.length >= rooms.length`-Check bleibt.
8. **standalone iOS-Export:** `downloadJSON`-Implementierung aus `index.html` (mit `<a download>` + data-URI-Fallback + verzögertem `revokeObjectURL`) nach `standalone.html` übernehmen (dort ist noch `window.open('data:...')`).
9. **IIFE-Reset-Bug:** Inline-`onclick="showView('view-game-select');currentGame=null;..."` (beide Dateien) setzt window-Globals statt IIFE-Variablen. Fix: `window.resetToGameSelect = function(){ currentGame=null; currentTeam=null; stopTimer(); showView('view-game-select'); }` innerhalb der IIFE exportieren, onclick darauf umstellen.

### B11. Kick-Härtung Schiffeversenken/Labyrinth
1. `Labyrint-Quiz/js/play.js` `handleKicked()`: `clearInterval(diceAnimId)` ergänzen; in `postState()` als erste Zeile `if (myTeamId === null) return;`.
2. `schiffeversenken/view.html` `handleKicked()`: `clearMCTimer()` ergänzen; in `submitMCAnswer`/`handleMCTimeout`/`fireShot` früh `if (myTeamId === null) return;`.
3. **Re-Subscription nach Kick (beide):** Nach dem `showTeamSelect(state)` im Kick-Pfad dieselbe Teamauswahl-Subscription starten wie beim Join (Muster existiert in `doJoin`/`joinGame`).

### B12. Abbruch-Race Schiffeversenken
`schiffeversenken/index.html` `abortLiveQuestion()`: statt direkt `processShot(false)` zuerst frisch laden (`BsStorage.load`) und prüfen, ob `liveQuestion` noch existiert und dieselbe `id` hat wie beim Klick; wenn nicht (Schüler-Antwort kam zuvor an) → abbrechen und `gameState` mit dem frischen Stand aktualisieren, kein `processShot`.

### B13. Performance: Change-Detection + SSE-Rückkehr vereinheitlichen
1. **Fehlende Dedupe in Schüler-/Tafel-Subscribes:** `Leiterspiel-quiz/view.html`, `quizpfad/view.html`, `quizpfad/board.html` — den `emit(raw)`-Wrapper (lastJson-Vergleich) aus den Lehrer-Kopien (`leiterspiel.js`/`quizpfad.js` `subscribe`) in diese drei `subscribe()`-Kopien übernehmen.
2. **`Labyrint-Quiz/board.html`:** Poll (400 ms, ohne Vergleich) auf das Muster aus `play.js` umstellen (JSON-Vergleich, Intervall 1000 ms).
3. **Schiffeversenken SSE-Rückkehr:** In `BsStorage.subscribe` (`schiffeversenken/js/shared.js`) nach `onerror` nicht dauerhaft pollen: wie im Labyrinth nach ~10 s erneut SSE versuchen (Poll stoppen, `startSSE()`), Fallback-Poll-Intervall auf 1000 ms außerhalb aktiver eigener Fragen ist NICHT nötig — 500 ms beibehalten ist ok, aber SSE-Retry ergänzen.
4. **Labyrinth Echo-Zweig rendert veraltete Daten:** `play.js`, Echo-Filter-Zweig (`data._rev < _lastStateRev`): das `applyStateToGrid(...)+renderCanvas(data)` mit den veralteten Daten entfernen — einfach `return;`.
5. **risiko-quiz/view.html:** Offline-Fallback `setInterval(poll, 1000)` in Handle speichern und bei `status==='finished'` clearen; `showEndScreen` idempotent machen (Flag: nur beim ersten Wechsel auf finished rendern).

### B14. Kleinere Funde (schnell)
1. `risiko-quiz/practice.html`: Im Timeout-Zweig für offene Fragen `answered = true; updateStats(false, q);` ergänzen (wie im MC-Zweig).
2. `risiko-quiz/js/admin.js`: tote Funktion `findNodeContainingQuestion` (ruft nicht existentes `GameModel._findNodeWithQuestion`) ersatzlos entfernen (vorher per Grep bestätigen, dass es keine Aufrufer gibt).
3. `codenames/api.php` `create_game`: PIN-Kollision härten — Spieldatei initial mit `fopen($path,'x')` exklusiv anlegen; schlägt das fehl, neue PIN ziehen (max. 50 Versuche wie bisher).
4. `codenames/game.js`: (a) Online-Punkt: Server soll in `get_state` ein Feld `server_now` (Unixzeit) mitliefern; Client rechnet `online = (server_now - p.last_seen) < 15`. (b) `doRefresh`: In-flight-Guard (`if (_refreshing) return; _refreshing = true; ... finally _refreshing = false;`).
5. `schiffeversenken/view.html` Solo-Modus: in `fireShot` den Save mit `if (!soloMode)` guarden; in `startSolo()` `BsStorage.setCode(null)` setzen.
6. `Leiterspiel-quiz/js/leiterspiel.js` `rollDice`/`askQuestion`: liefert `pickQuestion()` null → Meldung anzeigen (`alert` oder Banner) und `updateDiceButton(true)`; in `_gsEnter` bei fehlenden `activeCategoryIds` Fallback `activeFragenBank = fragenBank` (bzw. `.fragen`, Struktur prüfen).
7. `Leiterspiel-quiz/view.html`: (a) Board-Neuaufbau bei Spielwechsel: Signatur (`gameCode + (gs.meta?.createdAt||'')`) merken; weicht sie ab → `grid.innerHTML=''` vor dem Aufbau; in `leaveGame` Grid leeren. (b) Im `finished`-Zweig von `renderAll` das Frage-Overlay schließen (`closeQuestion()`), sofern nicht `_closingAfterResult`.
8. `quizpfad/js/quizpfad.js` Duell: `qpLiveQ` mit `isDuel:true` + Frage setzen und speichern, wenn ein Duell startet; Views zeigen es dann read-only (view.html/board.html brauchen dafür KEINE Änderung, sie rendern liveQuestion generisch — verifizieren, dass `lq.advanceAmount`-Anzeige mit undefined nicht bricht, ggf. `|| 1`). Beim Duell-Ende `qpLiveQ=null` + save. `usedQuestionIds` direkt beim Ziehen der Duell-Frage speichern.

---

## 5. Block C — Architektur (Teile NUR nach Rückfrage)

### C1. OHNE Rückfrage umsetzen:
1. **`.htaccess`: Direktzugriff auf Spielstände sperren.** Zusätzliche Regeln: Zugriff auf `data/games/` (alle Unterverzeichnisse), `schiffeversenken/data/games/` und `data/drafts.json` verbieten (mod_rewrite: `RewriteRule ^(data/games/|schiffeversenken/data/games/|data/drafts\.json) - [F]`).
   **ACHTUNG:** `data/questions.json`, `data/memory/pairs.json`, `data/escape-room/`, `data/leiterspiel-designer/`, `data/labyrinth-designer/` MÜSSEN direkt lesbar bleiben (Clients nutzen sie als statischen Fallback — vorher per Grep `fetch('../data/` alle Fallback-Pfade sammeln und gegen die Deny-Regel prüfen!). Nach der Änderung mit `php -S` testen: `curl` auf eine `data/games/...json` → 403, auf `data/questions.json` → 200. (Hinweis: `php -S` wertet .htaccess nicht aus — der Test muss dann eben dokumentiert-manuell bleiben; mindestens Regex sorgfältig prüfen.)
2. **Rotierende Backups für `questions.json`:** In `api.php` (Legacy-POST-Zweig, wo aktuell `copy($path, $path.'.bak')` steht): 3 Generationen rotieren (`.bak2`→`.bak3`, `.bak`→`.bak2`, aktuell→`.bak`).
3. **Registry-Schreibmuster vereinheitlichen:** Der Snapshot-POST in `registryEndpoint` (`atomicWrite` per rename) kollidiert mit den flock-basierten in-place-Writes von `updateRegistryEntry`/`removeRegistryEntry`/`cleanupExpiredGames`. Fix: Snapshot-POST ebenfalls unter dasselbe flock stellen (Datei `c+` öffnen, LOCK_EX, ftruncate+fwrite) — ODER (besser): alle vier Schreibpfade auf „flock auf separater `.lock`-Datei + atomicWrite per rename" umstellen, damit Leser immer konsistente Dateien sehen. Zweite Variante bevorzugen und konsistent umsetzen. Zusätzlich in `gameEndpoint`/CAS: wenn `fopen`/`flock` fehlschlägt → HTTP 500 `lock error` statt ungelockt weiterzumachen (gleiches in `codenames/api.php` `lockGame`: bei Fehlschlag `err('lock_error', 500)`).

### C2. NUR NACH RÜCKFRAGE beim Nutzer (Frage stellen, Antwort abwarten):
1. **Schreibschutz-Token für destruktive Endpunkte** (`?f=questions` POST, alle `DELETE`, Registry-POST, codenames `save/delete_wordlist`): Ein im Quelltext der Lehrkraft-Seiten hinterlegtes Shared Secret hält Schüler mit DevTools nur begrenzt auf (Quelltext einsehbar) — ist aber eine echte Hürde gegen Copy-Paste-Vandalismus. Umsetzung: Header `X-Admin-Key`, Konstante in api.php, mitgesendet von admin.html/den Admin-JS-Dateien. **Frage an den Nutzer:** gewünscht ja/nein, und ob CORS auf die eigene Domain eingeschränkt werden darf (bricht file://-Nutzung gegen den Server — vermutlich nein).
2. **CAS für Risiko-Quiz-Schüleraktionen** (`pressIchWeissEs`, `selectCell`, `selectMcOption`-Zwischenstände): Umstellung auf `mutate()`-Muster würde die „Ich weiß es"-Race sauber lösen, erfordert aber einen `mutate`-Helfer in `risiko-quiz/js/shared.js` und Anpassung mehrerer Pfade in view.html. Aufwand mittel, Nutzen hoch. **Frage an den Nutzer**, ob das jetzt gemacht werden soll (empfohlen: ja).

---

## 6. Explizit NICHT tun

- Keine Umstellung der rundenbasierten Spielzug-Saves (Lehrergerät) auf CAS — das gemischte Modell ist Absicht (Ausnahme: C2.2 nach Freigabe).
- `data/games/`-Inhalte nicht committen/löschen (liegen teils im Git — bestehende Konvention, nicht anfassen).
- Keine neuen Abhängigkeiten, kein Build-Tooling, keine Umbenennungen öffentlicher Funktionen (viele hängen an Inline-`onclick`).
- `escHtml`/`esc`-Helfer nicht vereinheitlichen/verschieben — nur lokal ergänzen.
- Nichts an `memory/`, `stadt-land-fluss/`, `lernkarten/`, `vorschlaege.html` ändern (nicht Teil dieser Runde), außer es ist oben explizit genannt.

## 7. Abschluss-Checkliste

1. Alle Blöcke A, B, C1 umgesetzt; C2-Fragen gestellt (und je nach Antwort umgesetzt).
2. Alle Syntax-Checks grün (php -l, node --check, Inline-Script-Check).
3. CAS-/takenTeams-Integrationstest mit `php -S` gefahren und Testdaten entfernt.
4. MD-Roundtrip-Test (B1) gefahren.
5. Commit(s) mit aussagekräftiger Message + Push auf `origin main`.
6. ZIP via `create-zip.ps1` erstellt und im Abschlussbericht erwähnt.
7. Abschlussbericht: pro Block, was gefixt wurde, was übersprungen/nicht reproduzierbar war (mit Begründung), was auf Nutzer-Antwort wartet.
