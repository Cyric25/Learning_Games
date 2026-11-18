# Projektplan: Inhalte in die Datenbank (MySQL/MariaDB)

_Erstellt am: 2026-11-18 · Letzte Aktualisierung: 2026-11-18_

## 0. Anweisungen für den ausführenden Agenten

Du arbeitest nach diesem Plan. Er ist die einzige Wahrheitsquelle – du hast
keinen Zugriff auf das Gespräch, in dem er entstand. Halte dich an diese Regeln:

**Rollen und Modelle:**
A. Wird die Abarbeitung von einem Orchestrator koordiniert (Opus), gilt:
   Der Orchestrator delegiert APs an Subagenten und implementiert NIEMALS
   selbst. Er gibt jedem Subagenten dessen AP-Text plus die Abschnitte
   0–5 dieses Plans als Kontext (Abschnitt 4 enthält die technische
   Spezifikation, auf die die APs verweisen), prüft jede Rückmeldung gegen
   die Akzeptanzkriterien des APs, bevor er abhängige APs freigibt, und
   pflegt die Statustabelle. Subagenten werden **AP für AP** beauftragt
   (nach jedem AP anhalten und berichten lassen), nie eine ganze Phase am
   Stück.
B. Jedes AP nennt sein Ausführungsmodell (**Modell:** sonnet | opus).
   Subagenten mit genau diesem Modell starten.
C. Unabhängige APs derselben Phase (keine gemeinsamen Abhängigkeiten,
   disjunkte Dateien) dürfen parallel in getrennten Git-Worktrees laufen.
   APs, die dieselben Dateien ändern, nie parallel ausführen. Fast alle
   Server-APs ändern `api.php` – sie sind deshalb sequenziell geplant.
D. **Fortschrittsmeldung (Vorgabe des Betreibers):** Bei jedem Start eines
   APs meldet der Orchestrator im Chat in genau dieser Form:
   ```
   Phase <N> – AP-<N.x> (<Kurztitel>) läuft / <k> APs offen
   Noch zu machen:
   - Phase <N+1> – <Titel>
   - Phase <N+2> – <Titel>
   ```

**Arbeitsweise:**
1. Bearbeite genau EIN Arbeitspaket (AP) pro Auftrag.
2. Prüfe vor Beginn die Abhängigkeiten deines APs in der Statustabelle
   (Abschnitt 8). Sind sie nicht ☑, brich ab und melde das.
3. Setze deinen AP-Status auf ◐ (in Arbeit), bevor du beginnst.
4. Bleibe strikt im Scope des APs. Fällt dir Verbesserungspotenzial außerhalb
   auf, notiere es in der Übergabenotiz – setze es nicht um.
5. Beachte die Nicht-Ziele (Abschnitt 2) und Constraints (Abschnitt 3).
6. Zeilennummern in diesem Plan sind Näherungen vom 2026-11-17. Suche immer
   per Grep nach dem genannten Funktions- oder Variablennamen.

**Tests (Pflicht, ein AP ohne bestandene Tests ist nicht fertig):**
7. Nach Abschluss: alle Akzeptanzkriterien einzeln nachweisen + die im AP
   definierten Tests durchführen. Immer zusätzlich: `php -l` für jede
   geänderte PHP-Datei, `node --check` für jede geänderte `.js`-Datei; bei
   geänderten HTML-Dateien jeden `<script>`-Block ohne `src` extrahieren
   und mit `new Function(src)` in Node parsen (Wegwerf-Skript im
   Temp-Ordner, nicht im Repo).
8. Sieht das AP TDD vor: Tests zuerst schreiben, Fehlschlag bestätigen,
   rote Tests committen, dann implementieren bis grün. **Tests niemals
   abändern, damit sie bestehen.** Hältst du einen Test für inhaltlich
   falsch, dokumentiere das in der Übergabenotiz und stoppe.
9. Ergebnis ins Testprotokoll (Abschnitt 9) eintragen.
10. Erst dann Status auf ☑. Bei Fehlschlag: Status ✗ (blockiert), Ursache in
    die Übergabenotiz, nicht mit abhängigen APs weitermachen.
11. Nach dem letzten Implementierungs-AP einer Phase zusätzlich:
    Integrationstest der Phase + Regressionscheck aller vorherigen Phasen
    (deren „lauffähiger Endzustand" muss weiterhin funktionieren).
    Eintrag ins Testprotokoll.
12. Danach folgt das Review-AP (`AP-<N>.rev`): frischer Agent, der KEINES
    der APs dieser Phase implementiert hat, ausschließlich lesend. Kritische
    Befunde führen zu Korrektur-APs (Regel 18).
13. Testdaten, die du auf dem Testserver anlegst (IDs mit Präfix `TST`),
    am Ende des APs wieder löschen. Niemals Tabellen ohne Präfix `sp_`
    anfassen – die Testdatenbank wird von anderen Projekten mitbenutzt.

**Übergabe:**
14. Fülle die Übergabenotiz deines APs aus: was geändert wurde, getroffene
    Entscheidungen, was für Folge-APs relevant ist.
15. Hat dein AP Dateien angelegt, verschoben oder wesentlich geändert:
    aktualisiere deren Einträge in der Datei-Map (Pfad in Abschnitt 10).
    Die Projektdokumentation unter `docs/` wird im `AP-<N>.doc` nachgezogen.
16. Aktualisiere „Letzte Aktualisierung" im Dateikopf.
17. Git: Commit-Messages auf Deutsch mit AP-ID, z. B.
    `AP-1.2: Item-Schicht mit Versionspruefung`. Jede Message endet mit der
    Zeile `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
    Branch-Modell siehe Abschnitt 3 („Git-Strategie"). Nach jedem AP den
    Phasen-Branch pushen. **Nie direkt auf `main` committen und kein ZIP
    erzeugen** – beides passiert erst in AP-5.6.

**Umplanung:**
18. Trägt der Plan nicht (Review-Befunde, blockierte APs, falsche
    Annahmen), werden Korrektur-APs ergänzt (`AP-<N>.fix1`, …) und in
    Statustabelle und Testprotokoll aufgenommen. Bestehende APs und
    Übergabenotizen werden nie gelöscht, nur ergänzt.

## 1. Projektziel

Die Inhalte der Unterrichtsspiele – zentrale Fragendatenbank, Schüler-Vorschläge,
Begriffslisten (Just One/Insider/Hochstapler), Designer-Bibliotheken
(Leiterspiel-Bretter, Labyrinthe) und Memory-Paare – liegen in MySQL/MariaDB
statt in JSON-Dateien. Die Lese-Antworten von `api.php` bleiben für die Spiele
unverändert; die Editoren speichern einzelne Einträge mit Versionsprüfung
(HTTP 409 bei Konflikt), sodass ein veralteter Tab oder ein zweites Gerät keine
fremden Änderungen mehr überschreibt. Der Frageneditor erhält zusätzlich einen
Änderungsverlauf mit Wiederherstellen und eine Suche.

## 2. Nicht-Ziele

- **Live-Spielstände** (`data/games/…`, alle `…-game`/`…-games`/`…-sse`-Endpunkte,
  `codenames/api.php`) bleiben unverändert Dateien.
- **Speicherfehler der Live-Spiele** (Leiterspiel-Teamwahl, Just-One-„Spiel
  starten", Risiko-Quiz-Admin-Rollback u. Ä.) werden nicht behoben.
- **Escape Room** (Spiele, Base64-Bilder, Ranglisten) und **Stadt Land Fluss**
  werden nicht angefasst.
- **`data/settings.json`** (`?f=settings`) und **Codenames-Wortlisten** bleiben Dateien.
- Keine Ranglisten, kein Lernfortschritt pro Schüler, keine Statistik.
- Kein Login/keine Benutzerverwaltung: das Admin-Token `X-Admin-Key` bleibt.
- Kein Offline-/`file://`-Betrieb für Inhalte und kein JSON-Datei-Ausweichweg mehr
  (ausdrückliche Entscheidung des Betreibers: „nur Datenbank").
- Keine Änderung an Datenformaten, die die Spiele lesen (keine Migration von
  Frage-IDs, keine Umbenennung von Feldern).
- Der tote Code `quizpfad/js/quizpfad-admin.js` wird nicht aufgeräumt.

## 3. Kontext & Constraints

- **Projekt:** Interaktive Unterrichtsspiele, reines HTML/CSS/JS ohne Build und
  ohne Framework, ein zentrales `api.php` (rund 770 Zeilen). Verbindliche
  Kurzreferenz: `CLAUDE.md`; ausführliche Doku: `docs/` (Einstieg `docs/README.md`).
- **Umgebung live:** Shared Hosting All-Inkl, Apache + PHP 8.x, MySQL/MariaDB,
  kein SSH. Die Datenbank wird vom Betreiber im Hosting-Panel angelegt.
- **Testumgebung:** lokaler All-Inkl-Nachbau unter `C:\allinkl-testserver`
  (Apache, PHP 8.3 mit `pdo_mysql`, MariaDB 10.11). Start `start-server.cmd`,
  Stopp `stop-server.cmd`. Webroot `C:\allinkl-testserver\www\htdocs\w0000001`
  (enthält fremde Projekte – nur den Unterordner `spiele-test\` benutzen).
  URL: `http://localhost:8080/spiele-test/`. PHP-CLI:
  `C:\allinkl-testserver\php\8.3\php.exe -c C:\allinkl-testserver\conf\php.ini`.
  DB-Name und -Benutzer: `d0000001`; das Passwort steht in
  `C:\allinkl-testserver\README.md` (Abschnitt „Zugangsdaten") – **nie in
  Repo-Dateien oder diesen Plan schreiben**.
- **Bestehende Konventionen (verbindlich):** UI und Kommentare deutsch; knappe
  Kommentare; keine neuen Abhängigkeiten; bestehenden Stil je Datei übernehmen;
  öffentliche Funktionsnamen nicht umbenennen (hängen an inline `onclick`);
  Inhalts-Strings nur über `renderRichContent()`/`richToPlainText()` aus
  `js/rich-content.js` anzeigen; kein Base64 in Datenbanken; True-Leaf-Regel
  (`questions.length > 0 && (subcategories||[]).length === 0`) nicht verändern.
- **Harte Grenzen:**
  - Lese-Antworten der bestehenden GET-Endpunkte bleiben strukturell identisch
    (Definition „strukturell identisch" in Abschnitt 4.5).
  - Alle SQL-Zugriffe über PDO mit Prepared Statements; Tabellen-Präfix `sp_`.
  - Zugangsdaten nur in `data/db-config.php` (nicht in Git, nicht im ZIP – der
    Ordner `data\` ist in `create-zip.ps1` bereits komplett ausgeschlossen).
  - Admin-Token unverändert: Header `X-Admin-Key: LP-Spiele-2026`
    (`requireAdminKey()` in `api.php`).
  - Die alten JSON-Dateien unter `data/` werden in keinem AP gelöscht oder
    verändert; sie bleiben als Sicherung liegen.
- **Git-Strategie:** langlebiger Integrations-Branch `datenbank` (von `main`).
  Pro Phase ein Branch `db-phase-<N>` von `datenbank`; Merge nach `datenbank`
  erst nach Integrationstest UND Review der Phase. `main` bleibt bis AP-5.6
  unberührt, damit zwischenzeitliche Korrekturen und ZIP-Uploads des Betreibers
  nicht versehentlich Datenbank-Code auf den Live-Server bringen.
- **Remote-Repository:** https://github.com/Cyric25/Learning_Games (bereits verbunden).

## 4. Architekturentscheidungen und technische Spezifikation

### 4.1 Entscheidungen

| Entscheidung | Begründung | Verworfene Alternative |
|---|---|---|
| Zwei generische Tabellen `sp_items` und `sp_history`; jeder Eintrag eine Zeile, Inhalt als JSON-Text in `data` | Verlustfreier Roundtrip aller heutigen Felder (auch unbekannter wie `correctIndices`), eine einzige getestete Speicherschicht für fünf Inhaltsarten, kein Schema-Umbau bei neuen Feldern | Voll normalisierte Tabellen pro Inhaltsart: fünffacher Aufwand, Roundtrip-Risiko, kein Nutzen, weil nirgends per SQL im Inhalt gesucht wird |
| Versionsprüfung pro Eintrag (`rev` + `_baseRev`, HTTP 409) | Gleiches Muster wie bei den Spielständen (`gameEndpoint()` in `api.php`), den Entwicklern vertraut | Sperren beim Bearbeiten: auf Shared Hosting ohne Sitzungen unzuverlässig |
| Lese-Endpunkte bauen das bisherige JSON aus den Zeilen zusammen | Kein Spiel muss für das Lesen geändert werden | Neue Lese-API pro Eintrag: würde zehn Spiele betreffen |
| Suche im Frageneditor im Browser | Der Editor lädt ohnehin alle Fragen (273) zum Anzeigen des Baums | Such-Endpunkt mit SQL `LIKE`: zusätzlicher Code ohne spürbaren Vorteil |
| Verlauf nur für Fragen und Fragenkategorien | Ausdrücklich gewünscht; Bretter mit großen Daten würden die Verlaufstabelle aufblähen | Verlauf für alle Sammlungen |
| PDO statt mysqli | Prepared Statements mit benannten Parametern, Ausnahmen statt Rückgabecodes | mysqli |
| Zugangsdaten in `data/db-config.php` | `data\` ist vom ZIP ausgeschlossen und wird beim Upload nie überschrieben; eine PHP-Datei mit `return [...]` gibt bei HTTP-Abruf nichts aus | Datei im Repo-Root: Gefahr, sie mitzuversionieren oder zu überschreiben |
| Alte Schreibwege (ganze Datei per POST) antworten mit HTTP 410 | Ein noch offener alter Editor-Tab kann die Datenbank nicht mehr überschreiben | Still weiter annehmen: genau das zu behebende Problem |

### 4.2 Datenbankschema (`db-schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS sp_items (
  collection VARCHAR(24)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  id         VARCHAR(64)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  parent_id  VARCHAR(64)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  pos        INT          NOT NULL DEFAULT 0,
  rev        INT          NOT NULL DEFAULT 1,
  data       LONGTEXT     NOT NULL,
  updated_at DATETIME     NOT NULL,
  PRIMARY KEY (collection, id),
  KEY idx_parent (collection, parent_id, pos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sp_history (
  hid        BIGINT AUTO_INCREMENT PRIMARY KEY,
  collection VARCHAR(24)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  item_id    VARCHAR(64)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  action     VARCHAR(10)  NOT NULL,          -- create | update | delete | restore
  parent_id  VARCHAR(64)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  pos        INT          NOT NULL DEFAULT 0,
  data       LONGTEXT     NOT NULL,          -- Zustand NACH der Aktion; bei delete der letzte Zustand
  changed_at DATETIME     NOT NULL,
  KEY idx_item (collection, item_id, hid),
  KEY idx_action (collection, action, hid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`data` enthält immer ein JSON-Objekt **ohne** das Feld `id` und ohne
Kind-Listen (`subcategories`, `questions`, `pairs`), kodiert mit
`JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES`.

### 4.3 Sammlungen (`collection`)

| collection | Quelle heute | `parent_id` | Inhalt von `data` |
|---|---|---|---|
| `q-node` | Kategorien/Unterkategorien (bis 4 Ebenen) in `data/questions.json` | Eltern-Knoten oder `NULL` (oberste Ebene) | `{name}` plus etwaige weitere Knotenfelder |
| `q-question` | Fragen in `data/questions.json` | Knoten-ID | Frageobjekt ohne `id` (`difficulty,type,question,answer,options,correctIndex,hint`, ggf. `correctIndices`) |
| `draft` | Array in `data/drafts.json` | `NULL` | Vorschlag ohne `id` |
| `jo-node` | `data/just-one/wordlists.json` (`categories[].subcategories[].words[]`) | Kategorie-ID oder `NULL` | Kategorie: `{name}`; Unterkategorie: `{name, words:[…]}` |
| `ls-board` | Array in `data/leiterspiel-designer/boards.json` | `NULL` | Brett ohne `id` (`name,backgroundImage,aspectRatio,fields,ladders,snakes`) |
| `lab-maze` | Array in `data/labyrinth-designer/mazes.json` | `NULL` | Labyrinth ohne `id` (`name,size,grid,doors,startPositions,createdAt,updatedAt`) |
| `mem-category` | `categories[]` in `data/memory/pairs.json` | `NULL` | `{name}` |
| `mem-pair` | `categories[].pairs[]` | Kategorie-ID | `{sideA,sideB,difficulty}` |

Reihenfolge = `pos` aufsteigend innerhalb desselben `parent_id`. Die Wörter einer
Unterkategorie bleiben bewusst ein Array in einer Zeile: Just One merkt sich
gespielte Begriffe als `<subcatId>::<Index>`, die Reihenfolge darf sich durch die
Umstellung nicht ändern.

### 4.4 PHP-Schichten (neue Dateien im Repo-Root)

**`db.php`** – Verbindung und generische Item-Schicht, keine Ausgabe:

| Funktion | Verhalten |
|---|---|
| `spDb(): PDO` | Singleton. Lädt `data/db-config.php` (Rückgabe `['host','name','user','pass']`), DSN `mysql:host=…;dbname=…;charset=utf8mb4`, `ERRMODE_EXCEPTION`, `ATTR_EMULATE_PREPARES=false`. Fehlt die Datei oder scheitert die Verbindung: `RuntimeException('db unavailable')`. |
| `spEnsureSchema(): void` | Führt die beiden `CREATE TABLE IF NOT EXISTS` aus `db-schema.sql` aus. |
| `spItems(string $col, bool $withData = true): array` | Alle Zeilen der Sammlung, sortiert `parent_id, pos, id`; je Zeile `['id','parent_id','pos','rev','data'(dekodiert),'updated_at']`. |
| `spItemGet(string $col, string $id): ?array` | Eine Zeile oder `null`. |
| `spItemSave(string $col, string $id, ?string $parentId, array $data, ?int $baseRev, ?int $pos = null): array` | In Transaktion mit `SELECT … FOR UPDATE`. Existiert die Zeile nicht: anlegen mit `rev=1` (`$pos === null` → größtes `pos` der Geschwister + 1). Existiert sie: `$baseRev === null` → `['conflict'=>true,'current'=>Zeile]`; `$baseRev !== rev` → ebenso Konflikt; sonst speichern mit `rev+1`. Erfolg: `['ok'=>true,'id'=>…,'rev'=>…,'created'=>bool]`. |
| `spItemDelete(string $col, string $id, ?int $baseRev): array` | Löscht eine Zeile; Konfliktregel wie oben; nicht vorhanden → `['ok'=>true,'missing'=>true]`. |
| `spItemsReorder(string $col, ?string $parentId, array $ids): void` | Setzt `pos` = Index in `$ids` für die genannten Geschwister, erhöht `rev` nicht. |
| `spTx(callable $fn)` | Führt `$fn` in einer Transaktion aus (verschachtelt aufrufbar: nur die äußerste öffnet/commitet). |
| `spHistoryAdd(string $col, string $itemId, string $action, ?string $parentId, int $pos, array $data): void` | Fügt eine Verlaufszeile an. |
| `spHistoryList(string $col, ?string $itemId, ?string $action, int $limit = 100): array` | Verlaufszeilen, neueste zuerst. |

IDs werden vor jedem Zugriff mit `^[A-Za-z0-9_.\-]{1,64}$` geprüft
(Hilfsfunktion `spValidId(string $id): bool`).

**`content.php`** – Abbildung zwischen altem JSON und Items (reine Funktionen
plus Lese-Zusammenbau), keine Ausgabe:

| Funktion | Verhalten |
|---|---|
| `spSplitQuestions(array $json): array` | `{categories:[…]}` → Liste `['col','id','parent_id','pos','data']` für `q-node`/`q-question`. Wirft `InvalidArgumentException` bei doppelten oder ungültigen IDs. |
| `spBuildQuestions(bool $meta = false): array` | Liest `q-node` + `q-question`, liefert `['categories'=>[…]]`. Jeder Knoten: `id`, `name`, weitere Knotenfelder, `questions` (immer Array), `subcategories` (immer Array). Mit `$meta` zusätzlich `_rev` an jedem Knoten und jeder Frage. |
| `spSplitWords` / `spBuildWords(bool $meta = false)` | Analog für `jo-node` (`{categories:[{id,name,subcategories:[{id,name,words}]}]}`). |
| `spSplitMemory` / `spBuildMemory(bool $meta = false)` | Analog für `mem-category`/`mem-pair` (`{categories:[{id,name,pairs:[…]}]}`). |
| `spSplitList(string $col, array $list)` / `spBuildList(string $col, bool $meta = false)` | Für flache Listen (`draft`, `ls-board`, `lab-maze`): Array von Objekten mit `id` zuerst. |
| `spJsonEqual($a, $b): bool` | Vergleich nach der Definition in 4.5. |

### 4.5 „Strukturell identisch"

Zwei JSON-Werte gelten als identisch, wenn sie nach `json_decode(…, true)`
tief gleich sind, wobei gilt: Reihenfolge von Objekt-Schlüsseln ist egal;
Reihenfolge von Listen ist relevant; ein fehlender Schlüssel `questions`,
`subcategories` oder `pairs` ist gleich einer leeren Liste. Alles andere
(Typen, Werte, zusätzliche oder fehlende Felder) muss exakt übereinstimmen.

### 4.6 API-Endpunkte (`api.php`, Parameter `f`)

Lesen (Antwortformat wie bisher; mit `&meta=1` zusätzlich `_rev`):

| Endpunkt | Auth | Quelle |
|---|---|---|
| `GET ?f=questions` | offen | `spBuildQuestions()` |
| `GET ?f=jo-words` | offen | `spBuildWords()` |
| `GET ?f=memory-pairs` | offen | `spBuildMemory()` |
| `GET ?f=ls-boards`, `GET ?f=lab-mazes` | offen | `spBuildList()` |
| `GET ?f=drafts` | **neu: Admin-Token** | `spBuildList('draft')` |

Schreiben (alle mit Admin-Token, außer `POST ?f=drafts`):

| Endpunkt | Body / Parameter | Wirkung |
|---|---|---|
| `POST ?f=q-node` | `{id?, parentId, name, _baseRev?, pos?}` | Knoten anlegen/umbenennen/verschieben; ohne `id` vergibt der Server `cat-`/`subcat-` + Zeitstempel + Zufall |
| `DELETE ?f=q-node&id=X&rev=N` | – | Knoten samt aller Unterknoten und Fragen löschen (eine Transaktion) |
| `POST ?f=q-question` | `{id?, nodeId, _baseRev?, pos?, …Fragefelder}` | Frage anlegen/ändern/verschieben; ohne `id` vergibt der Server `q-` + Zeitstempel + Zufall |
| `DELETE ?f=q-question&id=X&rev=N` | – | Frage löschen |
| `POST ?f=q-reorder` | `{collection:'q-node'|'q-question', parentId, ids:[…]}` | Reihenfolge setzen |
| `POST ?f=q-import` | `{mode:'merge'|'replace', categories:[…]}` | `merge`: fehlende Knoten/Fragen anlegen, vorhandene IDs unverändert lassen; `replace`: alles ersetzen. Eine Transaktion, Verlaufseinträge für jede Änderung |
| `GET ?f=q-history&id=X` / `GET ?f=q-history&deleted=1` | – | Verlauf einer Frage bzw. Liste gelöschter Fragen |
| `POST ?f=q-restore` | `{hid}` | Stellt den Zustand der Verlaufszeile wieder her (legt gelöschte Frage neu an); fehlt der Elternknoten → 409 `{error:'parent missing'}` |
| `POST ?f=drafts` | Vorschlag (offen, ohne Token) | Validierung wie bisher; bei 500 vorhandenen Vorschlägen HTTP 429 statt stillem Verwerfen |
| `DELETE ?f=draft&id=X` | – | Vorschlag löschen |
| `POST ?f=draft-accept` | `{draftId, nodeId, question:{…}}` | Frage anlegen UND Vorschlag löschen in einer Transaktion |
| `POST ?f=jo-node` / `DELETE ?f=jo-node&id=X&rev=N` | `{id?, parentId, name, words?, _baseRev?}` | Kategorie/Unterkategorie samt Wortliste |
| `POST ?f=jo-import` | `{mode, categories:[…]}` | wie `q-import`, ohne Verlauf |
| `POST ?f=ls-board` / `DELETE ?f=ls-board&id=X&rev=N` | Brett-Objekt + `_baseRev?` | ein Brett |
| `POST ?f=lab-maze` / `DELETE ?f=lab-maze&id=X&rev=N` | Labyrinth-Objekt + `_baseRev?` | ein Labyrinth |
| `POST ?f=mem-category` / `DELETE ?f=mem-category&id=X&rev=N` | `{id?, name, _baseRev?}` | Memory-Kategorie (Löschen inkl. Paare) |
| `POST ?f=mem-pair` / `DELETE ?f=mem-pair&id=X&rev=N` | `{id?, categoryId, sideA, sideB, difficulty, _baseRev?}` | ein Paar |
| `POST ?f=mem-import` | `{mode, categories:[…]}` | wie `q-import`, ohne Verlauf |
| `GET ?f=db-export` | – | Ein JSON `{exportedAt, questions, words, memory, boards, mazes, drafts}` |
| `POST ?f=db-import` | dasselbe Format, je Abschnitt optional | Ersetzt die enthaltenen Sammlungen (eine Transaktion) |

Einheitliche Antworten: Erfolg `200 {"ok":true,"id":"…","rev":N}`; Konflikt
`409 {"error":"conflict","current":{id,parentId,pos,rev,…Datenfelder}}`;
unbekannte ID `404 {"error":"not found"}`; ungültige Eingabe
`400 {"error":"…"}`; fehlendes Token `403` (bestehendes `requireAdminKey()`);
Datenbank nicht erreichbar `503 {"error":"db unavailable"}`; stillgelegter
alter Schreibweg (`POST ?f=questions`, `?f=jo-words`, `?f=memory-pairs`,
`?f=ls-boards`, `?f=lab-mazes`) `410 {"error":"gone","hint":"Seite neu laden"}`.

### 4.7 Verhalten der Editoren bei Konflikt (einheitlich)

Antwortet der Server mit 409, zeigt der Editor einen Dialog (bestehende
Modal-Stile der jeweiligen Seite verwenden) mit dem Text „Dieser Eintrag wurde
inzwischen auf einem anderen Gerät geändert." und zwei Schaltflächen:
„Aktuellen Stand laden" (übernimmt `current` in die Oberfläche, verwirft die
eigene Eingabe) und „Meine Version speichern" (sendet erneut mit
`_baseRev = current.rev`). Bei 503, 410 oder Netzwerkfehler erscheint eine
sichtbare Fehlermeldung; es wird **nie** „Gespeichert" angezeigt, wenn der
Server nicht mit `ok:true` geantwortet hat, und es wird **nie** ersatzweise in
`localStorage` gespeichert.

## 5. Risiken & Rollback

| Risiko | Wahrscheinlichkeit | Auswirkung | Gegenmaßnahme / Rollback |
|---|---|---|---|
| Zusammengebautes JSON weicht vom Original ab (Reihenfolge, leere Listen, Sonderfelder) | mittel | hoch (Spiele zeigen falsche/fehlende Kategorien) | `spJsonEqual`-Vergleich Original ↔ Datenbank ist Pflichtschritt der Migration (`db-migrate.php --verify`); Abbruch bei Abweichung |
| Doppelte IDs in den Bestandsdaten | niedrig | mittel | `spSplit*` bricht mit Liste der Duplikate ab; Betreiber korrigiert die JSON-Datei, erneut migrieren |
| Datenbank auf dem Hoster nicht erreichbar | niedrig | hoch (kein Spiel lädt Fragen) | Vom Betreiber akzeptiert; klare Fehlermeldung statt veralteter Daten; Export-Datei als Notfall-Sicherung |
| Alter Editor-Tab überschreibt Daten | mittel | hoch | Alte Ganz-Datei-POSTs antworten 410 |
| Unfertiger Datenbank-Code gelangt per ZIP auf den Live-Server | mittel | hoch | Arbeit nur auf Branch `datenbank`; Merge nach `main` und ZIP erst in AP-5.6 |
| Testdatenbank wird von anderen Projekten genutzt | sicher | mittel | Nur Tabellen mit Präfix `sp_`; Testdaten mit ID-Präfix `TST` und Aufräumen pro AP |
| Base64-Hintergrundbild (351 KB) in einem Leiterspiel-Brett | sicher | niedrig | Migration lagert es nach `data/images/` aus (AP-4.3) |
| Verlaufstabelle wächst | niedrig | niedrig | Nur Fragen/Knoten; bei 273 Fragen unkritisch; in der Doku als bekannte Einschränkung |

**Generelle Rollback-Strategie:** `main` und der Live-Server bleiben bis
AP-5.6 auf dem Dateistand. Die JSON-Dateien unter `data/` werden nie verändert.
Rückweg nach der Live-Umstellung: vorherigen `main`-Stand (Tag
`vor-datenbank`, in AP-5.6 gesetzt) wieder hochladen – die JSON-Dateien liegen
noch dort; nach der Umstellung in der Datenbank gemachte Änderungen vorher per
`?f=db-export` sichern.

## 6. Phasenübersicht

Jede Phase endet mit `AP-<N>.rev` (unabhängiges Review) und `AP-<N>.doc`
(Dokumentation). „Lauffähig" bezieht sich auf den Testserver
(`http://localhost:8080/spiele-test/`).

| Phase | Ziel | Lauffähiger Endzustand | APs |
|---|---|---|---|
| 1 | Fundament | Datenbank-Schicht, Abbildung und Migrationswerkzeug vorhanden und getestet; alle Bestandsdaten lassen sich verlustfrei importieren und zurückbauen; die Anwendung selbst läuft unverändert auf Dateien | AP-1.1 … AP-1.4, AP-1.rev, AP-1.doc |
| 2 | Fragen | Fragen kommen aus der Datenbank; beide Frageneditoren speichern pro Eintrag mit Konfliktdialog; Verlauf und Suche funktionieren; alle Spiele laden Fragen wie bisher | AP-2.1 … AP-2.8, AP-2.rev, AP-2.doc |
| 3 | Vorschläge | Vorschläge liegen in der Datenbank; Einreichen meldet Fehler ehrlich; Annehmen ist ein einziger Vorgang | AP-3.1 … AP-3.3, AP-3.rev, AP-3.doc |
| 4 | Begriffe, Designer, Memory | Begriffslisten, Bretter, Labyrinthe und Memory-Paare liegen in der Datenbank; ihre Editoren speichern pro Eintrag | AP-4.1 … AP-4.7, AP-4.rev, AP-4.doc |
| 5 | Abschluss | Keine Datei- und Browser-Ausweichwege mehr; Export/Import vorhanden; alte Schreibwege und Direktzugriffe stillgelegt; Anleitung für die Live-Umstellung; Merge nach `main` | AP-5.1 … AP-5.6, AP-5.rev, AP-5.doc |

## 7. Arbeitspakete

### Phase 1: Fundament

### AP-1.1: Branches, Testserver-Abgleich und Datenbank-Verbindung

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** keine

**Ziel & Kontext:**
Arbeitsgrundlage schaffen: Git-Branches, ein Skript, das den Projektstand auf
den lokalen Testserver kopiert, und die Datenbank-Verbindung `spDb()`.

**Betroffene Dateien:**
- `db.php` (neu – in diesem AP nur `spDb()` und `spValidId()`)
- `db-config.example.php` (neu)
- `tools/sync-testserver.ps1` (neu)
- `.gitignore` (ändern)
- `.htaccess` (ändern)

**Vorgehen:**
1. Branch `datenbank` von `main` anlegen und pushen; davon `db-phase-1`.
2. `db-config.example.php`: `<?php return ['host'=>'localhost','name'=>'DBNAME','user'=>'DBUSER','pass'=>'PASSWORT'];`
   mit Kommentar „nach data/db-config.php kopieren und ausfüllen".
3. `.gitignore`: Zeile `data/db-config.php` ergänzen.
4. `.htaccess`: in die bestehende Deny-`RewriteRule` den Pfad
   `data/db-config\.php` aufnehmen (Muster der vorhandenen Regel beibehalten).
5. `db.php`: `spDb()` und `spValidId()` nach Abschnitt 4.4. Keine Ausgabe,
   kein schließendes `?>`.
6. `tools/sync-testserver.ps1`: kopiert per `robocopy` das Repo nach
   `C:\allinkl-testserver\www\htdocs\w0000001\spiele-test\`, ausgeschlossen
   `.git`, `.claude`, `backups`, `dist`. Der Ordner `data` wird nur kopiert,
   wenn er im Ziel noch nicht existiert (sonst `/XD data`), damit Testdaten
   und `data\db-config.php` im Ziel erhalten bleiben. Parameter `-MitDaten`
   erzwingt das Kopieren von `data` (ohne `db-config.php` zu überschreiben).
7. Im Ziel `spiele-test\data\db-config.php` von Hand anlegen (Werte aus
   `C:\allinkl-testserver\README.md`, Abschnitt „Zugangsdaten"). Diese Datei
   liegt außerhalb des Repos.

**Akzeptanzkriterien:**
- [ ] Branches `datenbank` und `db-phase-1` existieren auf dem Remote.
- [ ] `git status` zeigt `data/db-config.php` nicht als unversioniert, wenn die Datei lokal angelegt wird.
- [ ] `spDb()` liefert auf dem Testserver ein `PDO`-Objekt; ohne Konfigurationsdatei wirft es `RuntimeException('db unavailable')`.
- [ ] `http://localhost:8080/spiele-test/data/db-config.php` liefert HTTP 403.
- [ ] `http://localhost:8080/spiele-test/spiele.html` lädt (Status 200).
- [ ] Datei-Map aktualisiert.

**Tests:**
- Testserver starten (`C:\allinkl-testserver\start-server.cmd`), Sync-Skript ausführen.
- Im Ordner `spiele-test`: `php.exe -c …\php.ini -r "require 'db.php'; var_dump(spDb()->query('SELECT 1')->fetchColumn());"` gibt `1` aus (PHP-CLI-Pfad siehe Abschnitt 3).
- `data\db-config.php` kurz umbenennen, denselben Aufruf wiederholen → Ausnahme `db unavailable`; Datei zurückbenennen.
- `curl -s -o NUL -w "%{http_code}" http://localhost:8080/spiele-test/data/db-config.php` → `403`.
- `php -l db.php` fehlerfrei.

**Übergabenotiz:**

### AP-1.2: Schema und generische Item-Schicht mit Versionsprüfung

**Status:** ☐ offen
**Umfang:** M
**Modell:** opus (Nebenläufigkeit, Transaktionen)
**Abhängigkeiten:** AP-1.1 (`spDb()` in `db.php`)

**Ziel & Kontext:**
Die einzige Speicherschicht für alle Inhalte: Tabellen aus Abschnitt 4.2 und
die Funktionen aus Abschnitt 4.4 (`spEnsureSchema`, `spItems`, `spItemGet`,
`spItemSave`, `spItemDelete`, `spItemsReorder`, `spTx`, `spHistoryAdd`,
`spHistoryList`). TDD.

**Betroffene Dateien:**
- `db-schema.sql` (neu – exakt der SQL-Text aus Abschnitt 4.2)
- `db.php` (ändern)
- `tests/db-items-test.php` (neu – CLI-Testskript, Ausgabe je Fall `OK`/`FAIL`, Exit-Code ≠ 0 bei Fehler)

**Vorgehen:**
1. Testskript zuerst. Es nutzt die Sammlung `tst-items` und IDs mit Präfix
   `TST`, räumt am Anfang und Ende `DELETE FROM sp_items WHERE collection='tst-items'`
   sowie die zugehörigen `sp_history`-Zeilen auf. Testfälle:
   - Anlegen: `spItemSave('tst-items','TST1',null,['a'=>1],null)` → `ok`, `rev=1`, `created=true`.
   - Ändern mit richtigem `baseRev=1` → `rev=2`.
   - Ändern mit veraltetem `baseRev=1` → `conflict`, `current.rev=2`, Daten unverändert.
   - Ändern einer vorhandenen Zeile mit `baseRev=null` → `conflict`.
   - Unicode/Sonderzeichen (`"Säure $H_2O$ \| 😀"`) kommen identisch zurück.
   - `pos`: drei Geschwister ohne `pos` erhalten 0,1,2 … (aufsteigend); `spItemsReorder` kehrt die Reihenfolge um, `spItems` liefert sie umgekehrt.
   - `spItemDelete` mit falschem `baseRev` → `conflict`; mit richtigem → gelöscht; nochmals → `missing`.
   - `spTx`: wirft die Callback-Funktion eine Ausnahme, ist keine der darin gespeicherten Zeilen vorhanden.
   - `spHistoryAdd` + `spHistoryList` liefern die Einträge neueste zuerst.
   - Ungültige ID (`"a b"`, 65 Zeichen) → `InvalidArgumentException`.
2. Tests laufen lassen (alle rot), committen, dann implementieren bis grün.
3. `spItemSave`/`spItemDelete` lesen die Zeile mit `SELECT … FOR UPDATE`
   innerhalb der Transaktion; alle Statements sind Prepared Statements.

**Akzeptanzkriterien:**
- [ ] `tests/db-items-test.php` läuft auf dem Testserver mit Exit-Code 0, alle Fälle `OK`.
- [ ] Nach dem Lauf existieren keine Zeilen mit `collection='tst-items'`.
- [ ] Kein SQL-Statement in `db.php` enthält eine per String-Verkettung eingefügte Eingabe.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `php.exe -c …\php.ini tests/db-items-test.php` im Ordner `spiele-test` (vorher Sync-Skript).
- Parallelitätsprobe: zwei gleichzeitige CLI-Aufrufe eines Einzeilers, der dieselbe Zeile mit demselben `baseRev` speichert (PowerShell `Start-Job` ×2) → genau einer meldet `ok`, der andere `conflict`.
- `SHOW COLUMNS FROM sp_items` und `sp_history` entsprechen Abschnitt 4.2.

**Übergabenotiz:**

### AP-1.3: Abbildung JSON ↔ Items (`content.php`)

**Status:** ☐ offen
**Umfang:** M
**Modell:** opus (Roundtrip-Treue, Hierarchie bis 4 Ebenen)
**Abhängigkeiten:** AP-1.2 (`spItems`, `spItemSave`, `spTx`)

**Ziel & Kontext:**
Funktionen aus Abschnitt 4.4, Tabelle `content.php`: Zerlegen der alten
JSON-Strukturen in Items und Zusammenbauen der bisherigen Antwortformate.
Kritisch für die Regressionsfreiheit aller Spiele. TDD.

**Betroffene Dateien:**
- `content.php` (neu)
- `tests/content-roundtrip-test.php` (neu)

**Vorgehen:**
1. Testskript zuerst. Für jede Inhaltsart: JSON einlesen → `spSplit…` → Items in
   Test-Sammlungen speichern → `spBuild…` → `spJsonEqual(Original, Ergebnis)`.
   Damit die echten Sammlungen unberührt bleiben, akzeptieren alle
   `spSplit…`/`spBuild…`-Funktionen einen optionalen letzten Parameter
   `string $colPrefix = ''`; die Tests verwenden `'tst-'`.
   Eingaben: (a) die echten Dateien `data/questions.json`, `data/memory/pairs.json`,
   `data/just-one/wordlists.json`, `data/leiterspiel-designer/boards.json`,
   `data/labyrinth-designer/mazes.json`, `data/drafts.json` (fehlt eine Datei:
   Fall überspringen und `SKIP` ausgeben); (b) synthetische Fälle im Skript:
   Fragenbaum mit 4 Ebenen; Knoten mit gleichzeitig `questions` und
   `subcategories`; oberste Kategorie ohne `questions`-Schlüssel; Frage mit
   Zusatzfeld `correctIndices`; leere `options`; leere Datenbank
   (`{"categories":[]}`); doppelte Frage-ID → `InvalidArgumentException`.
   Zusätzlich direkte Tests für `spJsonEqual` (Schlüsselreihenfolge egal,
   Listenreihenfolge relevant, fehlendes `questions` = `[]`, `"1"` ≠ `1`).
2. Rot bestätigen, committen, implementieren.
3. `spBuild…` mit `$meta=true` fügt `_rev` an jedem Knoten/Eintrag hinzu;
   ohne `$meta` darf kein Feld mit führendem Unterstrich erscheinen.
4. Leere Listen müssen als JSON-Array `[]` kodiert werden, leere Objekte
   (z. B. `grid`-Einträge) als `{}` erhalten bleiben: beim Dekodieren von
   `data` mit `json_decode($s, false)` arbeiten oder gleichwertig sicherstellen
   und im Test mit einem Brett/Labyrinth prüfen, das ein leeres Objekt enthält.

**Akzeptanzkriterien:**
- [ ] `tests/content-roundtrip-test.php` endet mit Exit-Code 0; für alle vorhandenen echten Dateien lautet das Ergebnis `OK`.
- [ ] Die zusammengebaute Fragen-Antwort enthält dieselbe Anzahl Kategorien, Unterkategorien und Fragen wie `data/questions.json` (Zahlen in der Übergabenotiz festhalten).
- [ ] Nach dem Lauf existieren keine Zeilen mit `collection LIKE 'tst-%'`.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `php.exe -c …\php.ini tests/content-roundtrip-test.php` im Ordner `spiele-test` nach `tools/sync-testserver.ps1 -MitDaten`.
- `php -l content.php`.

**Übergabenotiz:**

### AP-1.4: Migrationswerkzeug `db-migrate.php`

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-1.3 (`spSplit…`, `spBuild…`, `spJsonEqual` in `content.php`)

**Ziel & Kontext:**
Ein Werkzeug, das die Bestandsdateien in die Datenbank überträgt und das
Ergebnis prüft. Muss ohne SSH im Browser aufrufbar sein (Live-Hosting) und auf
der Kommandozeile (Testserver).

**Betroffene Dateien:**
- `db-migrate.php` (neu)

**Vorgehen:**
1. Aufruf CLI: `php db-migrate.php <aktion> <sammlungen>`; Aufruf HTTP:
   `db-migrate.php?aktion=…&sammlungen=…&key=LP-Spiele-2026` (ohne oder mit
   falschem `key` → 403). Ausgabe als `text/plain`.
2. Sammlungs-Gruppen: `fragen` (`q-node`,`q-question` aus `data/questions.json`),
   `vorschlaege` (`draft` aus `data/drafts.json`), `begriffe` (`jo-node` aus
   `data/just-one/wordlists.json`), `bretter` (`ls-board`), `labyrinthe`
   (`lab-maze`), `memory` (`mem-category`,`mem-pair` aus `data/memory/pairs.json`),
   `alle`.
3. Aktionen:
   - `status`: je Gruppe Anzahl Zeilen in der Datenbank und ob die Quelldatei existiert.
   - `import`: ruft `spEnsureSchema()`; importiert eine Gruppe nur, wenn ihre
     Sammlungen leer sind (sonst Meldung „bereits befüllt – übersprungen");
     eine Transaktion je Gruppe; danach automatisch `verify`.
   - `import-force`: leert die Sammlungen der Gruppe vorher (nur CLI erlaubt,
     per HTTP → 400).
   - `verify`: `spJsonEqual(Quelldatei, spBuild…())` je Gruppe, Ausgabe
     `OK`/`ABWEICHUNG` mit dem Pfad des ersten Unterschieds.
4. Fehlende Quelldatei = leere Gruppe, kein Fehler. Die Quelldateien werden
   nie verändert.

**Akzeptanzkriterien:**
- [ ] `import alle` auf leerer Datenbank endet mit `OK` für jede Gruppe, deren Quelldatei existiert.
- [ ] Zweiter `import alle` ändert nichts („übersprungen") und `verify alle` bleibt `OK`.
- [ ] HTTP-Aufruf ohne `key` → 403; `import-force` per HTTP → 400.
- [ ] Die Anwendung selbst ist unverändert: `git diff datenbank -- api.php` ist leer.
- [ ] Datei-Map aktualisiert.

**Tests:**
- Auf dem Testserver nach `tools/sync-testserver.ps1 -MitDaten`: `status alle`, `import alle`, `verify alle`, erneut `import alle`.
- `curl "http://localhost:8080/spiele-test/db-migrate.php?aktion=status&sammlungen=alle"` → 403; mit `&key=LP-Spiele-2026` → 200 und Statusliste.
- **Phasen-Integrationstest:** `tests/db-items-test.php`, `tests/content-roundtrip-test.php` und `verify alle` nacheinander grün; `http://localhost:8080/spiele-test/admin.html` und ein Spiel (`quizpfad/index.html`) laden Fragen wie vor der Phase (weiterhin aus Dateien).
- Am Ende: `import-force alle` NICHT rückgängig machen – die befüllte Testdatenbank ist Ausgangspunkt für Phase 2.

**Übergabenotiz:**

### AP-1.rev: Unabhängiges Review Phase 1

**Status:** ☐ offen
**Umfang:** M
**Modell:** opus
**Abhängigkeiten:** AP-1.1 … AP-1.4 (inkl. Phasen-Integrationstest)

**Ziel & Kontext:**
Unabhängige Qualitätsprüfung durch einen Agenten, der an keiner
Implementierung der Phase beteiligt war. Nur lesend – KEINE Datei verändern.

**Vorgehen:**
1. Jedes Implementierungs-AP gegen seine Akzeptanzkriterien prüfen (im Quelltext, nicht nur in den Übergabenotizen).
2. Phasen-Endzustand laut Abschnitt 6 prüfen.
3. Scope-Check gegen Abschnitt 2; `api.php` und alle Spiel-Dateien müssen unverändert sein.
4. Qualitäts-Check: Prepared Statements überall; keine Zugangsdaten im Repo (`git grep` nach dem DB-Benutzernamen und nach `pass`); Transaktionsgrenzen in `spItemSave`/`spItemDelete`; Umgang mit leeren Listen/Objekten in `content.php`; Schutz von `db-migrate.php`.
5. Befunde als Bericht in die Übergabenotiz: Schweregrad (kritisch/mittel/gering), AP, Datei, Fundstelle.

**Akzeptanzkriterien:**
- [ ] Jedes Implementierungs-AP wurde gegen seine Akzeptanzkriterien geprüft.
- [ ] Alle Befunde mit Schweregrad, Datei und Fundstelle dokumentiert.
- [ ] Keine Datei wurde verändert.

**Tests:**
- entfällt (Review-AP; das Ergebnis ist der Bericht).

**Übergabenotiz:**

### AP-1.doc: Dokumentation Phase 1

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-1.rev

**Ziel & Kontext:**
Doku auf den Stand nach Phase 1 bringen. Das Projekt hat eine bestehende
Doku-Struktur unter `docs/` – diese erweitern, keine `DOKUMENTATION.md` anlegen.

**Betroffene Dateien:**
- `docs/datenbank.md` (neu: Zweck, Schema, Sammlungen, Funktionen von `db.php`/`content.php`, Migrationswerkzeug, Testserver-Ablauf, Einrichtung von `data/db-config.php`)
- `docs/README.md` (ändern: Verweis auf `docs/datenbank.md`)
- `docs/entwicklung.md` (ändern: §3 Tests um die beiden Testskripte und `tools/sync-testserver.ps1` ergänzen)
- Datei-Map (Pfad in Abschnitt 10)

**Vorgehen:**
1. Übergabenotizen der Phase durchgehen.
2. `docs/datenbank.md` schreiben; ausdrücklich vermerken, dass die Anwendung nach Phase 1 noch aus Dateien liest.
3. Datei-Map gegen den Dateibestand abgleichen.

**Akzeptanzkriterien:**
- [ ] Jede in Phase 1 neue Datei hat einen Eintrag in der Datei-Map.
- [ ] `docs/datenbank.md` nennt alle Funktionen aus Abschnitt 4.4 mit Signatur.
- [ ] Kein Verweis zeigt auf nicht existierende Dateien/Funktionen.
- [ ] Phasen-Branch nach `datenbank` gemergt und gepusht.

**Tests:**
- Stichprobe: zwei Funktionssignaturen aus `docs/datenbank.md` gegen `db.php`/`content.php` prüfen.

**Übergabenotiz:**

### Phase 2: Fragen

### AP-2.1: Fragen-Endpunkte lesen und schreiben

**Status:** ☐ offen
**Umfang:** L
**Modell:** opus (zentrale Schnittstelle, Eingabevalidierung)
**Abhängigkeiten:** AP-1.doc (Phase 1 gemergt)

**Ziel & Kontext:**
`api.php` liefert `?f=questions` aus der Datenbank und bietet die
Schreib-Endpunkte `q-node`, `q-question`, `q-reorder` aus Abschnitt 4.6
(einschließlich Verlaufseinträgen per `spHistoryAdd`). Der bisherige
Ganz-Datei-POST wird stillgelegt.

**Betroffene Dateien:**
- `api.php` (ändern)
- `tests/api-questions-test.ps1` (neu – curl-basierte Prüfungen, Ausgabe `OK`/`FAIL`)

**Vorgehen:**
1. Branch `db-phase-2` von `datenbank`.
2. Am Anfang von `api.php` `require_once __DIR__ . '/db.php'` und
   `content.php`. Eine Hilfsfunktion `dbGuard(callable $fn)` fängt
   `RuntimeException('db unavailable')` und `PDOException` und antwortet
   `503 {"error":"db unavailable"}` (Details nur per `error_log`, nie in der Antwort).
3. Neuen Block **vor** dem Abschnitt „Legacy-Endpunkte" einfügen:
   - `GET ?f=questions` → `spBuildQuestions($_GET['meta'] === '1')`,
     kodiert mit `JSON_UNESCAPED_UNICODE`.
   - `POST ?f=questions` → 410 laut Abschnitt 4.6.
   - `q-node`, `q-question`, `q-reorder` laut Abschnitt 4.6, alle mit
     `requireAdminKey()` und `readJsonBody()` (beide bestehen bereits in `api.php`).
4. Validierung `q-question`: `nodeId` muss als `q-node` existieren (sonst 400);
   `type` ∈ `mc|open`; `difficulty` ∈ 100,200,300,400,500; `options` Array
   von Strings (max. 8); `correctIndex` Ganzzahl oder `null`; Textfelder als
   String, max. 20 000 Zeichen; unbekannte Felder werden unverändert
   übernommen, Felder mit führendem Unterstrich verworfen.
5. Validierung `q-node`: `name` nicht leer (max. 200 Zeichen); `parentId`
   `null` oder existierender Knoten; ein Knoten darf nicht unter sich selbst
   oder einen eigenen Nachfahren verschoben werden (400); maximale Tiefe 4.
6. `DELETE ?f=q-node`: alle Nachfahren-Knoten und deren Fragen in `spTx`
   löschen; für jede gelöschte Frage und jeden Knoten ein Verlaufseintrag `delete`.
7. Jeder erfolgreiche Schreibvorgang an `q-node`/`q-question` erzeugt genau
   einen Verlaufseintrag (`create`/`update`/`delete`).
8. Den Eintrag `'questions'` aus dem Array `$files` und aus der
   Auto-Migration (`$oldQ`/`$newQ`-Block) entfernen.

**Akzeptanzkriterien:**
- [ ] `GET ?f=questions` ist strukturell identisch (Abschnitt 4.5) zu `data/questions.json` der Testinstanz.
- [ ] `GET ?f=questions&meta=1` enthält `_rev` an jedem Knoten und jeder Frage; ohne `meta` kein Feld mit führendem Unterstrich.
- [ ] Anlegen, Ändern, Verschieben, Löschen von Frage und Knoten funktionieren; veraltetes `_baseRev` → 409 mit `current`.
- [ ] Schreibzugriffe ohne Admin-Token → 403; `POST ?f=questions` → 410.
- [ ] Bei umbenannter `data/db-config.php` antworten alle neuen Endpunkte mit 503 und gültigem JSON.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `tests/api-questions-test.ps1` gegen `http://localhost:8080/spiele-test/api.php`, Testdaten mit IDs `TST…` unter einem eigens angelegten Knoten `TSTcat`, am Ende per `DELETE ?f=q-node` entfernt. Fälle: die sechs Akzeptanzkriterien einzeln; zusätzlich Zyklus-Verschieben (400), Frage in nicht existierenden Knoten (400), `q-reorder` kehrt drei Fragen um und `GET` zeigt die neue Reihenfolge; nach dem Löschen von `TSTcat` enthält `sp_history` je gelöschtem Eintrag eine `delete`-Zeile.
- Regressionsprobe: `http://localhost:8080/spiele-test/quizpfad/index.html` – „+ Neues Spiel erstellen", Kategorieauswahl zeigt dieselben Oberkategorien und Fragenzahlen wie vor dem AP (Zahlen aus AP-1.3-Übergabenotiz).
- `php -l api.php`.

**Übergabenotiz:**

### AP-2.2: Import, Verlauf und Wiederherstellen (Server)

**Status:** ☐ offen
**Umfang:** M
**Modell:** opus
**Abhängigkeiten:** AP-2.1

**Ziel & Kontext:**
Endpunkte `q-import`, `q-history`, `q-restore` aus Abschnitt 4.6. `q-import`
ersetzt den bisherigen Weg, bei dem MD-Import und „JSON-Datei laden" die ganze
Fragenbank überschrieben haben.

**Betroffene Dateien:**
- `api.php` (ändern)
- `tests/api-questions-test.ps1` (ändern – Fälle ergänzen)

**Vorgehen:**
1. `POST ?f=q-import`: Body mit `spSplitQuestions()` zerlegen (Fehler → 400 mit
   Meldung). `merge`: Knoten/Fragen mit unbekannter ID anlegen (ans Ende der
   Geschwister), vorhandene IDs nicht anfassen. `replace`: alle `q-node`/
   `q-question` löschen und neu anlegen. Antwort
   `{"ok":true,"created":{"nodes":n,"questions":m},"deleted":{…}}`.
   Alles in einer `spTx`; Verlaufseinträge wie in AP-2.1 Schritt 7.
2. `GET ?f=q-history&id=X` (Admin-Token): Verlaufszeilen der Frage, neueste
   zuerst, je `{hid,action,changedAt,parentId,data}`.
   `GET ?f=q-history&deleted=1`: je gelöschter Frage die letzte `delete`-Zeile,
   sofern die Frage aktuell nicht existiert; max. 200.
3. `POST ?f=q-restore` `{hid}`: Zustand der Verlaufszeile wiederherstellen
   (Frage überschreiben oder neu anlegen, `rev` erhöhen), Verlaufseintrag
   `restore`. Elternknoten fehlt → 409 `{error:'parent missing'}`.
   Nur für `q-question`-Zeilen; `q-node`-Zeilen → 400.

**Akzeptanzkriterien:**
- [ ] `merge` mit einem Baum, der eine neue Kategorie und eine bereits vorhandene Frage-ID enthält, legt nur die neue Kategorie an und lässt die vorhandene Frage unverändert (gleiches `rev`).
- [ ] `replace` mit dem Inhalt von `data/questions.json` führt zu einem `GET ?f=questions`, das strukturell identisch zur Datei ist.
- [ ] Eine geänderte Frage lässt sich per `q-restore` auf die vorherige Fassung zurücksetzen; eine gelöschte erscheint in `deleted=1` und ist nach `q-restore` wieder vorhanden.
- [ ] Alle drei Endpunkte verlangen das Admin-Token.

**Tests:**
- Ergänzte Fälle in `tests/api-questions-test.ps1` für jedes Akzeptanzkriterium, wieder mit `TST…`-Daten und Aufräumen. Der `replace`-Fall stellt zum Schluss den Originalbestand her (`db-migrate.php verify fragen` → `OK`).
- `php -l api.php`.

**Übergabenotiz:**

### AP-2.3: `StorageManager` auf Einzel-Speichern umstellen

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-2.2

**Ziel & Kontext:**
`risiko-quiz/js/shared.js` enthält `StorageManager.loadQuestions()` (ca. Zeile
57) und `saveQuestions(qb)` (ca. Zeile 71). Beide Frageneditoren und das
Risiko-Quiz nutzen sie. `loadQuestions` fällt heute auf
`localStorage['rq_questions']` zurück; genau dieser Ausweichweg kann beim
nächsten Speichern neuere Serverdaten überschreiben.

**Betroffene Dateien:**
- `risiko-quiz/js/shared.js` (ändern)

**Vorgehen:**
1. `loadQuestions(opts)`: lädt `?f=questions` (mit `opts.meta` → `&meta=1`).
   Kein Lesen und kein Schreiben von `rq_questions` mehr. Bei Fehler wirft die
   Funktion einen `Error` mit `status` (z. B. 503) – kein stiller leerer
   Rückgabewert. Rückgabeform bei Erfolg unverändert (`{categories:[…]}`).
2. Neue Methoden, alle mit Header `X-Admin-Key` wie im bestehenden
   `saveQuestions`, Rückgabe einheitlich
   `{ok:true,id,rev}` | `{conflict:true,current}` | `{error:true,status}`:
   `saveQuestionNode({id,parentId,name,_baseRev,pos})`,
   `deleteQuestionNode(id, rev)`,
   `saveQuestion(nodeId, question, baseRev)` (Feld `_rev` wird aus `question`
   entfernt, bevor gesendet wird),
   `deleteQuestion(id, rev)`,
   `reorderQuestions(collection, parentId, ids)`,
   `importQuestions(mode, categories)`,
   `loadQuestionHistory(id)`, `loadDeletedQuestions()`, `restoreQuestion(hid)`.
3. `saveQuestions(qb)` bleibt als Funktion bestehen (Name hängt an Aufrufern),
   ruft aber `importQuestions('replace', qb.categories)` nicht automatisch
   auf, sondern wirft `Error('saveQuestions ist stillgelegt')`, damit
   übersehene Aufrufer in AP-2.4/2.5 sofort auffallen.
4. Alle Stellen in `shared.js`, die `_rev`-Felder beim Zusammenführen der
   Fragen mit einem Spielstand kopieren könnten, prüfen: `_rev` darf nie in
   einen Spielstand geschrieben werden (die Fragen werden vor jedem
   Spielstand-Save ohnehin entfernt – ca. Zeile 129 und 169).

**Akzeptanzkriterien:**
- [ ] `grep -n "rq_questions" risiko-quiz/js/shared.js` liefert keinen Treffer.
- [ ] Bei gestopptem MariaDB wirft `loadQuestions()` einen Fehler mit `status === 503`.
- [ ] Jede neue Methode liefert für Erfolg, 409 und Fehler die oben definierte Rückgabeform.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `node --check risiko-quiz/js/shared.js`.
- Browser-Konsole auf `http://localhost:8080/spiele-test/admin.html`: `await StorageManager.saveQuestionNode({parentId:null,name:'TSTcat'})` → `ok`; `await StorageManager.saveQuestion(<id>, {type:'open',difficulty:100,question:'TST',answer:'x',options:[],correctIndex:null,hint:''}, null)` → `ok`; dieselbe Frage zweimal mit `baseRev` 1 speichern → zweiter Aufruf `conflict`; `deleteQuestionNode` räumt auf.
- Risiko-Quiz-Spielseite `risiko-quiz/index.html`: bestehendes Spiel öffnen, Spielfeld zeigt Kategorien (Fragen kommen aus der Datenbank).

**Übergabenotiz:**

### AP-2.4: Zentraler Frageneditor `admin.html` speichert pro Eintrag

**Status:** ☐ offen
**Umfang:** L
**Modell:** opus (viele Aufrufstellen, Zustandsführung)
**Abhängigkeiten:** AP-2.3 (Methoden von `StorageManager`)

**Ziel & Kontext:**
`admin.html` (Root) ruft heute nach jeder Änderung `saveQuestionsToServer()`
(ca. Zeile 659) auf und sendet die ganze Fragenbank. Aufrufstellen: Kategorien
anlegen/löschen auf vier Ebenen (ca. 861–974), Umbenennen per `onchange`
(ca. 730/770/810/840), Frage löschen (ca. 973), Fragen-Modal speichern
(ca. 1264), MD-Import (ca. 1421), JSON-Datei laden (ca. 1524), Speichern-Button
(ca. 1505), Vorschlag annehmen (`saveApprovedDraft`, ca. 1890–1944).

**Betroffene Dateien:**
- `admin.html` (ändern)

**Vorgehen:**
1. `init` lädt mit `StorageManager.loadQuestions({meta:true})`. Schlägt das
   Laden fehl: gut sichtbare Fehlermeldung statt leerem Editor, alle
   Bearbeiten-Schaltflächen deaktiviert.
2. Jede Aufrufstelle von `saveQuestionsToServer()` durch den passenden
   Einzelaufruf ersetzen (Knoten anlegen/umbenennen/löschen, Frage
   anlegen/ändern/löschen). Nach Erfolg das zurückgegebene `rev` in das
   lokale Objekt (`_rev`) schreiben. Neue IDs vergibt weiterhin der Client
   über die bestehenden `GameModel.create…`-Funktionen (IDs bleiben im
   bisherigen Format) und sendet sie mit.
3. Konfliktdialog nach Abschnitt 4.7 als eine gemeinsame Funktion
   `handleSaveResult(result, {onReload, onForce})`.
4. MD-Import → `StorageManager.importQuestions('merge', neueKategorien)`;
   „JSON-Datei laden" → Rückfrage „Alle Fragen ersetzen?" und dann
   `importQuestions('replace', …)`; danach neu laden.
5. Der Speichern-Button (ca. 1505) wird zu „Neu laden" (lädt den Serverstand).
6. `saveApprovedDraft`: Frage per `StorageManager.saveQuestion` anlegen und
   den Vorschlag **nur bei `ok`** löschen (die Umstellung auf einen einzigen
   Server-Vorgang folgt in AP-3.3).
7. Export-Funktionen (MD/JSON) dürfen keine `_rev`-Felder ausgeben: vor dem
   Export eine Kopie ohne Felder mit führendem Unterstrich erzeugen.
8. `saveQuestionsToServer` entfernen; kein Aufruf von
   `StorageManager.saveQuestions` verbleibt.

**Akzeptanzkriterien:**
- [ ] Im Netzwerk-Tab löst das Ändern einer Frage genau einen `POST ?f=q-question` aus und keinen `POST ?f=questions`.
- [ ] Zwei Tabs: Frage in Tab A ändern und speichern, dieselbe Frage in Tab B (nicht neu geladen) ändern und speichern → Tab B zeigt den Konfliktdialog; „Aktuellen Stand laden" zeigt die Fassung aus Tab A, „Meine Version speichern" setzt die Fassung aus Tab B durch.
- [ ] Zwei Tabs: Frage X in Tab A ändern, eine andere Frage Y in Tab B ändern → beide Änderungen bleiben erhalten (nach Neuladen sichtbar).
- [ ] Bei gestopptem MariaDB erscheint eine Fehlermeldung und nirgends „Gespeichert".
- [ ] MD-Export → MD-Import (merge) derselben Datei legt nichts doppelt an; exportierte Dateien enthalten kein `_rev`.
- [ ] `grep -n "saveQuestionsToServer\|StorageManager.saveQuestions(" admin.html` liefert keinen Treffer.
- [ ] Datei-Map aktualisiert.

**Tests:**
- Klickpfade auf `http://localhost:8080/spiele-test/admin.html` (Lehrkraft-Modus), alle mit einer Testkategorie `TST-Editor`, am Ende gelöscht: Kategorie anlegen → Unterkategorie → Ebene 3 → Ebene 4 → je umbenennen → Frage (MC und offen) anlegen, ändern, löschen → Kategorie löschen. Nach jedem Schritt Seite neu laden: Zustand bleibt.
- Die drei Zwei-Tab-Fälle aus den Akzeptanzkriterien.
- Browser-Konsole ohne Errors.
- `db-migrate.php verify fragen` muss nach dem Aufräumen wieder `OK` melden.

**Übergabenotiz:**

### AP-2.5: Zweiter Frageneditor `risiko-quiz/js/admin.js` umstellen

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-2.3

**Ziel & Kontext:**
`risiko-quiz/admin.html` mit `risiko-quiz/js/admin.js` ist ein zweiter
vollständiger Kategorie-/Frageneditor. Seine Funktion `saveQuestions()` (ca.
Zeile 175) sendet die ganze Fragenbank; Aufrufstellen ca. 505–639, 895, 1064,
1259, 1292. Kann parallel zu AP-2.4 laufen (andere Dateien).

**Betroffene Dateien:**
- `risiko-quiz/js/admin.js` (ändern)
- `risiko-quiz/admin.html` (ändern, nur falls ein Konfliktdialog-Markup nötig ist)

**Vorgehen:**
1. Laden mit `StorageManager.loadQuestions({meta:true})`, Fehleranzeige wie in AP-2.4 Schritt 1.
2. Jede Aufrufstelle von `saveQuestions()` durch den passenden Einzelaufruf
   ersetzen (`saveQuestionNode`, `deleteQuestionNode`, `saveQuestion`,
   `deleteQuestion`, `importQuestions`), `_rev` nach Erfolg übernehmen.
3. Konfliktdialog nach Abschnitt 4.7; JSON-Import (ca. Zeile 1291) über
   `importQuestions('replace', …)` mit Rückfrage.
4. Die Funktion `saveGame()` (ca. Zeile 179, Spielstand) ist nicht Teil
   dieses APs und bleibt unverändert.

**Akzeptanzkriterien:**
- [ ] Kein `POST ?f=questions` mehr aus `risiko-quiz/admin.html` (Netzwerk-Tab bei Anlegen, Umbenennen, Löschen, Frage speichern).
- [ ] Konfliktfall (derselbe Eintrag in `admin.html` und `risiko-quiz/admin.html` geändert) zeigt den Dialog.
- [ ] Spieleinstellungen und Spielwähler in `risiko-quiz/admin.html` funktionieren unverändert.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `node --check risiko-quiz/js/admin.js`.
- Klickpfad mit Testkategorie `TST-RQ`: anlegen, Unterkategorie, Frage anlegen/ändern/löschen, Kategorie löschen; jeweils neu laden.
- Spielwähler: bestehendes Spiel öffnen, Titel ändern, speichern, neu laden → Titel bleibt.

**Übergabenotiz:**

### AP-2.6: Änderungsverlauf im Frageneditor

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-2.4 (gleiche Datei `admin.html`)

**Ziel & Kontext:**
Oberfläche für die Endpunkte `q-history`/`q-restore` über
`StorageManager.loadQuestionHistory(id)`, `loadDeletedQuestions()`,
`restoreQuestion(hid)` (AP-2.3).

**Betroffene Dateien:**
- `admin.html` (ändern)

**Vorgehen:**
1. Im Fragen-Modal (bestehende Frage) Schaltfläche „🕘 Verlauf": Liste der
   Fassungen (Datum/Uhrzeit de-AT, Aktion, Fragetext gekürzt über
   `richToPlainText`), je Zeile „Anzeigen" (Felder schreibgeschützt
   darstellen, Inhalte über `renderRichContent`) und „Wiederherstellen".
2. In der Editor-Kopfzeile Schaltfläche „🗑 Gelöschte Fragen": Liste mit
   Fragetext, ehemaliger Kategorie (Pfad mit ` › `, sofern der Knoten noch
   existiert) und „Wiederherstellen". Antwort `parent missing` →
   Meldung „Die Kategorie existiert nicht mehr."
3. Nach dem Wiederherstellen den Baum neu laden.
4. Styling mit den vorhandenen Klassen/Variablen aus `risiko-quiz/css/admin.css`.

**Akzeptanzkriterien:**
- [ ] Neue Frage anlegen und dreimal ändern → Verlauf zeigt vier Einträge (1× create, 3× update), neueste zuerst. (Aus den Dateien migrierte Fragen haben bis zur ersten Änderung keinen Verlaufseintrag – der Verlauf zeigt dann „Noch keine Änderungen".)
- [ ] „Wiederherstellen" einer älteren Fassung setzt alle Felder zurück und erzeugt einen weiteren Verlaufseintrag.
- [ ] Gelöschte Frage erscheint unter „Gelöschte Fragen" und ist nach dem Wiederherstellen wieder in ihrer Kategorie.
- [ ] Texte mit Formel (`$H_2O$`) und HTML-Sonderzeichen (`<b>`) werden im Verlauf korrekt bzw. escaped angezeigt.

**Tests:**
- Klickpfade für jedes Akzeptanzkriterium mit Testkategorie `TST-Verlauf`, am Ende gelöscht.
- Browser-Konsole ohne Errors; Hell- und Dunkelmodus kurz sichten (Texte lesbar).

**Übergabenotiz:**

### AP-2.7: Suche und Filter im Frageneditor

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-2.6 (gleiche Datei `admin.html`)

**Ziel & Kontext:**
Suche im Browser über die bereits geladenen Fragen (Entscheidung in Abschnitt 4.1).

**Betroffene Dateien:**
- `admin.html` (ändern)

**Vorgehen:**
1. Über dem Kategoriebaum eine Zeile: Suchfeld (Platzhalter „Fragen durchsuchen…"),
   Auswahl Schwierigkeit (Alle/100/200/300/400/500), Auswahl Typ
   (Alle/Multiple Choice/Offen), Schaltfläche „✕" zum Zurücksetzen, Trefferzahl.
2. Treffer, wenn alle durch Leerzeichen getrennten Suchwörter
   (Groß/Klein egal) in `richToPlainText` von Frage, Antwort, Optionen oder
   Hinweis vorkommen UND die Filter passen.
3. Bei aktiver Suche: nur Knoten mit Treffern (samt Vorfahren) anzeigen und
   aufklappen, nur Treffer-Fragen anzeigen. Eingabe mit 200 ms Verzögerung.
4. Die Suche verändert nur die Anzeige, nie die Daten; Speichern/Bearbeiten
   funktioniert auch bei aktiver Suche.

**Akzeptanzkriterien:**
- [ ] Ein Suchwort, das genau in einer bekannten Frage vorkommt, zeigt Trefferzahl 1 und nur deren Kategoriepfad.
- [ ] Filter „500" + „Offen" zeigt ausschließlich offene 500er-Fragen.
- [ ] „✕" stellt die vollständige Ansicht mit dem vorherigen Auf-/Zuklapp-Zustand wieder her.
- [ ] Eine Frage, die während aktiver Suche bearbeitet und gespeichert wird, ist nach Neuladen geändert.

**Tests:**
- Klickpfade für jedes Akzeptanzkriterium; Konsole ohne Errors.

**Übergabenotiz:**

### AP-2.8: Integrationstest Phase 2

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-2.5, AP-2.7

**Ziel & Kontext:**
Nachweis des Phasen-Endzustands auf einer frisch migrierten Testinstanz.
Dieses AP ändert keinen Produktivcode; gefundene Fehler werden als ✗ mit
Beschreibung gemeldet (Korrektur-AP durch den Orchestrator).

**Betroffene Dateien:**
- keine (nur Abschnitt 9 dieses Plans)

**Vorgehen:**
1. `tools/sync-testserver.ps1`, dann `db-migrate.php import-force fragen` und `verify fragen` → `OK`.
2. Jedes Spiel, das Fragen lädt, einmal starten und prüfen, dass die
   Kategorieauswahl bzw. das Spielfeld dieselben Kategorien und Fragenzahlen
   zeigt wie in der AP-1.3-Übergabenotiz: `risiko-quiz/index.html`,
   `risiko-quiz/practice.html`, `quizpfad/index.html`,
   `Leiterspiel-quiz/index.html` und `solo.html`, `Labyrint-Quiz/index.html`
   und `solo.html`, `schiffeversenken/index.html` und `solo.html`,
   `lernkarten/index.html`, `vorschlaege.html` (Kategorieliste).
3. Regressionscheck Phase 1: beide Testskripte unter `tests/` grün.
4. Alle Skripte unter `tests/` (inkl. `api-questions-test.ps1`) grün.

**Akzeptanzkriterien:**
- [ ] Alle in Schritt 2 genannten Seiten laden Fragen ohne Konsolenfehler.
- [ ] Alle Testskripte grün; `verify fragen` am Ende `OK`.
- [ ] Ergebnis im Testprotokoll eingetragen.

**Tests:**
- wie Vorgehen.

**Übergabenotiz:**

### AP-2.rev: Unabhängiges Review Phase 2

**Status:** ☐ offen
**Umfang:** M
**Modell:** opus
**Abhängigkeiten:** AP-2.1 … AP-2.8

**Ziel & Kontext:**
Unabhängige Prüfung der Phase 2, nur lesend.

**Vorgehen:**
1. Jedes Implementierungs-AP gegen seine Akzeptanzkriterien prüfen.
2. Phasen-Endzustand laut Abschnitt 6.
3. Scope-Check gegen Abschnitt 2 (insbesondere: Spielstand-Endpunkte und Spiele unverändert).
4. Qualitäts-Check: jede Schreibroute ruft `requireAdminKey()`; Validierung laut AP-2.1 Schritt 4/5; keine Ausgabe von Ausnahmetexten an den Client; im Editor nirgends `innerHTML` mit ungefiltertem Inhalt (nur `renderRichContent`/Escaping); kein verbliebener Ganz-Datei-Schreibweg; `_rev` gelangt nicht in Exporte oder Spielstände.
5. Bericht mit Schweregrad, AP, Datei, Fundstelle in die Übergabenotiz.

**Akzeptanzkriterien:**
- [ ] Jedes Implementierungs-AP wurde gegen seine Akzeptanzkriterien geprüft.
- [ ] Alle Befunde mit Schweregrad, Datei und Fundstelle dokumentiert.
- [ ] Keine Datei wurde verändert.

**Tests:**
- entfällt.

**Übergabenotiz:**

### AP-2.doc: Dokumentation Phase 2

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-2.rev

**Ziel & Kontext:**
Doku auf den Stand nach Phase 2.

**Betroffene Dateien:**
- `docs/api-referenz.md` (ändern: Fragen-Endpunkte aus Abschnitt 4.6, Antwortcodes, `meta=1`)
- `docs/datenbank.md` (ändern: Verlauf, Import-Modi)
- `docs/architektur.md` (ändern: Abschnitt Sicherheitsmodell – Backup-Rotation gilt nicht mehr für Fragen)
- `docs/datenformate.md` (ändern: Fragen liegen in der Datenbank; Format der API-Antwort unverändert)
- `CLAUDE.md` (ändern: Abschnitte „Zentrale Fragendatenbank" und „StorageManager-Endpunkte" – Speichern pro Eintrag, kein `saveQuestions(qb)`, Ladebeispiel ohne Datei-/localStorage-Ausweichweg erst nach Phase 5 anpassen, hier nur mit Hinweis versehen)
- Datei-Map

**Vorgehen:**
1. Übergabenotizen durchgehen, Dokumente nachziehen, Datei-Map abgleichen.
2. Phasen-Branch nach `datenbank` mergen und pushen.

**Akzeptanzkriterien:**
- [ ] Jeder neue Endpunkt aus Phase 2 steht in `docs/api-referenz.md`.
- [ ] Kein Dokument beschreibt mehr das Überschreiben der ganzen Fragenbank als gültigen Weg.
- [ ] Datei-Map aktuell; Merge nach `datenbank` erfolgt.

**Tests:**
- Stichprobe: zwei Endpunkte aus der Doku per curl aufrufen, Antwort entspricht der Beschreibung.

**Übergabenotiz:**

### Phase 3: Vorschläge

### AP-3.1: Vorschlags-Endpunkte auf die Datenbank

**Status:** ☐ offen
**Umfang:** M
**Modell:** opus (offener Schüler-Endpunkt, Eingabevalidierung)
**Abhängigkeiten:** AP-2.doc

**Ziel & Kontext:**
`api.php` enthält die Blöcke `if ($key === 'drafts')` (GET offen, POST offen
mit Whitelist-Validierung, Datei `data/drafts.json` unter `flock`) und
`if ($key === 'draft')` (DELETE mit Admin-Token). Umstellung auf die Sammlung
`draft` und neuer Endpunkt `draft-accept` (Abschnitt 4.6).

**Betroffene Dateien:**
- `api.php` (ändern)
- `tests/api-drafts-test.ps1` (neu)

**Vorgehen:**
1. Branch `db-phase-3` von `datenbank`.
2. `GET ?f=drafts`: **neu mit `requireAdminKey()`** (enthält Schülernamen),
   Antwort `spBuildList('draft')` – Array, älteste zuerst, Felder wie bisher.
3. `POST ?f=drafts`: die bestehende Validierung (Größenlimit 20 000 Bytes,
   Feld-Whitelist, Kürzungen, serverseitiges `submittedAt`, ID-Regex bzw.
   `uniqid('draft-')`) unverändert übernehmen; speichern per
   `spItemSave('draft', $id, null, $clean, null)`. Existiert die ID schon →
   neue ID per `uniqid`. Sind bereits 500 Vorschläge vorhanden →
   `429 {"error":"limit"}` (bisher wurden die ältesten still verworfen).
4. `DELETE ?f=draft&id=X`: `spItemDelete('draft', $id, null)` ist hier ohne
   Versionsprüfung zulässig – dazu `spItemDelete` NICHT ändern, sondern vorher
   die aktuelle `rev` lesen und übergeben.
5. `POST ?f=draft-accept` (Admin-Token) `{draftId, nodeId, question}`: in
   einer `spTx`: Vorschlag muss existieren (sonst 404), Frage mit derselben
   Validierung wie `q-question` anlegen (gemeinsame Funktion aus AP-2.1
   wiederverwenden, nicht kopieren), Verlaufseintrag `create`, Vorschlag
   löschen. Antwort `{"ok":true,"id":"<Frage-ID>","rev":1}`.

**Akzeptanzkriterien:**
- [ ] `GET ?f=drafts` ohne Token → 403, mit Token → Array.
- [ ] `POST ?f=drafts` ohne Token legt einen Vorschlag an; ein Body > 20 000 Bytes → 413; ungültiges JSON → 400.
- [ ] `draft-accept` legt die Frage an und entfernt den Vorschlag; schlägt die Fragen-Validierung fehl (z. B. unbekannter `nodeId`), existiert der Vorschlag weiterhin und keine Frage wurde angelegt.
- [ ] `grep -n "drafts.json" api.php` liefert keinen Treffer.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `tests/api-drafts-test.ps1` mit je einem Fall pro Akzeptanzkriterium, Vorschläge mit `submitter` = `TST`, am Ende gelöscht; zusätzlich: 20 parallele `POST ?f=drafts` (PowerShell-Jobs) → danach genau 20 Vorschläge mehr.
- `php -l api.php`.

**Übergabenotiz:**

### AP-3.2: Schülerseite `vorschlaege.html` ohne stillen Ausweichweg

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-3.1

**Ziel & Kontext:**
`sendDraft(draft)` in `vorschlaege.html` (ca. Zeile 794) speichert bei jedem
Fehler in `localStorage['rq_drafts']` und meldet trotzdem Erfolg – die
Lehrkraft sieht den Vorschlag nie. `loadCategories()` (ca. Zeile 483) fällt
auf `./data/questions.json` und `rq_questions` zurück.

**Betroffene Dateien:**
- `vorschlaege.html` (ändern)

**Vorgehen:**
1. `sendDraft` liefert nur bei `r.ok` `true`; der `localStorage`-Zweig entfällt.
   Bei 429: Meldung „Es sind bereits sehr viele Vorschläge offen. Bitte sag
   deiner Lehrkraft Bescheid." Sonst die bestehende Meldung „Fehler beim
   Einreichen. Bitte versuche es erneut." Das Formular bleibt ausgefüllt.
2. `loadCategories` lädt nur noch `./api.php?f=questions`; bei Fehler eine
   sichtbare Meldung und deaktivierter Absenden-Button.
3. Das Admin-Token darf in dieser Datei nicht vorkommen.

**Akzeptanzkriterien:**
- [ ] `grep -n "rq_drafts\|rq_questions\|data/questions.json\|LP-Spiele" vorschlaege.html` liefert keinen Treffer.
- [ ] Bei gestopptem MariaDB erscheint nach „Vorschlag einreichen" die Fehlermeldung, die Eingaben bleiben stehen, `localStorage` enthält keinen Schlüssel `rq_drafts`.
- [ ] Bei laufender Datenbank erscheint der Vorschlag anschließend in `GET ?f=drafts`.

**Tests:**
- Klickpfad: Vorschlag (MC und offen, einer mit Bild-Upload) einreichen → Erfolgskarte; per curl mit Token prüfen.
- Fehlerpfad mit gestopptem MariaDB (`C:\allinkl-testserver\stop-server.cmd` beendet alles; stattdessen nur `data\db-config.php` im Ziel kurz umbenennen).

**Übergabenotiz:**

### AP-3.3: Vorschläge im Frageneditor prüfen und annehmen

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-3.1

**Ziel & Kontext:**
Der Vorschlags-Bereich in `admin.html` (ca. Zeile 1537–1960): Laden per
`?f=drafts` ohne Token plus Zusammenführen mit `localStorage['rq_drafts']`
(ca. 1549), Ablehnen per `apiDeleteDraft` (ca. 1552), Annehmen in
`saveApprovedDraft` (ca. 1890–1944; nach AP-2.4 legt es die Frage per
`StorageManager.saveQuestion` an und löscht danach den Vorschlag).

**Betroffene Dateien:**
- `admin.html` (ändern)
- `risiko-quiz/js/shared.js` (ändern: neue Methode `StorageManager.acceptDraft(draftId, nodeId, question)` → `POST ?f=draft-accept`, Rückgabeform wie die anderen Methoden aus AP-2.3)

**Vorgehen:**
1. Laden mit Header `X-Admin-Key`; das Zusammenführen mit `rq_drafts` entfernen.
2. `saveApprovedDraft` ruft nur noch `StorageManager.acceptDraft(…)`; bei `ok`
   die neue Frage (mit `_rev`) in den lokalen Baum einfügen und den Vorschlag
   aus der Liste nehmen; bei Fehler Meldung, Vorschlag bleibt in der Liste.
3. Ablehnen: Ergebnis von `apiDeleteDraft` prüfen; nur bei Erfolg aus der Liste nehmen.

**Akzeptanzkriterien:**
- [ ] Annehmen löst genau einen Request (`POST ?f=draft-accept`) aus.
- [ ] Bei gestopptem MariaDB bleibt der Vorschlag nach „Annehmen" in der Liste und eine Fehlermeldung erscheint.
- [ ] `grep -n "rq_drafts" admin.html` liefert keinen Treffer.
- [ ] Zähler-Badge der Vorschläge stimmt nach Annehmen/Ablehnen.

**Tests:**
- Klickpfad: zwei Vorschläge über `vorschlaege.html` einreichen; in `admin.html` einen annehmen (Zielkategorie `TST-Vorschlag`), einen ablehnen; Seite neu laden → Frage vorhanden, Liste leer. Testkategorie löschen.
- **Phasen-Integrationstest:** alle Skripte unter `tests/` grün; Regressionscheck Phase 2: Zwei-Tab-Konfliktfall aus AP-2.4 und ein Spielstart (`quizpfad/index.html`) funktionieren.

**Übergabenotiz:**

### AP-3.rev: Unabhängiges Review Phase 3

**Status:** ☐ offen
**Umfang:** S
**Modell:** opus
**Abhängigkeiten:** AP-3.1 … AP-3.3

**Ziel & Kontext:**
Unabhängige Prüfung der Phase 3, nur lesend.

**Vorgehen:**
1. Jedes AP gegen seine Akzeptanzkriterien prüfen.
2. Phasen-Endzustand laut Abschnitt 6; Scope-Check gegen Abschnitt 2.
3. Qualitäts-Check: der offene `POST ?f=drafts` validiert und begrenzt alle Felder wie zuvor; Schülerseite enthält kein Admin-Token; `draft-accept` ist atomar; Vorschlagstexte werden im Editor nur escaped bzw. über `renderRichContent` angezeigt.
4. Bericht in die Übergabenotiz.

**Akzeptanzkriterien:**
- [ ] Jedes Implementierungs-AP wurde geprüft; Befunde mit Schweregrad, Datei, Fundstelle dokumentiert.
- [ ] Keine Datei wurde verändert.

**Tests:**
- entfällt.

**Übergabenotiz:**

### AP-3.doc: Dokumentation Phase 3

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-3.rev

**Ziel & Kontext:**
Doku auf den Stand nach Phase 3.

**Betroffene Dateien:**
- `docs/api-referenz.md` (ändern: `drafts`, `draft`, `draft-accept`, Token-Pflicht für GET, 429)
- `docs/datenbank.md` (ändern: Sammlung `draft`)
- `CLAUDE.md` (ändern: Abschnitt Rich-Content – Hinweis auf `vorschlaege.html` unverändert lassen, nur Speicherort der Vorschläge korrigieren, falls genannt)
- Datei-Map

**Vorgehen:**
1. Dokumente nachziehen, Datei-Map abgleichen.
2. Phasen-Branch nach `datenbank` mergen und pushen.

**Akzeptanzkriterien:**
- [ ] Vorschlags-Endpunkte vollständig und korrekt dokumentiert.
- [ ] Datei-Map aktuell; Merge erfolgt.

**Tests:**
- Stichprobe: `GET ?f=drafts` ohne Token verhält sich wie dokumentiert (403).

**Übergabenotiz:**

### Phase 4: Begriffe, Designer, Memory

### AP-4.1: Begriffslisten-Endpunkte (`jo-words`, `jo-node`, `jo-import`)

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-3.doc

**Ziel & Kontext:**
`?f=jo-words` ist heute ein Eintrag im Array `$files` von `api.php`
(`data/just-one/wordlists.json`, GET offen, POST ganze Datei mit Admin-Token).
Just One, Insider und Hochstapler lesen die Liste; nur `just-one/admin.html` schreibt.

**Betroffene Dateien:**
- `api.php` (ändern)
- `tests/api-content-test.ps1` (neu – wird in AP-4.3 und AP-4.6 erweitert)

**Vorgehen:**
1. Branch `db-phase-4` von `datenbank`.
2. Endpunkte laut Abschnitt 4.6: `GET ?f=jo-words` (`spBuildWords`, `meta=1`
   optional), `POST ?f=jo-words` → 410, `POST/DELETE ?f=jo-node`, `POST ?f=jo-import`.
3. `jo-node`: `parentId` `null` (Kategorie) oder ID einer Kategorie
   (Unterkategorie; tiefere Ebenen → 400). `name` nicht leer, max. 200
   Zeichen. `words` nur bei Unterkategorien: Array von Strings, je max. 200
   Zeichen, max. 2000 Einträge; fehlt `words` beim Ändern, bleibt die
   bestehende Liste erhalten.
4. `DELETE` einer Kategorie löscht ihre Unterkategorien mit (eine Transaktion).
5. `'jo-words'` aus `$files` und aus der Admin-Key-Bedingung im Legacy-Block entfernen.

**Akzeptanzkriterien:**
- [ ] `GET ?f=jo-words` ist strukturell identisch zu `data/just-one/wordlists.json` der Testinstanz (nach `db-migrate.php import begriffe`).
- [ ] Unterkategorie mit Wortliste anlegen, Wörter ändern, veraltetes `_baseRev` → 409; Reihenfolge der Wörter bleibt exakt erhalten.
- [ ] Schreibzugriffe ohne Token → 403; `POST ?f=jo-words` → 410.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `tests/api-content-test.ps1`, Abschnitt „Begriffe", je Akzeptanzkriterium ein Fall mit `TST…`-IDs und Aufräumen.
- Da die echte Wortlisten-Datei leer sein kann: vor dem Test über `jo-import` (replace) einen kleinen Bestand (2 Kategorien, 3 Unterkategorien, je 5 Wörter inkl. eines Worts mit `$x^2$` und eines mit `|`) einspielen, `GET` gegen die Eingabe vergleichen, danach den Originalzustand wiederherstellen.
- Spielprobe: `just-one/index.html` → „+ Neues Spiel erstellen" → Kategorieauswahl zeigt den Bestand.

**Übergabenotiz:**

### AP-4.2: Begriffs-Editor (`just-one/admin.html`) speichert pro Eintrag

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-4.1

**Ziel & Kontext:**
`just-one/js/wordlist-shared.js` enthält `JoWordlistStorage` (Laden mit
Ausweichweg auf `localStorage['jo_wordlists']`, Speichern der ganzen Datei, ca.
Zeile 34–61). `just-one/js/admin.js` ruft nach jeder Baumänderung `autoSave`
auf (ca. 93–163); `saveWords` (ca. 250) und `confirmImport` (ca. 324) melden
„Gespeichert!" auch bei Fehlschlag. `wordlist-shared.js` wird auch von
`insider/` und `hochstapler/` per `<script src>` eingebunden (nur lesend).

**Betroffene Dateien:**
- `just-one/js/wordlist-shared.js` (ändern)
- `just-one/js/admin.js` (ändern)
- `just-one/admin.html` (ändern, nur falls Dialog-Markup nötig)

**Vorgehen:**
1. `JoWordlistStorage.load(opts)`: nur `?f=jo-words` (`opts.meta` → `&meta=1`),
   kein `jo_wordlists` mehr, Fehler als geworfener `Error` mit `status`.
   Die lesenden Aufrufer in `just-one/js/game.js`, `insider/js/game.js`,
   `hochstapler/js/game.js` prüfen: sie müssen einen Ladefehler sichtbar
   melden statt mit leerer Liste weiterzumachen (kleinste nötige Änderung).
2. Neue Methoden `saveNode({id,parentId,name,words,_baseRev})`,
   `deleteNode(id, rev)`, `importAll(mode, categories)`; Rückgabeform wie in
   AP-2.3 (`ok` / `conflict` / `error`). Die alte `save(ganzeListe)` wirft
   `Error('stillgelegt')`.
3. `admin.js`: `autoSave`-Aufrufe durch gezielte `saveNode`/`deleteNode`
   ersetzen; `saveWords` speichert die eine bearbeitete Unterkategorie;
   `confirmImport` nutzt `importAll('merge', …)`. „Gespeichert!" nur bei `ok`;
   Konfliktdialog nach Abschnitt 4.7.

**Akzeptanzkriterien:**
- [ ] Kein `POST ?f=jo-words` mehr im Netzwerk-Tab bei Kategorie anlegen/umbenennen/löschen, Wörter speichern, MD-Import.
- [ ] Zwei Tabs, dieselbe Unterkategorie: zweiter Speichervorgang zeigt den Konfliktdialog; verschiedene Unterkategorien: beide Änderungen bleiben erhalten.
- [ ] Bei umbenannter `db-config.php` erscheint nie „Gespeichert!".
- [ ] `grep -rn "jo_wordlists" just-one insider hochstapler` liefert keinen Treffer.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `node --check` für alle geänderten `.js`.
- Klickpfad mit Kategorie `TST-Begriffe`: anlegen, Unterkategorie, 5 Wörter speichern, umbenennen, MD-Import einer kleinen Liste, löschen.
- Spielprobe: je ein neues Spiel in `just-one/`, `insider/`, `hochstapler/` erstellen, Kategorieauswahl erscheint.

**Übergabenotiz:**

### AP-4.3: Designer-Endpunkte (`ls-board`, `lab-maze`) und Bild-Auslagerung

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-4.1 (gleiche Datei `api.php`)

**Ziel & Kontext:**
`api.php` enthält die Blöcke `ls-boards` und `lab-mazes` (GET offen, POST
ganze Liste mit Admin-Token, Dateien `data/leiterspiel-designer/boards.json`
und `data/labyrinth-designer/mazes.json`). Ein Brett enthält ein
Base64-Hintergrundbild (`backgroundImage` beginnt mit `data:image`, rund 351 KB).

**Betroffene Dateien:**
- `api.php` (ändern)
- `db-migrate.php` (ändern: Bild-Auslagerung beim Import der Gruppe `bretter`)
- `tests/api-content-test.ps1` (ändern: Abschnitt „Designer")

**Vorgehen:**
1. Endpunkte laut Abschnitt 4.6: `GET ?f=ls-boards`/`?f=lab-mazes` aus
   `spBuildList`, Listen-`POST` → 410, `POST/DELETE ?f=ls-board` und
   `?f=lab-maze` (ein Objekt mit `id`, `name` Pflicht, `_baseRev` optional;
   Body max. 1 MB, sonst 413).
2. `POST ?f=ls-board` lehnt ein `backgroundImage`, das mit `data:` beginnt,
   mit 400 `{"error":"base64 not allowed"}` ab (Projektregel: kein Base64 in
   Datenbanken).
3. `db-migrate.php`, Gruppe `bretter`: `backgroundImage` mit `data:image/…;base64,`
   dekodieren, als `data/images/img_<Ymd>_<zufall>.<ext>` speichern (gleiches
   Namensschema wie `storeUploadedImage()` in `api.php`; nur jpg/jpeg/png/webp/gif),
   und das Feld durch den relativen Pfad `data/images/<datei>` ersetzen. Die
   Prüfung `verify bretter` vergleicht deshalb für `backgroundImage` nur, ob
   das Bild existiert und dieselben Bytes hat wie das dekodierte Original.
4. Prüfen, mit welcher Pfadtiefe der Leiterspiel-Designer und das Spiel
   `backgroundImage` verwenden (Seiten liegen in `Leiterspiel-quiz/`): Der
   gespeicherte Wert ist relativ zum Projekt-Root; die Anpassung der
   Anzeige erfolgt in AP-4.4. In der Übergabenotiz festhalten.

**Akzeptanzkriterien:**
- [ ] Nach `db-migrate.php import bretter` und `import labyrinthe`: `verify` meldet `OK`; kein `data`-Feld in `sp_items` enthält `data:image` (`SELECT COUNT(*) … WHERE data LIKE '%data:image%'` = 0).
- [ ] Die Bilddatei liegt unter `data/images/` und ist per HTTP abrufbar.
- [ ] Ein Brett/Labyrinth anlegen, ändern (409 bei veraltetem `_baseRev`), löschen; ein zweites Gerät, das ein anderes Brett speichert, lässt das erste unberührt.
- [ ] Listen-POST → 410; Schreibzugriffe ohne Token → 403.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `tests/api-content-test.ps1`, Abschnitt „Designer": Fälle für die Akzeptanzkriterien mit `TST…`-IDs.
- `curl -I http://localhost:8080/spiele-test/data/images/<datei>` → 200, `Content-Type: image/…`.

**Übergabenotiz:**

### AP-4.4: Leiterspiel-Designer und -Spiel an die neuen Endpunkte anbinden

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-4.3

**Ziel & Kontext:**
`Leiterspiel-quiz/designer.html`: `_boardsLoad` (ca. 303–315, Ausweichweg auf
`localStorage['ls_custom_boards']`, wenn der Server eine leere Liste liefert),
`_boardsSave` (ca. 317–323, ganze Liste), Speichern (ca. 814–821),
Bild-Einlesen per `readAsDataURL`/`toDataURL` (ca. 760–785).
`Leiterspiel-quiz/js/leiterspiel.js` lädt die Bibliothek (ca. 160–175, gleicher Ausweichweg).

**Betroffene Dateien:**
- `Leiterspiel-quiz/designer.html` (ändern)
- `Leiterspiel-quiz/js/leiterspiel.js` (ändern)
- `Leiterspiel-quiz/solo.html`, `Leiterspiel-quiz/view.html` (ändern, nur falls sie die Brett-Bibliothek oder `backgroundImage` lesen – per Grep nach `ls-boards`, `ls_custom_boards`, `backgroundImage` prüfen)

**Vorgehen:**
1. Laden nur noch über `?f=ls-boards&meta=1` (Designer) bzw. `?f=ls-boards`
   (Spiel); `ls_custom_boards` wird nirgends mehr gelesen oder geschrieben.
2. Speichern eines Bretts → `POST ?f=ls-board` mit `_baseRev`; Löschen →
   `DELETE ?f=ls-board&id=…&rev=…`. Konfliktdialog nach Abschnitt 4.7.
3. Hintergrundbild: statt Base64 über `rcUploadImage(file)` aus
   `js/rich-content.js` hochladen (liefert den Pfad unter `data/images/`;
   Modul per `<script src="../js/rich-content.js">` einbinden, falls noch
   nicht vorhanden) und den vom Server gelieferten Pfad in `backgroundImage`
   speichern. Anzeige-Pfad für Seiten in `Leiterspiel-quiz/`: `../` + Pfad;
   absolute URLs (`https://…`) unverändert verwenden.
4. Eine kleine Hilfsfunktion für die Pfadauflösung an allen Stellen
   verwenden, die `backgroundImage` anzeigen (Designer, Spiel, ggf. Schüleransicht).

**Akzeptanzkriterien:**
- [ ] Bestehendes Brett mit (ausgelagertem) Hintergrundbild wird im Designer und im Spiel mit Bild angezeigt.
- [ ] Neues Brett mit neuem Hintergrundbild speichern → in `sp_items` steht ein Pfad `data/images/…`, kein `data:`.
- [ ] Zwei Browser (einer privat): Brett A in Browser 1 und Brett B in Browser 2 speichern → beide existieren.
- [ ] `grep -rn "ls_custom_boards" Leiterspiel-quiz` liefert keinen Treffer.
- [ ] Datei-Map aktualisiert.

**Tests:**
- Klickpfade für die Akzeptanzkriterien; ein Spiel mit eigenem Brett erstellen, starten, einmal würfeln.
- Konsole ohne Errors; `node --check Leiterspiel-quiz/js/leiterspiel.js`.

**Übergabenotiz:**

### AP-4.5: Labyrinth-Designer und -Spiel an die neuen Endpunkte anbinden

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-4.3 (parallel zu AP-4.4 möglich, andere Dateien)

**Ziel & Kontext:**
`Labyrint-Quiz/designer.html`: `getLib()` (ca. 373) liest **nur**
`localStorage['lab_maze_library']`, `setLib(lib)` (ca. 374–378) sendet diese
Liste komplett an den Server – ein zweites Gerät löscht damit fremde
Labyrinthe. `saveMaze`, `loadMaze`, `deleteMaze`, `loadSavedList` bauen
darauf auf. `Labyrint-Quiz/js/labyrinth.js` kopiert die Serverliste in
`lab_maze_library` (ca. 155–160); `Labyrint-Quiz/solo.html` liest nur
`localStorage` (ca. 435).

**Betroffene Dateien:**
- `Labyrint-Quiz/designer.html` (ändern)
- `Labyrint-Quiz/js/labyrinth.js` (ändern)
- `Labyrint-Quiz/solo.html` (ändern)

**Vorgehen:**
1. Designer: Bibliothek beim Start und nach jedem Speichern/Löschen von
   `?f=lab-mazes&meta=1` laden und in einer Variablen halten; `getLib`/`setLib`
   entfallen. `saveMaze` → `POST ?f=lab-maze` (mit `_baseRev` des geladenen
   Labyrinths), `deleteMaze` → `DELETE ?f=lab-maze&id=…&rev=…`. Statuszeile
   „gespeichert" nur bei `ok`; Konfliktdialog nach Abschnitt 4.7.
2. `labyrinth.js` und `solo.html` laden die Bibliothek direkt von
   `?f=lab-mazes`; `lab_maze_library` wird nirgends mehr gelesen oder geschrieben.
3. Bestehende Funktionsnamen, die an `onclick` hängen, beibehalten.

**Akzeptanzkriterien:**
- [ ] Zwei Browser (einer privat, also ohne lokalen Bestand): im privaten Fenster ein neues Labyrinth speichern → die drei bestehenden Labyrinthe sind weiterhin vorhanden.
- [ ] Laden, Ändern, Löschen im Designer funktionieren; nach Neuladen ist der Zustand korrekt.
- [ ] Spiel (`index.html`, Setup) und `solo.html` bieten die gespeicherten Labyrinthe an.
- [ ] `grep -rn "lab_maze_library" Labyrint-Quiz` liefert keinen Treffer.
- [ ] Datei-Map aktualisiert.

**Tests:**
- Klickpfade für die Akzeptanzkriterien mit einem Labyrinth namens `TST-Labyrinth`, am Ende gelöscht.
- `node --check Labyrint-Quiz/js/labyrinth.js`; Konsole ohne Errors.

**Übergabenotiz:**

### AP-4.6: Memory-Endpunkte (`memory-pairs`, `mem-category`, `mem-pair`, `mem-import`)

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-4.3 (gleiche Datei `api.php`)

**Ziel & Kontext:**
`?f=memory-pairs` ist ein Eintrag in `$files` (`data/memory/pairs.json`, GET
offen, POST ganze Datei **ohne** Admin-Token). Künftig Schreiben pro Eintrag
und nur mit Token.

**Betroffene Dateien:**
- `api.php` (ändern)
- `tests/api-content-test.ps1` (ändern: Abschnitt „Memory")

**Vorgehen:**
1. Endpunkte laut Abschnitt 4.6. `mem-pair`: `categoryId` muss existieren;
   `sideA`/`sideB` je `{type, content}` mit `type` ∈ `text|formula|image`,
   `content` String max. 5000 Zeichen; `difficulty` Ganzzahl 1–5.
2. `DELETE ?f=mem-category` löscht die Paare der Kategorie mit.
3. `'memory-pairs'` aus `$files` entfernen. Enthält `$files` danach nur noch
   `gamestate` und `settings`, den Legacy-Block entsprechend vereinfachen
   (Backup-Rotation bleibt für diese beiden unverändert).

**Akzeptanzkriterien:**
- [ ] `GET ?f=memory-pairs` ist strukturell identisch zu `data/memory/pairs.json` (nach `db-migrate.php import memory`).
- [ ] Kategorie und Paar anlegen/ändern/löschen; 409 bei veraltetem `_baseRev`.
- [ ] Schreibzugriffe ohne Token → 403; `POST ?f=memory-pairs` → 410.
- [ ] `?f=settings` und `?f=gamestate` verhalten sich unverändert (GET liefert denselben Inhalt wie vor dem AP).
- [ ] Datei-Map aktualisiert.

**Tests:**
- `tests/api-content-test.ps1`, Abschnitt „Memory", mit `TST…`-IDs und Aufräumen.
- `memory/index.html` laden: Kategorien und Paarzahlen wie zuvor (4 Kategorien, 100 Paare im Bestand vom 2026-11-17).

**Übergabenotiz:**

### AP-4.7: Memory-Editor speichert pro Eintrag

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-4.6

**Ziel & Kontext:**
`memory/js/memory-shared.js`: `MemoryStorageManager` (ca. 7–57, Laden mit
Ausweichweg auf `localStorage['memory_pairs']`, Speichern der ganzen Datei
ohne Token). `memory/js/memory-admin.js`: `autoSave` bei Kategorieänderungen
(ca. 76/87/107), `savePairs` (ca. 306, meldet „Gespeichert!" ungeprüft),
Auto-Save in `init` nach `migrateDollarDelimiters` (ca. 10–12).
`lernkarten/index.html` liest Memory-Paare nur.

**Betroffene Dateien:**
- `memory/js/memory-shared.js` (ändern)
- `memory/js/memory-admin.js` (ändern)
- `memory/admin.html` (ändern, nur falls Dialog-Markup nötig)

**Vorgehen:**
1. `MemoryStorageManager.load(opts)`: nur `?f=memory-pairs` (`meta` optional),
   kein `memory_pairs`, Fehler als geworfener `Error`. `memory/js/memory.js`
   (Spiel) zeigt bei Ladefehler eine Meldung.
2. Neue Methoden `saveCategory`, `deleteCategory`, `savePair`, `deletePair`,
   `importAll(mode, categories)` mit Header `X-Admin-Key: LP-Spiele-2026`
   und der Rückgabeform aus AP-2.3; alte Ganz-Datei-`save` wirft `Error('stillgelegt')`.
3. `memory-admin.js`: Kategorieänderungen einzeln speichern; der
   Speichern-Button sendet nur geänderte Paare (Änderungsmerker pro Paar),
   gelöschte Paare per `deletePair`; MD-Import über `importAll('merge', …)`.
   „Gespeichert!" nur, wenn alle Aufrufe `ok` lieferten; Konfliktdialog nach
   Abschnitt 4.7.
4. Die automatische Speicherung nach `migrateDollarDelimiters` in `init`
   speichert nur die tatsächlich geänderten Paare.

**Akzeptanzkriterien:**
- [ ] Kein `POST ?f=memory-pairs` mehr im Netzwerk-Tab.
- [ ] Ein Paar ändern und speichern → genau ein `POST ?f=mem-pair`.
- [ ] Zwei Tabs, dasselbe Paar: Konfliktdialog; verschiedene Paare: beide Änderungen bleiben.
- [ ] `grep -rn "memory_pairs" memory` liefert keinen Treffer.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `node --check` für geänderte `.js`.
- Klickpfad mit Kategorie `TST-Memory`: anlegen, drei Paare (Text, Formel, Bild-Upload) anlegen, eines ändern, eines löschen, MD-Import, Kategorie löschen.
- Spiel `memory/index.html`: Runde mit einer Bestandskategorie starten.
- **Phasen-Integrationstest:** alle Skripte unter `tests/` grün; `db-migrate.php verify alle` → `OK` (nach Aufräumen der Testdaten); Regressionscheck Phasen 2 und 3: Frage ändern in `admin.html`, Vorschlag einreichen und annehmen.

**Übergabenotiz:**

### AP-4.rev: Unabhängiges Review Phase 4

**Status:** ☐ offen
**Umfang:** M
**Modell:** opus
**Abhängigkeiten:** AP-4.1 … AP-4.7

**Ziel & Kontext:**
Unabhängige Prüfung der Phase 4, nur lesend.

**Vorgehen:**
1. Jedes AP gegen seine Akzeptanzkriterien prüfen.
2. Phasen-Endzustand laut Abschnitt 6; Scope-Check (Codenames-Wortlisten, `settings`, Spielstände unverändert).
3. Qualitäts-Check: Token auf allen Schreibrouten; Größen- und Typprüfungen; kein Base64 in `sp_items`; Pfadauflösung für `backgroundImage` lässt keine fremden Schemata (`javascript:`) zu; keine verbliebenen `localStorage`-Bibliotheken; Insider/Hochstapler laden Begriffe weiterhin.
4. Bericht in die Übergabenotiz.

**Akzeptanzkriterien:**
- [ ] Jedes Implementierungs-AP wurde geprüft; Befunde mit Schweregrad, Datei, Fundstelle dokumentiert.
- [ ] Keine Datei wurde verändert.

**Tests:**
- entfällt.

**Übergabenotiz:**

### AP-4.doc: Dokumentation Phase 4

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-4.rev

**Ziel & Kontext:**
Doku auf den Stand nach Phase 4.

**Betroffene Dateien:**
- `docs/api-referenz.md` (ändern: alle Endpunkte der Phase; `jo-words` fehlte dort bisher ganz)
- `docs/datenbank.md` (ändern: Sammlungen `jo-node`, `ls-board`, `lab-maze`, `mem-*`; Bild-Auslagerung)
- `docs/spiele/memory.md` (ändern: Speicherort; die falschen Pfade `memory/data/pairs.json`, `memory/data/images/`, `memory/lib/katex/` korrigieren)
- `docs/spiele/just-one.md`, `docs/spiele/leiterspiel.md`, `docs/spiele/labyrinth.md` (ändern: Speicherort der Begriffe/Bretter/Labyrinthe)
- `docs/architektur.md`, `docs/entwicklung.md` (ändern: Restrisiko „Memory-Paare ohne Token-Schutz" entfernen)
- `CLAUDE.md` (ändern: Tabelle „Spiele mit eigener Datenbank", Abschnitt Memory)
- Datei-Map

**Vorgehen:**
1. Dokumente nachziehen, Datei-Map abgleichen.
2. Phasen-Branch nach `datenbank` mergen und pushen.

**Akzeptanzkriterien:**
- [ ] Alle Endpunkte der Phase dokumentiert; genannte Pfade existieren.
- [ ] Datei-Map aktuell; Merge erfolgt.

**Tests:**
- Stichprobe: zwei dokumentierte Pfade/Endpunkte gegen den Code prüfen.

**Übergabenotiz:**

### Phase 5: Abschluss

### AP-5.1: Ausweichwege entfernen – QuizPfad und Leiterspiel

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-4.doc

**Ziel & Kontext:**
Die Spiele laden Fragen in drei Stufen: `../api.php?f=questions`, dann die
Datei `../data/questions.json`, dann `localStorage['rq_questions']`. Laut
Betreiber-Entscheidung gibt es nur noch die erste Stufe.

**Betroffene Dateien:**
- `quizpfad/js/quizpfad.js` (ändern – Ladefunktion ca. Zeile 212–237)
- `Leiterspiel-quiz/js/leiterspiel.js` (ändern – ca. 325–339)
- `Leiterspiel-quiz/view.html` (ändern – ca. 465)
- `Leiterspiel-quiz/solo.html` (ändern – ca. 280–286)

**Vorgehen:**
1. Branch `db-phase-5` von `datenbank`.
2. In jeder Datei die Fragen-Ladefunktion auf genau einen Abruf von
   `../api.php?f=questions` reduzieren. Bei Fehler (kein `r.ok`,
   Netzwerkfehler, Antwort ohne `categories`) eine gut sichtbare Meldung
   auf der Seite: „Die Fragendatenbank ist gerade nicht erreichbar. Bitte
   Seite neu laden." – und den Spielstart/das Erstellen deaktivieren, statt
   mit leerer Fragenliste weiterzumachen.
3. Die Spielstand-Ausweichwege (`…_gs_<CODE>` in `localStorage`,
   `checkServer`) sind NICHT Teil dieses APs und bleiben unverändert.

**Akzeptanzkriterien:**
- [ ] `grep -n "data/questions.json\|rq_questions" quizpfad/js/quizpfad.js Leiterspiel-quiz/js/leiterspiel.js Leiterspiel-quiz/view.html Leiterspiel-quiz/solo.html` liefert keinen Treffer.
- [ ] Mit Datenbank: Setup zeigt die Kategorieauswahl mit denselben Zahlen wie zuvor; ein Spiel lässt sich starten und eine Frage erscheint.
- [ ] Ohne Datenbank (`db-config.php` im Ziel umbenannt): die Meldung erscheint, kein Konsolen-Error durch `undefined`-Zugriffe.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `node --check` für die `.js`-Dateien; Inline-Skripte der HTML-Dateien parsen.
- Klickpfade für beide Zustände (mit/ohne Datenbank) je Seite.

**Übergabenotiz:**

### AP-5.2: Ausweichwege entfernen – Labyrinth, Schiffeversenken, Lernkarten

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-4.doc (parallel zu AP-5.1 möglich, andere Dateien)

**Ziel & Kontext:**
Wie AP-5.1 für die übrigen Seiten. `lernkarten/index.html` lädt zusätzlich
Memory-Paare (API → Datei `../data/memory/pairs.json` → `localStorage`).

**Betroffene Dateien:**
- `Labyrint-Quiz/js/labyrinth.js` (ändern – ca. 171–178)
- `Labyrint-Quiz/js/play.js` (ändern – ca. 157–161)
- `Labyrint-Quiz/solo.html` (ändern – ca. 405–406)
- `schiffeversenken/index.html` (ändern – ca. 228–230)
- `schiffeversenken/view.html` (ändern – ca. 451–453)
- `schiffeversenken/solo.html` (ändern – ca. 346–348)
- `lernkarten/index.html` (ändern – ca. 761–777)

**Vorgehen:**
1. Vorgehen und Fehlermeldung exakt wie AP-5.1 Schritt 2 und 3.
2. `lernkarten/index.html`: Fragen nur über `../api.php?f=questions`,
   Memory-Paare nur über `../api.php?f=memory-pairs`. Der Lernfortschritt in
   `localStorage['lernkarten_progress']` bleibt unverändert.

**Akzeptanzkriterien:**
- [ ] `grep -rn "data/questions.json\|rq_questions\|pairs.json\|memory_pairs" Labyrint-Quiz schiffeversenken lernkarten` liefert keinen Treffer.
- [ ] Mit Datenbank: jede Seite lädt Fragen (Lernkarten zusätzlich Memory-Karten); ein bestehender Lernkarten-Fortschritt bleibt erhalten.
- [ ] Ohne Datenbank: Meldung statt leerem Spiel, keine Konsolen-Errors.
- [ ] Datei-Map aktualisiert.

**Tests:**
- Wie AP-5.1; zusätzlich Lernkarten: vor dem AP im Browser einige Karten bewerten, nach dem AP ist der Fortschritt für dieselben Karten noch da.

**Übergabenotiz:**

### AP-5.3: Export und Import der gesamten Inhalte

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-5.1, AP-5.2 (wegen `admin.html`/`api.php` nicht parallel zu anderen APs, die diese Dateien ändern)

**Ziel & Kontext:**
Ersatz für das bisherige Datei-Backup: ein Export aller Inhalte als eine
JSON-Datei und ein Import derselben (`db-export`/`db-import`, Abschnitt 4.6).

**Betroffene Dateien:**
- `api.php` (ändern)
- `admin.html` (ändern: zwei Schaltflächen im Kopfbereich)
- `tests/api-content-test.ps1` (ändern: Abschnitt „Export/Import")

**Vorgehen:**
1. `GET ?f=db-export` (Admin-Token): `{exportedAt, questions: spBuildQuestions(),
   words: spBuildWords(), memory: spBuildMemory(), boards: spBuildList('ls-board'),
   mazes: spBuildList('lab-maze'), drafts: spBuildList('draft')}`, mit
   `Content-Disposition: attachment; filename="spiele-inhalte-<Ymd-Hi>.json"`.
2. `POST ?f=db-import` (Admin-Token): jeder vorhandene Abschnitt ersetzt seine
   Sammlungen vollständig; fehlende Abschnitte bleiben unberührt; alles in
   einer `spTx`; vor dem Ersetzen jede Eingabe mit den `spSplit…`-Funktionen
   prüfen (Fehler → 400, nichts geändert). Für `questions` Verlaufseinträge
   wie bei `q-import` (replace).
3. `admin.html`: „⬇ Gesamt-Export" (lädt die Datei per `fetch` mit Token und
   Blob-Download) und „⬆ Gesamt-Import" (Dateiauswahl, Rückfrage mit Auflistung
   der enthaltenen Abschnitte, danach Neuladen).

**Akzeptanzkriterien:**
- [ ] Export → sofortiger Import derselben Datei → `db-migrate.php verify alle` ist weiterhin `OK` bzw. ein zweiter Export ist (bis auf `exportedAt`) strukturell identisch zum ersten.
- [ ] Import einer Datei, die nur `memory` enthält, verändert Fragen nicht (gleiche `rev`-Werte in `GET ?f=questions&meta=1`).
- [ ] Import einer fehlerhaften Datei (doppelte Frage-ID) → 400, Bestand unverändert.
- [ ] Beide Endpunkte ohne Token → 403.
- [ ] Datei-Map aktualisiert.

**Tests:**
- `tests/api-content-test.ps1`, Abschnitt „Export/Import", je Akzeptanzkriterium ein Fall.
- Klickpfad in `admin.html`: Export, Datei öffnen (gültiges JSON mit sechs Abschnitten), Import derselben Datei.

**Übergabenotiz:**

### AP-5.4: Alte Wege stilllegen

**Status:** ☐ offen
**Umfang:** S
**Modell:** opus (sicherheitsrelevant: Zugriffsregeln)
**Abhängigkeiten:** AP-5.3

**Ziel & Kontext:**
Nach den Phasen 2–4 liegen die alten JSON-Dateien noch lesbar unter `data/`.
Sie sollen als Sicherung bleiben, aber nicht mehr per HTTP abrufbar sein
(sie veralten und würden sonst unbemerkt weiterverwendet).

**Betroffene Dateien:**
- `.htaccess` (ändern)
- `api.php` (ändern: Kopfkommentar, tote Reste)
- `db-migrate.php` (ändern: neue Aktion `archiv`)

**Vorgehen:**
1. `.htaccess`: die bestehende Deny-`RewriteRule` um
   `data/questions\.json`, `data/memory/pairs\.json`,
   `data/just-one/wordlists\.json`, `data/leiterspiel-designer/`,
   `data/labyrinth-designer/`, `data/_archiv/` erweitern; den Kommentar
   darüber anpassen (der Hinweis auf „absichtlich lesbar" und auf
   `data/quizpfad-fragen.json` entfällt). `data/images/` und
   `data/escape-room/` bleiben lesbar.
2. `db-migrate.php archiv`: verschiebt die migrierten Quelldateien (und ihre
   `.bak*`-Geschwister) nach `data/_archiv/<Ymd-His>/`, **nur** wenn
   `verify alle` unmittelbar davor `OK` liefert; per HTTP und CLI erlaubt.
3. `api.php`: Kopfkommentar aktualisieren; per Grep sicherstellen, dass kein
   Codepfad mehr die migrierten Dateien liest oder schreibt
   (`questions.json`, `pairs.json`, `wordlists.json`, `boards.json`,
   `mazes.json`, `drafts.json`).
4. Im gesamten Repo (ohne `docs/`, `backups/`, `dist/`, `_templates/`) nach
   den entfernten `localStorage`-Schlüsseln und Dateipfaden suchen und
   Fundstellen in der Übergabenotiz auflisten; Reste in Vorlagen
   (`_templates/spielverwaltung/`) und im Lade-Beispiel von `CLAUDE.md`
   werden in AP-5.doc korrigiert, nicht hier.

**Akzeptanzkriterien:**
- [ ] `curl -s -o NUL -w "%{http_code}"` auf `data/questions.json`, `data/memory/pairs.json`, `data/just-one/wordlists.json`, `data/leiterspiel-designer/boards.json`, `data/labyrinth-designer/mazes.json` liefert je `403`; ein Bild unter `data/images/` weiterhin `200`.
- [ ] `grep -n "questions.json\|pairs.json\|wordlists.json\|boards.json\|mazes.json\|drafts.json" api.php` liefert höchstens Kommentare.
- [ ] `db-migrate.php archiv` verschiebt die Dateien auf der Testinstanz und alle Spiele funktionieren danach weiter.
- [ ] Datei-Map aktualisiert.

**Tests:**
- Die curl-Aufrufe aus den Akzeptanzkriterien.
- Nach `archiv`: `admin.html`, `quizpfad/index.html`, `memory/index.html`, `just-one/index.html`, `Leiterspiel-quiz/designer.html`, `Labyrint-Quiz/designer.html` laden ihre Inhalte.
- SSE-Probe (Regel in `.htaccess` nicht beschädigt): in `quizpfad/` ein Spiel erstellen und `quizpfad/view.html?code=…` öffnen – die Schüleransicht aktualisiert sich bei einem Zug.

**Übergabenotiz:**

### AP-5.5: Anleitung für die Live-Umstellung

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-5.4

**Ziel & Kontext:**
Der Betreiber stellt den Live-Server selbst um (kein SSH, Upload per ZIP).
Er braucht eine Schritt-für-Schritt-Anleitung in einfacher Sprache.

**Betroffene Dateien:**
- `docs/datenbank-umstellung.md` (neu)
- `docs/README.md` (ändern: Verweis)

**Vorgehen:**
Die Anleitung enthält in dieser Reihenfolge, jeweils mit dem erwarteten Ergebnis:
1. Vorher: Sicherung des Ordners `data/` vom Server herunterladen.
2. Im Hosting-Panel eine Datenbank anlegen; Name, Benutzer, Passwort notieren.
3. `db-config.example.php` als `data/db-config.php` auf den Server legen und ausfüllen.
4. ZIP hochladen (enthält keinen `data`-Ordner).
5. Im Browser `…/db-migrate.php?aktion=import&sammlungen=alle&key=<Admin-Token>` aufrufen; erwartete Ausgabe je Gruppe `OK`.
6. Prüfliste: Frageneditor zeigt die bekannten Kategorien; ein Quiz-Spiel starten; Memory öffnen; Just-One-Begriffe; beide Designer; einen Test-Vorschlag einreichen und ablehnen.
7. Erst danach `…/db-migrate.php?aktion=archiv&sammlungen=alle&key=…`.
8. Sofort einen „Gesamt-Export" ziehen und aufbewahren; Empfehlung zur Regelmäßigkeit.
9. Rückweg, falls etwas nicht stimmt: vorherige Programmversion (Git-Tag `vor-datenbank`) hochladen, Dateien aus `data/_archiv/…` an ihren Ort zurückkopieren.
10. Hinweis: Alle offenen Editor-Tabs nach der Umstellung neu laden.

**Akzeptanzkriterien:**
- [ ] Jeder Schritt nennt die genaue URL bzw. Datei und das erwartete Ergebnis.
- [ ] Die Anleitung wurde einmal vollständig auf einer frischen Kopie durchgespielt: zweiter Zielordner `spiele-test2\` auf dem Testserver mit unmigrierten Daten, leere `sp_`-Tabellen (vorher `DELETE FROM sp_items; DELETE FROM sp_history;`), Schritte 3–8 befolgt, Ergebnis wie beschrieben.
- [ ] Das Admin-Token steht nicht im Klartext in der Anleitung (Platzhalter).

**Tests:**
- Der Durchlauf aus dem zweiten Akzeptanzkriterium; Abweichungen zwischen Anleitung und Verhalten korrigieren (in der Anleitung, nicht im Code – Codefehler als ✗ melden).
- Danach die Testdatenbank wieder aus `spiele-test\` befüllen (`import-force alle`) und `spiele-test2\` löschen.

**Übergabenotiz:**

### AP-5.6: Abschluss-Integrationstest und Merge nach `main`

**Status:** ☐ offen
**Umfang:** S
**Modell:** sonnet
**Abhängigkeiten:** AP-5.5, AP-5.rev, AP-5.doc (wird als allerletztes AP ausgeführt)

**Ziel & Kontext:**
Gesamtnachweis und Übergabe an den Betreiber. Erst hier gelangt der
Datenbank-Code nach `main` und in ein ZIP.

**Betroffene Dateien:**
- keine Quelltextänderungen (nur Git und Abschnitte 8/9 dieses Plans)

**Vorgehen:**
1. Gesamttest auf dem Testserver: alle Skripte unter `tests/` grün;
   `verify` nicht mehr möglich nach `archiv` – stattdessen Export ziehen und
   Zahlen (Kategorien, Fragen, Paare, Bretter, Labyrinthe) mit den
   Übergabenotizen aus AP-1.3 vergleichen.
2. Regressionscheck aller Phasen-Endzustände aus Abschnitt 6, je ein
   Klickpfad pro Phase.
3. Live-Spiel-Regression (Nicht-Ziel darf nicht beschädigt sein): je ein
   Spiel in Risiko-Quiz, QuizPfad, Just One und Codenames erstellen, mit
   einem zweiten Browserfenster beitreten, einen Zug/eine Runde spielen.
4. Auf `main` den Tag `vor-datenbank` setzen und pushen.
5. `datenbank` nach `main` mergen (kein Squash), pushen.
6. ZIP erzeugen: `powershell -ExecutionPolicy Bypass -File "<Projektordner>\create-zip.ps1"`
   und in der Übergabenotiz ausdrücklich vermerken, dass ein ZIP erstellt
   wurde und dass es **erst nach** den Schritten 1–3 der Anleitung
   `docs/datenbank-umstellung.md` hochgeladen werden darf.

**Akzeptanzkriterien:**
- [ ] Alle Tests und Klickpfade aus Schritt 1–3 bestanden und im Testprotokoll eingetragen.
- [ ] Tag `vor-datenbank` existiert auf dem Remote; `main` enthält den Merge.
- [ ] `backups/Spiele.zip` wurde neu erzeugt und enthält weder `data/` noch `db-config.php`.
- [ ] Die Live-Umstellung selbst wurde NICHT ausgeführt (bleibt beim Betreiber).

**Tests:**
- wie Vorgehen; ZIP-Inhalt per `tar -tf backups/Spiele.zip` prüfen.

**Übergabenotiz:**

### AP-5.rev: Unabhängiges Review Phase 5

**Status:** ☐ offen
**Umfang:** M
**Modell:** opus
**Abhängigkeiten:** AP-5.1 … AP-5.5

**Ziel & Kontext:**
Abschließende unabhängige Prüfung, nur lesend, mit Blick auf das Gesamtvorhaben.

**Vorgehen:**
1. Jedes AP der Phase gegen seine Akzeptanzkriterien prüfen.
2. Projektziel (Abschnitt 1) und alle Nicht-Ziele (Abschnitt 2) gegen den Stand des Branches `datenbank` prüfen (`git diff main...datenbank --stat` als Überblick: keine Änderungen in `escape-room/`, `stadt-land-fluss/`, `codenames/`, an Spielstand-Endpunkten).
3. Qualitäts-Check gesamt: jede Schreibroute mit Token (außer `POST ?f=drafts`); alle SQL-Zugriffe als Prepared Statements; `.htaccess`-Regeln sperren nicht versehentlich `data/images/`; keine Zugangsdaten und kein DB-Passwort im Repo; keine verbliebenen Lese-/Schreibzugriffe auf die stillgelegten `localStorage`-Schlüssel (`rq_questions`, `rq_drafts`, `jo_wordlists`, `ls_custom_boards`, `lab_maze_library`, `memory_pairs`).
4. Anleitung `docs/datenbank-umstellung.md` auf Vollständigkeit und Verständlichkeit prüfen.
5. Bericht in die Übergabenotiz.

**Akzeptanzkriterien:**
- [ ] Jedes Implementierungs-AP wurde geprüft; Befunde mit Schweregrad, Datei, Fundstelle dokumentiert.
- [ ] Keine Datei wurde verändert.

**Tests:**
- entfällt.

**Übergabenotiz:**

### AP-5.doc: Abschlussdokumentation

**Status:** ☐ offen
**Umfang:** M
**Modell:** sonnet
**Abhängigkeiten:** AP-5.rev

**Ziel & Kontext:**
Gesamte Doku auf den Endstand bringen, damit das Projekt ohne diesen Plan
erweiterbar bleibt.

**Betroffene Dateien:**
- `CLAUDE.md` (ändern: Projektübersicht um `db.php`, `content.php`, `db-migrate.php`, `db-schema.sql`, `tests/`, `tools/` ergänzen; Abschnitt „Laden der Fragendatenbank (Standard-Pattern)" auf den einstufigen Abruf mit Fehlermeldung umschreiben; Tabelle „Spiele mit eigener Datenbank"; Hinweis „nur Datenbank, kein `file://` für Inhalte")
- `docs/architektur.md` (ändern: Datenhaltung Inhalte vs. Spielstände, Sicherheitsmodell, Deployment-Schritte inkl. Datenbank)
- `docs/api-referenz.md`, `docs/datenformate.md`, `docs/entwicklung.md` (ändern: Endstand; in `entwicklung.md` §4 Checkliste „neues Spiel" und §6 Restrisiken anpassen)
- `docs/datenbank.md` (ändern: Export/Import, Archiv, bekannte Einschränkungen: Verlauf nur für Fragen, kein Offline-Betrieb)
- `_templates/spielverwaltung/` und `_templates/README.md` (ändern: Vorlagen-Code zum Laden der Fragen auf den einstufigen Abruf umstellen)
- `.htaccess` (nur Kommentar, falls AP-5.4 etwas übersehen hat)
- Datei-Map

**Vorgehen:**
1. Alle Übergabenotizen der Phase und die in AP-5.4 gelisteten Fundstellen durchgehen.
2. Dokumente nachziehen; in `docs/datenbank.md` einen Abschnitt „Neue Inhaltsart hinzufügen" (Sammlung definieren, `spSplit…`/`spBuild…`, Endpunkte, Editor-Muster mit Konfliktdialog) ergänzen.
3. Datei-Map gegen den Dateibestand abgleichen.
4. Phasen-Branch nach `datenbank` mergen und pushen (der Merge nach `main` folgt in AP-5.6).

**Akzeptanzkriterien:**
- [ ] `grep -rn "data/questions.json" CLAUDE.md docs _templates` liefert nur noch Stellen, die den Archiv-/Altzustand ausdrücklich als solchen beschreiben.
- [ ] `docs/datenbank.md` enthält den Abschnitt „Neue Inhaltsart hinzufügen".
- [ ] Jede im Vorhaben neue oder wesentlich geänderte Datei hat einen aktuellen Eintrag in der Datei-Map.
- [ ] Kein Verweis in der Doku zeigt auf nicht existierende Dateien/Funktionen.

**Tests:**
- Stichprobe: drei zufällige Einträge der Datei-Map und zwei Code-Beispiele aus `CLAUDE.md` gegen den echten Code prüfen.

**Übergabenotiz:**

## 8. Status

Legende: ☐ offen · ◐ in Arbeit · ☑ erledigt · ✗ blockiert

| AP | Titel | Modell | Status | Abhängig von | Notiz |
|---|---|---|---|---|---|
| AP-1.1 | Branches, Testserver, DB-Verbindung | sonnet | ☐ | – | |
| AP-1.2 | Schema und Item-Schicht | opus | ☐ | AP-1.1 | |
| AP-1.3 | Abbildung JSON ↔ Items | opus | ☐ | AP-1.2 | |
| AP-1.4 | Migrationswerkzeug | sonnet | ☐ | AP-1.3 | |
| AP-1.rev | Review Phase 1 | opus | ☐ | AP-1.1–1.4 | |
| AP-1.doc | Doku Phase 1 | sonnet | ☐ | AP-1.rev | |
| AP-2.1 | Fragen-Endpunkte | opus | ☐ | AP-1.doc | |
| AP-2.2 | Import, Verlauf, Wiederherstellen (Server) | opus | ☐ | AP-2.1 | |
| AP-2.3 | StorageManager umstellen | sonnet | ☐ | AP-2.2 | |
| AP-2.4 | Frageneditor `admin.html` | opus | ☐ | AP-2.3 | |
| AP-2.5 | Zweiter Frageneditor (Risiko-Quiz) | sonnet | ☐ | AP-2.3 | parallel zu AP-2.4 |
| AP-2.6 | Änderungsverlauf (Oberfläche) | sonnet | ☐ | AP-2.4 | |
| AP-2.7 | Suche und Filter | sonnet | ☐ | AP-2.6 | |
| AP-2.8 | Integrationstest Phase 2 | sonnet | ☐ | AP-2.5, AP-2.7 | |
| AP-2.rev | Review Phase 2 | opus | ☐ | AP-2.1–2.8 | |
| AP-2.doc | Doku Phase 2 | sonnet | ☐ | AP-2.rev | |
| AP-3.1 | Vorschlags-Endpunkte | opus | ☐ | AP-2.doc | |
| AP-3.2 | Schülerseite Vorschläge | sonnet | ☐ | AP-3.1 | parallel zu AP-3.3 |
| AP-3.3 | Vorschläge im Editor | sonnet | ☐ | AP-3.1 | |
| AP-3.rev | Review Phase 3 | opus | ☐ | AP-3.1–3.3 | |
| AP-3.doc | Doku Phase 3 | sonnet | ☐ | AP-3.rev | |
| AP-4.1 | Begriffslisten-Endpunkte | sonnet | ☐ | AP-3.doc | |
| AP-4.2 | Begriffs-Editor | sonnet | ☐ | AP-4.1 | |
| AP-4.3 | Designer-Endpunkte, Bild-Auslagerung | sonnet | ☐ | AP-4.1 | |
| AP-4.4 | Leiterspiel-Designer und -Spiel | sonnet | ☐ | AP-4.3 | parallel zu AP-4.5 |
| AP-4.5 | Labyrinth-Designer und -Spiel | sonnet | ☐ | AP-4.3 | |
| AP-4.6 | Memory-Endpunkte | sonnet | ☐ | AP-4.3 | |
| AP-4.7 | Memory-Editor | sonnet | ☐ | AP-4.6 | |
| AP-4.rev | Review Phase 4 | opus | ☐ | AP-4.1–4.7 | |
| AP-4.doc | Doku Phase 4 | sonnet | ☐ | AP-4.rev | |
| AP-5.1 | Ausweichwege: QuizPfad, Leiterspiel | sonnet | ☐ | AP-4.doc | parallel zu AP-5.2 |
| AP-5.2 | Ausweichwege: Labyrinth, Schiffe, Lernkarten | sonnet | ☐ | AP-4.doc | |
| AP-5.3 | Export und Import | sonnet | ☐ | AP-5.1, AP-5.2 | |
| AP-5.4 | Alte Wege stilllegen | opus | ☐ | AP-5.3 | |
| AP-5.5 | Anleitung Live-Umstellung | sonnet | ☐ | AP-5.4 | |
| AP-5.rev | Review Phase 5 | opus | ☐ | AP-5.1–5.5 | |
| AP-5.doc | Abschlussdokumentation | sonnet | ☐ | AP-5.rev | |
| AP-5.6 | Abschlusstest und Merge nach `main` | sonnet | ☐ | AP-5.5, AP-5.rev, AP-5.doc | allerletztes AP |

## 9. Testprotokoll

Ein Eintrag pro abgeschlossenem AP und pro Phasenabschluss.

| Datum | AP / Phase | Getestet | Ergebnis | Getestet von |
|---|---|---|---|---|
| | | | | |

## 10. Dokumentation

- **Projektdokumentation:** bestehende Struktur unter `docs/` (Einstieg
  `docs/README.md`) plus die Kurzreferenz `CLAUDE.md`. Es wird keine
  `DOKUMENTATION.md` angelegt. Neu in diesem Vorhaben: `docs/datenbank.md`
  und `docs/datenbank-umstellung.md`. Aktualisierung je Phase im `AP-<N>.doc`.
- **Datei-Map:** liegt außerhalb des Repos im Memory-Ordner der KI:
  `C:\Users\mtnhu\.claude\projects\C--Users-mtnhu-OneDrive---Bildungsdirektion--Unterricht-Programme-Spiele\memory\reference_file_map.md`.
  Sie wird von jedem AP gepflegt, das Dateien anlegt oder wesentlich ändert.
  Zeilennummern darin veralten schnell – Funktionsnamen eintragen, Zeilen nur als Näherung.
