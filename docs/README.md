# Projektdokumentation: Unterrichtsspiele

Interaktive Unterrichtsspiele für Klassenzimmer und digitale Tafel. Reines
HTML/CSS/JS + PHP, **kein Build-System, keine externen Abhängigkeiten** (außer
optional KaTeX/Pannellum lokal bzw. per CDN). Läuft auf jedem PHP-Webhosting
und – mit Einschränkungen – direkt per `file://`.

Diese Dokumentation ist der Einstiegspunkt für Weiterarbeit und Erweiterung.
`CLAUDE.md` im Repo-Root bleibt die verbindliche Kurzreferenz für KI-Assistenten
und enthält die Styling-Paletten und Copy-Paste-Muster im Detail.

## Dokument-Übersicht

| Dokument | Inhalt |
|----------|--------|
| [architektur.md](architektur.md) | Gesamtbild, Verzeichnisstruktur, Sync-Modell (SSE + Compare-and-Swap), Sicherheitsmodell, Hosting/Deployment |
| [api-referenz.md](api-referenz.md) | Alle `api.php`- und `codenames/api.php`-Endpunkte, das `_rev`/`_baseRev`/409-Protokoll, Admin-Token, `.htaccess` |
| [datenformate.md](datenformate.md) | `questions.json` (Master-Format), GameState-Felder, Memory-Paare, alle Markdown-Import-Formate |
| [entwicklung.md](entwicklung.md) | Konventionen, wiederkehrende Muster & Fallstricke, Tests, Checkliste „neues Spiel", offene Restrisiken |
| [spiele/](spiele/) | Ein Dokument pro Spiel (Screens, Dateien, Spielmechanik, Besonderheiten) |

## Die Spiele auf einen Blick

| Spiel | Ordner | Typ | Server-Sync | Fragen aus |
|-------|--------|-----|-------------|-----------|
| [Risiko-Quiz](spiele/risiko-quiz.md) | `risiko-quiz/` | Jeopardy-Brett, Multi-Device | Ja (SSE) | zentrale DB |
| [QuizPfad](spiele/quizpfad.md) | `quizpfad/` | lineares Brettspiel | Ja (SSE) | zentrale DB |
| [Leiterspiel-Quiz](spiele/leiterspiel.md) | `Leiterspiel-quiz/` | Snakes & Ladders | Ja (SSE) | zentrale DB |
| [Labyrinth-Quiz](spiele/labyrinth.md) | `Labyrint-Quiz/` | Canvas-Labyrinth | Ja (SSE) | zentrale DB |
| [Schiffeversenken-Quiz](spiele/schiffeversenken.md) | `schiffeversenken/` | Schiffe versenken | Ja (SSE) | zentrale DB |
| [Codenames](spiele/codenames.md) | `codenames/` | Wortraten (Teams) | Ja (Polling) | eigene Wortlisten |
| [Just One](spiele/just-one.md) | `just-one/` | Kooperatives Worträtsel | Ja (SSE, viewer-gefiltert) | eigene Begriffs-DB |
| [Insider](spiele/insider.md) | `insider/` | Deduktion (Geheimwort + Insider) | Ja (SSE, viewer-gefiltert) | Just-One-Begriffs-DB |
| [Hochstapler](spiele/hochstapler.md) | `hochstapler/` | Bluff (Imposter-Prinzip) | Ja (SSE, viewer-gefiltert) | Just-One-Begriffs-DB |
| [Escape Room](spiele/escape-room.md) | `escape-room/` | Rätselräume | Nein (localStorage) | eigene, im Spiel |
| [Memory](spiele/memory.md) | `memory/` | Paare finden (Singleplayer) | Nein | eigene Paar-DB |
| [Lernkarten](spiele/lernkarten.md) | `lernkarten/` | Spaced Repetition (SM-2) | Nein | zentrale DB + Memory |
| [Stadt-Land-Fluss](spiele/stadt-land-fluss.md) | `stadt-land-fluss/` | Klassiker | Nein | Kategorienliste |

## Zentrale Infrastruktur

| Datei | Zweck |
|-------|-------|
| `spiele.html` | Startseite / Spielübersicht, Lehrkraft-Login (`LP@FOS`), Light/Dark |
| `admin.html` | **Zentraler Frageneditor** für alle Quiz-Spiele (`data/questions.json`) |
| `vorschlaege.html` | Formular, mit dem Schüler Fragen-Vorschläge einreichen |
| `api.php` | PHP-API: Multi-Game, SSE, Registry, Drafts, Escape-Room-Sync |
| `codenames/api.php` | Eigene action-basierte API für Codenames |
| `.htaccess` | Apache: SSE-Buffering aus, Direktzugriff auf Spielstände gesperrt |
| `create-zip.ps1` | Erstellt Upload-ZIPs (Delta + Full-Archiv), schließt Spieldaten aus |

## Schnellstart

**Lokal ansehen (ohne Server):** Beliebige `index.html` im Browser öffnen.
Server-Features (Multi-Device-Sync) sind dann aus; die Spiele fallen automatisch
auf `localStorage` zurück (`file://` wird erkannt).

**Mit Server (voller Funktionsumfang):** Gesamtes Verzeichnis auf ein
PHP-Webhosting laden (Apache mit `mod_rewrite` empfohlen). Einstiegspunkt ist
`spiele.html`. Details siehe [architektur.md → Deployment](architektur.md#deployment).

**Fragen bearbeiten:** `admin.html` öffnen (aus `spiele.html` heraus über den
Lehrkraft-Login erreichbar). Änderungen landen in `data/questions.json`.

**Änderungen sichern (Workflow des Betreibers):** Erst committen + pushen, dann
`create-zip.ps1` ausführen — das erzeugt `backups/Spiele.zip` (Upload-Delta) und
ein versioniertes Voll-Archiv. Details in [entwicklung.md](entwicklung.md#backup-und-deployment).

## Wichtigste Konzepte in einem Satz

- **Zentrale Fragendatenbank:** Alle Quiz-Spiele lesen dieselbe `data/questions.json`; jedes Spiel konvertiert beim Laden in sein internes Format. → [datenformate.md](datenformate.md)
- **Multi-Game:** Jede Klasse/Gruppe spielt unter einem eigenen 4-stelligen Code (`A3K7`); Schüler treten über `view.html?code=XXXX` bei. → [architektur.md](architektur.md#multi-game)
- **Echtzeit-Sync:** Server-Sent Events (SSE) mit Polling-Fallback; umkämpfte Schreibzugriffe laufen über optimistische Nebenläufigkeit (`_rev` + 409). → [api-referenz.md](api-referenz.md#nebenlaeufigkeit)
- **Gemischtes Schreibmodell:** Das Lehrergerät schreibt autoritativ direkt; umkämpfte Aktionen (Team-Beitritt, Kick, Steal-Meldung) nutzen Compare-and-Swap. → [architektur.md](architektur.md#schreibmodell)
