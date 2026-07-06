# Risiko-Quiz

Jeopardy-artiges Quiz-Brett für die Klasse. **Master-Spiel** des Projekts: Der
Risiko-Quiz-Admin (`../admin.html`) ist der zentrale Frageneditor, und das
`questions.json`-Format ist das Master-Format.

## Dateien

| Datei | Rolle |
|-------|-------|
| `risiko-quiz/index.html` | Lehrergerät (Setup, Brett, Fragen-Auflösung) |
| `risiko-quiz/js/game.js` | Spiellogik des Lehrergeräts |
| `risiko-quiz/view.html` | Schülergerät (Team wählen, MC beantworten, „Ich weiß es!") |
| `risiko-quiz/practice.html` | Freistehender Übungsmodus (kein Server) |
| `risiko-quiz/index.html` (Screen) / `admin.html` | Admin = zentrale Fragendatenbank |
| `risiko-quiz/js/shared.js` | `StorageManager` + `GameModel` + `MDParser` (von allen Quiz-Spielen genutzt!) |
| `risiko-quiz/css/game.css`, `admin.css` | Styles (Dark-Standard, `body.light`) |

`shared.js` ist die Grundlage der zentralen `admin.html` und wird von mehreren
Spielen mitgenutzt — Änderungen dort wirken breit.

## Ablauf

1. **Spielwähler / Join** (`index.html`): Lehrkraft erstellt Spiel (→ Code) oder
   setzt ein laufendes fort. Schüler geben Code ein → Weiterleitung zu `view.html`.
2. **Setup**: Slots (Kategorie-Spalten) wählen, Teams zusammenstellen,
   Einstellungen (Startkapital, Timer an/aus, Timer-Sekunden, negatives Konto,
   Antwort anzeigen, Steal-Modus).
3. **Spiel**: Brett aus Slots × 5 Schwierigkeiten (100–500). Team wählt Zelle,
   Frage öffnet sich. MC wird vom Schülergerät ausgewertet, offene Fragen von der
   Lehrkraft (Richtig/Falsch).
4. **Steal-Modus** (optional): Nach falscher Antwort dürfen Teams mit ≥100 Punkten
   „Ich weiß es!" drücken; das schnellste Team darf klauen.
5. **Ende**: Rangliste.

## Besonderheiten

- **Timer** respektiert `settings.timerEnabled`. Ist er aus, läuft auf dem
  Lehrergerät kein Countdown (sonst würde er automatisch „falsch" werten). Beim
  Ablauf lädt das Lehrergerät kurz frisch, um eine in letzter Sekunde
  eingegangene Schülerantwort zu bevorzugen. Schülergeräte rechnen die Restzeit
  aus `liveQuestion.openedAt` (gegen Uhren-Skew geklemmt, kein Neustart nach
  Reload).
- **Schüleraktionen über CAS:** „Ich weiß es!" (`pressIchWeissEs`), Zellen-Auswahl
  (`selectCell`) und „Weiß nicht" (`pressWeissNicht`) nutzen
  `StorageManager.mutate` — so gehen bei gleichzeitigen Meldungen keine verloren.
  Jede prüft, dass das Gerät auch das aktive Team ist.
- **Lehrer-Reentry:** Der zuletzt geladene Code wird in
  `localStorage['rq_last_teacher_code']` gemerkt. Nach einem Reload (bei dem
  `?code=` aus der URL entfernt wird) bietet der Join-Screen einen
  „Laufendes Spiel fortsetzen"-Button.
- **Multi-MC im Admin:** Der Legacy-Editor (`risiko-quiz/js/admin.js`) kann nur
  Single-Correct; beim Speichern löscht er ein evtl. vorhandenes
  `correctIndices`-Array, damit Korrekturen wirken. Multi-Correct wird in der
  zentralen `admin.html` gepflegt.

## Wichtige Funktionen (`js/game.js`)

`init` / `joinGame` / `createNewGame` / `loadGame` (Einstieg) · `openQuestion` ·
`selectMcAnswer` · `startTimer` / `timerExpired` · `resolveQuestion` ·
`startStealPhase` / `stealTeamClick` · `handleTeamAction` (SSE-Empfang) ·
`showEndScreen` · `offerTeacherResume` / `resumeTeacherGame`.

Zeilennummern in `memory/reference_file_map.md` (regelmäßig veraltet — im Zweifel
per Grep auf Funktionsnamen suchen).

## Bekannte Grenzen

- `stealCandidates` könnte theoretisch von einem Lehrer-Plain-Save überschrieben
  werden (Fenster durch Schüler-CAS + SSE minimal). Vollständiges Server-Merging
  wäre semantisch heikel, weil die Lehrkraft die Liste legitim leert.
