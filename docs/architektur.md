# Architektur

## 1. Grundprinzipien

- **Kein Build-System.** Jede Seite ist reines HTML/CSS/JS, das direkt im
  Browser läuft. Es gibt keinen Transpiler, Bundler oder Paketmanager. Änderungen
  wirken sofort nach dem Neuladen.
- **Kein Framework.** Reines DOM (`document.getElementById`, `innerHTML`,
  `addEventListener`). Zustand liegt in globalen Variablen bzw. IIFE-Closures.
- **Server optional.** Alles funktioniert grundsätzlich per `localStorage`. Der
  PHP-Server (`api.php`) fügt Multi-Device-Sync hinzu. Jedes Spiel erkennt
  `file://` und schaltet Server-Zugriffe automatisch ab.
- **Progressive Verschlechterung.** Ist der Server nicht erreichbar, fällt jedes
  Spiel auf `localStorage` zurück, ohne zu brechen.

## 2. Verzeichnisstruktur

```
Spiele/
  spiele.html              Startseite / Spielauswahl
  admin.html               Zentraler Frageneditor (data/questions.json)
  vorschlaege.html         Schüler reichen Fragen-Vorschläge ein
  api.php                  Zentrale PHP-API (Multi-Game, SSE, Drafts, Escape-Room)
  .htaccess                Apache-Konfiguration
  create-zip.ps1           Backup-/Deploy-Skript (+ create-zip-game/-memory.ps1)
  CLAUDE.md                Verbindliche Kurzreferenz (Styling, Muster)
  categories.json          Stadt-Land-Fluss Legacy-Kategorien

  data/                    NICHT im Deploy-ZIP (Laufzeitdaten)
    questions.json         ZENTRALE Fragendatenbank (alle Quiz-Spiele)
    questions.json.bak[2/3] Rotierende Backups (Server-seitig)
    drafts.json            Eingereichte Fragen-Vorschläge
    settings.json          Diverse Einstellungen
    memory/pairs.json      Memory-Paare
    escape-room/game_*.json Escape-Room-Spiele (Server-Sync)
    leiterspiel-designer/boards.json  Gespeicherte Custom-Bretter
    labyrinth-designer/mazes.json     Gespeicherte Custom-Labyrinthe
    games/
      risiko-quiz/  <CODE>.json + index.json (+ .lock)
      leiterspiel/  <CODE>.json + index.json (+ .lock)
      labyrinth/    <CODE>.json + index.json (+ .lock)
      quizpfad/     <CODE>.json + index.json (+ .lock)
      codenames/    <PIN>.json + index.json (+ .lock)
  schiffeversenken/data/games/  <CODE>.json + index.json (+ .lock)

  <spiel>/                 Ein Ordner pro Spiel (siehe docs/spiele/)
  _templates/              Copy-Paste-Vorlagen für neue Spiele (Spielverwaltung)
  dist/                    Pro-Spiel-ZIPs (Ausgabe von create-zip)
  backups/                 Spiele.zip (Upload-Delta) + FULL/ (Voll-Archive)
```

**Wichtig:** Die Spielstand-Verzeichnisse liegen bis auf Schiffeversenken alle
unter `data/games/<spiel>/`. Schiffeversenken nutzt aus historischen Gründen
`schiffeversenken/data/games/`. Die maßgebliche Zuordnung steht in `api.php` im
Array `$gameDirs`.

## 3. Seitentypen pro Multi-Device-Spiel

Die fünf server-synchronisierten Quiz-Spiele folgen demselben Rollenschema:

| Datei | Rolle | Beschreibung |
|-------|-------|--------------|
| `index.html` | **Lehrergerät** (autoritativ) | Spielwähler, Setup, Spielbrett, Fragen-Auflösung. Erzeugt den Code. |
| `view.html` (bzw. `play.html` beim Labyrinth) | **Schülergerät** | Beitritt per Code, Team wählen, mitspielen |
| `board.html` | **Tafelansicht** (Beamer) | reine Anzeige, kein Eingriff (nicht bei allen Spielen) |
| `solo.html` | **Einzelspieler** | rein lokal, kein Server, kein Sync (bei mehreren Spielen) |
| `admin.html` | **Verweis** | zeigt nur Info-Karte + Link auf die zentrale `../admin.html` |

Die Spiellogik liegt entweder in einer separaten `js/`-Datei (Risiko-Quiz,
Leiterspiel, QuizPfad, Labyrinth) oder inline in der HTML (Schiffeversenken,
Escape Room). Das Storage-Objekt (siehe unten) ist bei den Inline-Spielen in
jeder Seite dupliziert — Änderungen daran müssen in allen Kopien erfolgen.

## 4. Zentrale Fragendatenbank

Alle fragenbasierten Spiele lesen **eine** Datei: `data/questions.json`. Das
Format des Risiko-Quiz ist das Master-Format; jedes andere Spiel konvertiert
beim Laden mit einer eigenen `convertRQto…()`-Funktion in sein internes Format.

Ladepfad (Standard-Muster in jedem Spiel):
1. `fetch('../api.php?f=questions')` — bevorzugt (Server)
2. `fetch('../data/questions.json')` — statischer Fallback (bleibt bewusst per HTTP lesbar)
3. `localStorage['rq_questions']` — Offline-Fallback

Bearbeitet wird die Datenbank ausschließlich über die zentrale `admin.html`.
Die `admin.html` der einzelnen Spiele sind nur Verweise. Details zum Format:
[datenformate.md](datenformate.md).

## 5. Multi-Game <a id="multi-game"></a>

Damit mehrere Klassen parallel spielen können, trägt jedes Spiel einen
**4-stelligen Code** (z. B. `A3K7`, ohne verwechselbare Zeichen O/I/0/1).

- Das Lehrergerät erzeugt den Code beim Anlegen eines Spiels.
- Schüler öffnen `view.html?code=XXXX` oder tippen den Code im Spielwähler ein.
- Pro Code existiert eine Spielstand-Datei `<CODE>.json` und ein Eintrag in der
  `index.json`-Registry des Spiels.
- **Auto-Cleanup:** Spiele, die seit 24 h nicht aktualisiert wurden, werden bei
  jedem Registry-Abruf serverseitig gelöscht (`cleanupExpiredGames`).

Referenz-Implementierung und Copy-Paste-Vorlagen: `_templates/spielverwaltung/`
(siehe auch `CLAUDE.md → ## Spielverwaltung`).

## 6. Echtzeit-Synchronisation

### SSE mit Polling-Fallback

Jedes Storage-Objekt bietet `subscribe(code, callback)`. Ablauf:
1. Ist ein Server da, wird ein **Server-Sent-Events**-Stream geöffnet
   (`?f=<prefix>sse&code=XXXX`). Der Server hält die Verbindung bis zu 30 s
   offen und schickt bei jeder Dateiänderung den kompletten Spielstand.
2. Bricht SSE ab, wird auf **Polling** umgeschaltet (Intervall 1000 ms auf
   Lehrergeräten, 500 ms bei Schiffeversenken-Views). Nach mehreren Fehlern
   bzw. nach ~10 s wird erneut SSE versucht (kein dauerhaftes Polling).
3. Ohne Server (`file://`) läuft ein `localStorage`-Poll.

Der Callback wird nur bei **tatsächlicher Änderung** aufgerufen (JSON-Vergleich
mit dem letzten Stand) — sonst gäbe es Dauer-Re-Renders und flackernde
Eingabefelder/Timer.

### SSE-Details (Server, `api.php` → `sseStream`)

- Erkennt Änderungen zweistufig: pro Iteration billig `filemtime+filesize`,
  nur bei Abweichung zusätzlich `md5_file` (fängt mehrere Saves in derselben
  Sekunde bei gleicher Größe ab).
- Sendet alle 2 s einen Keepalive-Kommentar (`:ka`), damit
  `connection_aborted()` geschlossene Clients erkennt und den PHP-Worker
  freigibt — relevant bei 25+ gleichzeitigen Geräten einer Klasse.

## 7. Schreibmodell (wichtig!) <a id="schreibmodell"></a>

Das Sync-Modell ist **bewusst gemischt**:

- **Autoritative Schreiber** (Lehrergerät, rundenbasierte Spielzüge) schreiben
  den kompletten Spielstand direkt (Plain-Save, **ohne** `_baseRev`). Zu einem
  Zeitpunkt gibt es dafür genau einen legitimen Schreiber (wer gerade dran ist),
  daher ist Last-Write-Wins hier akzeptabel.
- **Umkämpfte Schreibpfade** (Team-Beitritt, Kick, „Ich weiß es!"-Meldung)
  laufen über **optimistische Nebenläufigkeitskontrolle** (`mutate()`-Helfer):
  Sie senden `_baseRev`; stimmt die Version nicht mehr, antwortet der Server mit
  **HTTP 409 + aktuellem Stand**, und der Client merged neu und wiederholt.

Das Feld `takenTeams` (belegte Teams) wird **server-seitig gemerged**: Plain-Saves
senden es nicht mit (Clients strippen es aus dem POST-Body, behalten es aber
lokal), nur `mutate()`-Aufrufe schreiben es. Dadurch kann ein veralteter
Spielzug-Snapshot keine frisch beigetretenen Teams „phantom-kicken".

Details und Protokoll: [api-referenz.md → Nebenläufigkeit](api-referenz.md#nebenlaeufigkeit).

### Storage-Objekte (Überblick)

| Spiel | Objekt | API-Prefix | localStorage-Prefix | Ort |
|-------|--------|-----------|---------------------|-----|
| Risiko-Quiz | `StorageManager` | (keiner) | `rq_` | `risiko-quiz/js/shared.js` |
| Leiterspiel | `LsStorage` | `ls-` | `ls_gs_` | inline in `leiterspiel.js` + `view.html` |
| QuizPfad | `QpStorage` | `qp-` | `qp_gs_` | inline in `quizpfad.js` + `view.html` + `board.html` |
| Labyrinth | `GameSync` | `labyrinth-` | `lab_` | inline in `play.js` + `labyrinth.js` + `board.html` |
| Schiffeversenken | `BsStorage` | `bs-` | `bs_gs_` | `schiffeversenken/js/shared.js` |
| Codenames | (eigenes `apiPost`) | action-basiert | — | `codenames/game.js` + `admin.html` |

Alle server-synchronisierten Objekte (außer Codenames) bieten dieselbe
Schnittstelle: `save`, `load`, `mutate`, `subscribe`, `loadGamesRegistry`,
`deleteGame`, `checkServer` (bzw. `hasServer`). Codenames ist rein
action-basiert (Server ist voll autoritativ) und pollt alle 1,5 s.

## 8. Sicherheitsmodell <a id="sicherheit"></a>

Kontext: Schulnetz, Schüler haben die Spielcodes und können die
Entwicklerkonsole öffnen. Das Modell ist pragmatisch, kein Hochsicherheitsdesign.

- **Admin-Token:** Destruktive Endpunkte (Fragendatenbank überschreiben, Spiele
  löschen, Wortlisten/Designer-Bibliotheken schreiben, Vorschläge löschen)
  verlangen den Header `X-Admin-Key: LP-Spiele-2026`. Das Token steht
  zwangsläufig im Quelltext der Lehrkraft-Seiten — es ist eine **Hürde gegen
  Copy-Paste-Vandalismus**, kein echtes Geheimnis. Schüler-Pfade (Spielzüge,
  Beitritt, Vorschläge *einreichen*) bleiben absichtlich offen.
- **XSS:** Alle Nutzertexte (Teamnamen, Fragen, Antworten) werden beim Rendern
  escaped. `color`/`emoji`/`symbolIcon` aus dem synchronisierten Zustand werden
  an der **Vertrauensgrenze** (Deserialisierung) auf sichere Werte geklemmt
  (`#rrggbb`-Regex bzw. kurze Emoji ohne Sonderzeichen), weil der Zustand von
  jedem mit dem Code beschreibbar ist.
- **Direktzugriff:** `.htaccess` sperrt HTTP-Zugriff auf `data/games/`,
  `schiffeversenken/data/games/` und `data/drafts.json` (sonst leakte z. B. das
  Codenames-Kartenlayout). `data/questions.json` bleibt lesbar (statischer
  Fallback der Clients).
- **Backups:** Vor dem Überschreiben von `questions.json`/`gamestate.json`
  rotiert der Server 3 Backup-Generationen (`.bak`, `.bak2`, `.bak3`).
- **Atomarität:** Alle Server-Writes erfolgen atomar (Temp-Datei + `rename`);
  Registry- und CAS-Writes zusätzlich unter `flock` auf einer `.lock`-Datei
  (die absichtlich nie gelöscht wird — sonst bräche die Lock-Semantik).

Bekannte, bewusst akzeptierte Grenzen: Escape-Room-Lösungen und -Codes liegen
clientseitig (localStorage/DOM) und sind mit Aufwand einsehbar; das Escape-Room-
Admin-Passwort (`LP@FOS`) steht im Quelltext. Für den Schulkontext akzeptiert.
Vollständige Liste: [entwicklung.md → Restrisiken](entwicklung.md#restrisiken).

## 9. Theming

Alle Seiten teilen den localStorage-Key `spiele_theme` (`'dark'`/`'light'`), damit
das Theme beim Navigieren erhalten bleibt. Zwei Muster:
- **Light-Standard** (SLF, Startseite, QuizPfad, Labyrinth, Leiterspiel,
  Lernkarten): Klasse `body.dark` überschreibt.
- **Dark-Standard** (Risiko-Quiz, Schiffeversenken, Memory): Klasse `body.light`
  überschreibt.

Escape Room hat ein eigenes System (`body.player-mode` / `body.admin-mode`),
Codenames ebenfalls unabhängig. Die vollständigen CSS-Variablen-Paletten stehen
in `CLAUDE.md → ## Styling-System`.

## 10. Deployment <a id="deployment"></a>

1. Voraussetzung: PHP-Webhosting mit Apache. `mod_rewrite` wird für die
   `.htaccess`-Regeln (SSE-Buffering, Zugriffssperren) empfohlen; fehlt es, läuft
   das Spiel trotzdem, aber SSE kann gepuffert werden (Clients fallen dann auf
   Polling zurück).
2. Gesamtes Verzeichnis hochladen. Das `data/`-Verzeichnis wird bei Bedarf
   automatisch angelegt (`mkdir`), muss aber beschreibbar sein.
3. Einstiegspunkt: `spiele.html`.
4. Für Updates das per `create-zip.ps1` erzeugte `backups/Spiele.zip` hochladen
   (enthält nur geänderte Dateien, **keine** Spieldaten — siehe
   [entwicklung.md](entwicklung.md#backup-und-deployment)).

Das produktive Hosting ist ein Shared-Host (z. B. All-Inkl). Die SSE-Dauer
(30 s) und die Worker-Freigabe per Keepalive sind darauf ausgelegt, den
begrenzten PHP-Prozesspool bei Klassenstärke nicht zu erschöpfen.
