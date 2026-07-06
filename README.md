# Unterrichtsspiele

Sammlung interaktiver Unterrichtsspiele für Klassenzimmer und digitale Tafel.
Reines HTML/CSS/JS + PHP, **kein Build-System, keine externen Abhängigkeiten**.
Läuft auf jedem PHP-Webhosting; Einzelspieler-Teile auch direkt per `file://`.

## Dokumentation

**Die vollständige Projektdokumentation liegt in [`docs/`](docs/README.md).**

- [docs/README.md](docs/README.md) — Einstieg, Spielübersicht, Schnellstart
- [docs/architektur.md](docs/architektur.md) — Gesamtbild, Sync-Modell, Sicherheit, Deployment
- [docs/api-referenz.md](docs/api-referenz.md) — API-Endpunkte, CAS-Protokoll, Admin-Token
- [docs/datenformate.md](docs/datenformate.md) — questions.json, GameStates, MD-Importe
- [docs/entwicklung.md](docs/entwicklung.md) — Konventionen, Muster, Tests, **Erweiterungs-Fragebogen**
- [docs/spiele/](docs/spiele/) — ein Dokument pro Spiel

`CLAUDE.md` ist die verbindliche Kurzreferenz für KI-Assistenten (Styling,
Copy-Paste-Muster).

## Spiele

Risiko-Quiz · QuizPfad · Leiterspiel-Quiz · Labyrinth-Quiz · Schiffeversenken-Quiz
· Codenames · Escape Room · Memory · Lernkarten · Stadt-Land-Fluss

Einstiegspunkt: `spiele.html`. Zentraler Frageneditor: `admin.html`.

## Erweiterung

Vor jeder Erweiterung zuerst den **Spezifikations-Fragebogen** in
[docs/entwicklung.md §0](docs/entwicklung.md#0-vor-jeder-erweiterung-spezifikation-abfragen-️)
durchgehen (Mehrspieler? Ansichten? zentrale DB? …).

## Backup / Deploy

Erst `git commit` + `push`, dann `create-zip.ps1` ausführen. Upload-Paket:
`backups/Spiele.zip`. Details in
[docs/entwicklung.md](docs/entwicklung.md#backup-und-deployment).

Repo: https://github.com/Cyric25/Learning_Games
