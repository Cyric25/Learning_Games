# API-Referenz

Zwei PHP-Dateien bilden das Backend: `api.php` (alle Spiele außer Codenames) und
`codenames/api.php` (nur Codenames). Beide sind zustandslos; der Zustand liegt in
JSON-Dateien unter `data/`.

## 1. `api.php` — Query-Parameter `?f=<endpoint>`

Die Multi-Game-Spiele nutzen dasselbe Endpunkt-Trio mit einem Prefix. Die
Prefix→Verzeichnis-Zuordnung steht in `api.php` im Array `$gameDirs`:

| Prefix | Spiel | Verzeichnis |
|--------|-------|-------------|
| (keiner) | Risiko-Quiz | `data/games/risiko-quiz/` |
| `ls-` | Leiterspiel | `data/games/leiterspiel/` |
| `bs-` | Schiffeversenken | `schiffeversenken/data/games/` |
| `labyrinth-` | Labyrinth | `data/games/labyrinth/` |
| `qp-` | QuizPfad | `data/games/quizpfad/` |
| `jo-` | Just One | `data/games/just-one/` |
| `in-` | Insider | `data/games/insider/` |
| `hs-` | Hochstapler | `data/games/hochstapler/` |

**Viewer-gefilterte Spiele** (`jo-`/`in-`/`hs-`): GET-, SSE- und
409-Antworten laufen durch eine Filterfunktion pro Betrachter
(`?playerId=…`, Lehrkraft ohne `playerId` sieht alles, Tafel sendet den
Sentinel `'*'`) — Zuordnung in `$gameFilters`. Für `in-`/`hs-` stellt
`protectSecretRoundFields()` beim POST zusätzlich die viewer-gefilterten
Geheimfelder (`secretWord`, `insiderId` bzw. `impostorIds`; Zuordnung in
`$gameProtectedFields`) aus dem gespeicherten Stand wieder her, solange die
`currentRound.num` übereinstimmt — sonst würde die Stimmabgabe eines
gefilterten Clients die Geheimnisse der laufenden Runde löschen (analog zum
`takenTeams`-Merge, s. u.).

### Pro-Spiel-Endpunkte

| Endpunkt | Methode | Zweck | Admin-Token? |
|----------|---------|-------|:---:|
| `?f=<prefix>sse&code=XXXX` | GET | SSE-Stream des Spielstands | – |
| `?f=<prefix>games` | GET | Registry laden (löst 24h-Cleanup aus) | – |
| `?f=<prefix>games` | POST | Registry komplett überschreiben (Snapshot) | ✔ |
| `?f=<prefix>game&code=XXXX` | GET | Spielstand laden | – |
| `?f=<prefix>game&code=XXXX` | POST | Spielstand speichern (CAS-fähig, s. u.) | – |
| `?f=<prefix>game&code=XXXX` | DELETE | Spiel + Registry-Eintrag löschen | ✔ |

`code` muss `^[A-Z0-9]{4,6}$` erfüllen (`requireValidCode`), sonst 400. Ein POST
auf `game` aktualisiert automatisch den Registry-Eintrag (Titel, Status,
Zeitstempel).

### Zentrale Ressourcen

| Endpunkt | Methode | Zweck | Admin-Token? |
|----------|---------|-------|:---:|
| `?f=questions` | GET | zentrale Fragendatenbank laden | – |
| `?f=questions` | POST | Fragendatenbank speichern (+ 3 Backup-Generationen) | ✔ |
| `?f=gamestate` | GET/POST | Legacy-Einzelspielstand (Migration) | POST: ✔ |
| `?f=memory-pairs` | GET/POST | Memory-Paare (`data/memory/pairs.json`) | – |
| `?f=settings` | GET/POST | diverse Einstellungen | – |
| `?f=drafts` | GET | eingereichte Vorschläge laden | – |
| `?f=drafts` | POST | Vorschlag einreichen (whitelistet + Limits) | – |
| `?f=draft&id=X` | DELETE | Vorschlag löschen | ✔ |
| `?f=er-library` | GET | alle Escape-Room-Spiele (`data/escape-room/game_*.json`) | – |
| `?f=er-game&id=game_N` | GET | einzelnes Escape-Room-Spiel | – |
| `?f=er-game&id=game_N` | POST/DELETE | Escape-Room-Spiel speichern/löschen | ✔ |
| `?f=ls-boards` | GET/POST | Leiterspiel-Designer-Bretter | POST: ✔ |
| `?f=lab-mazes` | GET/POST | Labyrinth-Designer-Labyrinthe | POST: ✔ |

**Drafts-Härtung:** `?f=drafts` POST akzeptiert nur ein Whitelist-Schema (Typ
`mc`/`open`, Difficulty aus `{100..500}`, gekürzte Strings), begrenzt die
Payload-Größe (~20 KB) und die Gesamtzahl (500, älteste fliegen raus). So kann
ein Schüler-Skript den Editor nicht per Flooding oder XSS kompromittieren.

## 2. Nebenläufigkeit: `_rev` / `_baseRev` / 409 <a id="nebenlaeufigkeit"></a>

Der `?f=<prefix>game`-POST implementiert optimistische Nebenläufigkeitskontrolle
(Compare-and-Swap):

- Jeder gespeicherte Spielstand trägt ein **server-verwaltetes `_rev`** (Zähler,
  bei jedem Write +1).
- **POST ohne `_baseRev`** → direkter Force-Write (autoritative Schreiber,
  Legacy-Clients). Voll rückwärtskompatibel.
- **POST mit `_baseRev`** → der Server prüft unter `flock`, ob `_baseRev` noch dem
  gespeicherten `_rev` entspricht. Bei Abweichung → **HTTP 409** und der aktuelle
  Stand im Body (plus Header `X-Current-Rev`). Der Client merged neu und versucht
  es erneut.
- Erfolgsantwort: `{"ok":true,"rev":<neu>}`.

**`takenTeams`-Merge:** Enthält ein eingehender POST **kein** Feld `takenTeams`,
der gespeicherte Stand aber eines, kopiert der Server das gespeicherte
`takenTeams` in den neuen Stand. So bleibt die Belegt-Liste erhalten, obwohl
Plain-Saves (Spielzüge) sie nicht mitsenden.

### Client-Seite: `mutate(code, fn)`

Der wiederkehrende Helfer in jedem Storage-Objekt:

```js
async mutate(code, fn, tries = 6) {
  let state = await this.load(code);            // frisch laden (mit _rev)
  for (let i = 0; i < tries; i++) {
    const draft = deepCopy(state);
    if (fn(draft) === false) return null;        // fn darf abbrechen
    const payload = { ...serialize(draft), _baseRev: state._rev || 0 };
    const r = await fetch(url, { method:'POST', body: JSON.stringify(payload) });
    if (r.status === 409) { state = deser(await r.json()); continue; } // neu mergen
    if (r.ok) { const j = await r.json(); draft._rev = j.rev; return draft; }
    return null;
  }
  return null; // zu viele Konflikte
}
```

Verwendet für: Team-Beitritt (`selectTeam`), Kick (`kickTeam`) in allen
`takenTeams`-Spielen; im Risiko-Quiz zusätzlich für die Schüleraktionen
„Ich weiß es!" / Zellen-Auswahl / „Weiß nicht" (`StorageManager.mutate(fn)` —
dort ohne `code`-Argument, weil der Code im `StorageManager` gehalten wird).

**Regel:** Rundenbasierte Spielzüge (Antwort auswerten, Figur bewegen) bleiben
Force-Write — sie haben zu jedem Zeitpunkt genau einen Schreiber. Nur wirklich
umkämpfte Pfade nutzen `mutate`.

## 3. Admin-Token

```
Header:  X-Admin-Key: LP-Spiele-2026
```

Serverseitig als Konstante `ADMIN_KEY` (`api.php`) bzw. `CN_ADMIN_KEY`
(`codenames/api.php`) definiert und per `hash_equals` geprüft (`requireAdminKey`).
Fehlt/falsch → **HTTP 403**. Der Preflight-Header
`Access-Control-Allow-Headers: Content-Type, X-Admin-Key` ist gesetzt.

**Token ändern:** An **einer** Stelle im Server (`define('ADMIN_KEY', …)` in
`api.php` und `define('CN_ADMIN_KEY', …)` in `codenames/api.php`) UND an allen
Client-Sendern. Fundstellen mit `grep -rn "LP-Spiele-2026"` (Stand: Sender in
`risiko-quiz/js/shared.js`, `admin.html`, `schiffeversenken/js/shared.js`,
`quizpfad/js/quizpfad.js`, `Leiterspiel-quiz/js/leiterspiel.js`,
`Labyrint-Quiz/js/labyrinth.js`, den beiden Designer-HTMLs, den beiden
Escape-Room-HTMLs, `codenames/game.js`, `codenames/admin.html`).

## 4. `codenames/api.php` — Query-Parameter `?action=<action>`

Rein action-basiert, POST mit JSON-Body (außer GET-Aktionen). Der Server ist
voll autoritativ; der Client pollt `get_state` alle 1,5 s.

| Action | Methode | Zweck | Admin-Token? |
|--------|---------|-------|:---:|
| `create_game` | POST | Neues Spiel, exklusive PIN-Vergabe (`fopen x`) | – |
| `join_game` | POST | Beitreten/Reconnect (Spieler-ID) | – |
| `select_role` | POST | Team + Rolle (spymaster/operative/spectator) wählen | – |
| `get_state` | GET | Spielstand (spymaster-gefiltert) + `server_now` | – |
| `update_settings` | POST | Teamnamen/Wortliste im Lobby ändern | – |
| `start_game` | POST | 25 Karten mischen und zuteilen | – |
| `submit_clue` | POST | Hinweis geben (nur aktiver Spymaster) | – |
| `guess_card` | POST | Karte aufdecken (Rate-Limit 1/s) | – |
| `end_turn` | POST | Zug beenden | – |
| `heartbeat` | POST | `last_seen` aktualisieren | – |
| `reset_game` | POST | Zurück in die Lobby | – |
| `get_wordlists` / `get_wordlist` | GET | Wortlisten laden | – |
| `save_wordlist` / `delete_wordlist` | POST | Wortliste speichern/löschen | ✔ |

**Nebenläufigkeit:** Alle zustandsändernden Actions laufen unter einem
exklusiven `flock` pro PIN (`lockGame`) über den kompletten
Read-Modify-Write-Zyklus — sonst könnte z. B. ein `heartbeat` einen parallelen
`guess_card` überschreiben. Schlägt der Lock fehl → HTTP 500 (kein ungeschütztes
Weiterlaufen). PIN-Validierung: `requirePin` (`^[A-Z0-9]{4,6}$`), Wortlisten-IDs:
`sanWordlistId` (nur `[A-Za-z0-9_-]`) — Schutz gegen Path Traversal.

`get_state` filtert für Nicht-Spymaster die Team-Zugehörigkeit unaufgedeckter
Karten heraus (`filterState`) und liefert `server_now` mit, damit die
Online-Anzeige nicht von abweichenden Client-Uhren abhängt.

## 5. `.htaccess`

```apache
Options -Indexes
<IfModule mod_rewrite.c>
RewriteEngine On
# SSE: Kompression/Buffering aus (alle Spiel-Prefixe)
RewriteCond %{QUERY_STRING} (^|&)f=(ls-|bs-|qp-|labyrinth-|jo-|in-|hs-)?sse(&|$)
RewriteRule ^api\.php$ - [E=no-gzip:1,E=dont-vary:1]
# Spielstände/Drafts nur über api.php erreichbar
RewriteRule ^(data/games/|schiffeversenken/data/games/|data/drafts\.json|data/risiko-gamestate\.json) - [F]
</IfModule>
```

Der SSE-`RewriteCond` prüft den Query-String (`SetEnvIf Request_URI` sieht ihn
nicht). Die Deny-Regel sperrt Spielstände und Drafts; **`data/questions.json`,
`data/memory/pairs.json`, die Designer-Bibliotheken und `data/escape-room/`
bleiben absichtlich lesbar** (statischer Client-Fallback). Neue statische
Fallback-Pfade vor dem Ergänzen einer Deny-Regel gegenprüfen:
`grep -rn "fetch('../data/"`.

## 6. Fehlercodes

| Code | Bedeutung |
|------|-----------|
| 400 | Ungültiger Code/PIN/ID oder ungültiges JSON |
| 403 | Admin-Token fehlt/falsch |
| 409 | CAS-Konflikt (`_baseRev` veraltet) — Body enthält aktuellen Stand |
| 413 | Draft-Payload zu groß |
| 500 | Schreib- oder Lock-Fehler |
