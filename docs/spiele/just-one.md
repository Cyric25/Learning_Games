# Just One

Kooperatives Worträtsel mit eigenen Begriffen: Pro Runde ist eine Person
Rater:in, alle anderen schreiben geheim je einen Ein-Wort-Hinweis auf das
Geheimwort. Identische Hinweise werden automatisch gestrichen, die Lehrkraft
kann weitere ungültige Hinweise (Wortfamilie, Fremdsprache, erfunden) manuell
streichen, dann hat die Rater:in einen Rateversuch.

## Dateien

| Datei | Rolle |
|-------|-------|
| `just-one/index.html` | Lehrkraft: Spielwähler, Setup, Kategorien, Warteraum, Rundenmoderation |
| `just-one/view.html` | Schülergerät: Beitritt, Warteraum, Hinweis-Eingabe / Rater-Ansicht |
| `just-one/board.html` | Tafelansicht (reine Projektion, kein Geheimwort während laufender Runde) |
| `just-one/admin.html` | Eigener Begriffs-Editor (Kategorien/Unterkategorien/Begriffe, MD-Import) |
| `just-one/js/shared.js` | `JoStorage` — Spielverwaltung (Code, CAS via `mutate()`, SSE+Polling, Viewer-Filterung) |
| `just-one/js/game.js` | Lehrkraft-Logik (Setup, Rundenablauf, Moderation, Scoring) |
| `just-one/js/play.js` | Schülergerät-Logik (Beitritt, Kick-Erkennung, Hinweis-Eingabe, Rater-Ansicht) |
| `just-one/js/board.js` | Tafel-Rendering (nutzt `JoStorage` mit Viewer-Sentinel `'*'`) |
| `just-one/js/round-shared.js` | Reine Rundenlogik-Helfer (Duplikat-Erkennung, Bewertungsskala) — geteilt von `game.js`/`play.js`/`board.js` |
| `just-one/js/wordlist-shared.js` | `JoWordlistStorage`/`JoWordlistModel`/`JoWordlistMDParser` — eigene Begriffs-DB |
| `just-one/js/admin.js` | Begriffs-Editor-Logik |
| `data/just-one/wordlists.json` | Begriffs-DB (Kategorie → Unterkategorie → Begriffe[]) |
| `data/games/just-one/` | Pro-Code Spielstände + `index.json` Registry (Prefix `jo-` in `api.php`) |

## Eigene Begriffsdatenbank (bewusst nicht die zentrale Fragendatenbank)

Just One braucht einen offenen Begriffs-**Pool** (einzelne Wörter), keine
Frage-Objekte — die zentrale `data/questions.json` passt strukturell nicht.
Auch die Codenames-Wortlisten (`data/codenames/`) wurden bewusst **nicht**
wiederverwendet: deren Format ist hart auf **genau 25 Wörter** pro Liste
festgelegt (Codenames-Spielbrett), was für einen offenen Rundenpool ungeeignet
ist. `data/just-one/wordlists.json` verwendet stattdessen ein eigenes,
zweistufiges Format (Kategorie → Unterkategorie → `words[]`), analog zur
zentralen DB aber ohne beliebige Tiefe. MD-Import-Dialekt:

```markdown
## Kategorie
### Unterkategorie
- Begriff
- Begriff
```

## Kernentscheidung: Viewer-gefilterter State

Alle anderen Spiele im Projekt synchronisieren denselben JSON-Zustand an jedes
Gerät. Just One ist die **einzige Ausnahme**: die Rater:in einer Runde darf
das Geheimwort (`currentRound.secretWord`) in keinem Netzwerk-Payload sehen,
sonst ist die Rate-Runde sinnlos.

- `api.php` bekommt dafür `filterJoState($state, $viewerPlayerId)` — angewendet
  in `gameEndpoint()` (GET-Antwort **und** 409-Konflikt-Antwort) sowie in
  `sseStream()`, jeweils über einen optionalen `$filterFn`-Parameter (für alle
  anderen Spiele-Prefixe `null`, also unverändertes Verhalten).
- Jeder Client schickt seine eigene `playerId` als `?playerId=…`. Die
  Lehrkraft schickt keine (sieht immer alles). Die Tafelansicht schickt den
  festen Sentinel-Wert `'*'` — sie wird von der ganzen Klasse inkl. der
  aktuellen Rater:in eingesehen und muss das Geheimwort deshalb **immer**
  verbergen, solange die Runde nicht `resolved` ist (unabhängig davon, wer
  gerade tatsächlich rät).
- Client-seitig: `JoStorage.setViewerId(id)` / `JoStorage._vp()` hängt
  `&playerId=…` an jeden `jo-game`/`jo-sse`-Aufruf. `view.html` setzt die
  Viewer-Id **vor** dem allerersten `load()` (auch beim Reconnect nach
  Reload) — sonst stünde das Geheimwort kurz im Speicher, obwohl die UI es
  nicht anzeigt.
- Sobald `currentRound.phase === 'resolved'` ist, wird nicht mehr gefiltert —
  das Geheimwort wird für alle (inkl. der Rater:in) aufgedeckt, wie im
  physischen Spiel.

## Kritischer Fallstrick: leeres `{}` wird zu `[]`

`json_decode($x, true)` in PHP kennt keinen Unterschied zwischen leerem
JSON-Objekt und leerem JSON-Array — ein leeres `currentRound.clues: {}`
kommt nach dem Speichern/Laden als `[]` zurück. Ein Client, der dann per
`clues[playerId] = text` schreibt, verliert den Eintrag lautlos: `JSON.stringify()`
serialisiert bei Arrays nur Index-Elemente, beliebige String-Properties werden
stillschweigend verworfen. **Fix:** `JoStorage._sanitizeState()` klemmt
`currentRound.clues` bei jedem Laden zurück auf ein echtes Objekt, bevor
irgendein Code damit arbeitet. `clues` ist das einzige Dictionary-artige Feld
im Zustand (alle anderen Listen sind echte Arrays) — betrifft daher nur diese
eine Stelle.

## Rundenablauf (State Machine)

`currentRound.phase`: `collecting` → `review` → `revealed` → `resolved` →
(nächste Runde) `collecting` …

1. **collecting** — Lehrkraft zieht per `drawNextRound()` einen zufälligen,
   noch unbenutzten Begriff aus dem aktiven Kategorien-Pool
   (`JoWordlistModel.pooledWords`/`drawWord`, Wiederholungsschutz über
   `usedWordIds`). Alle Nicht-Rater:innen senden ihren Hinweis per
   `JoStorage.mutate()`. Übermittelt die **letzte** erwartete Person ihren
   Hinweis, wechselt derselbe `mutate()`-Aufruf die Phase direkt auf
   `review` und berechnet die Duplikat-Streichungen
   (`joComputeDuplicateStrikes` — exakter, getrimmter, case-insensitiver
   Vergleich, bewusst **keine** Plural-/Genus-Fuzzy-Erkennung). Die Lehrkraft
   kann mit „Hinweise jetzt schließen" (`forceCloseClues()`) auch vorzeitig
   abschließen.
2. **review** — Lehrkraft-Moderationsscreen zeigt alle Hinweise (Duplikate
   bereits durchgestrichen), kann weitere manuell streichen/wiederherstellen
   (`toggleStrike()`, reines Force-Write). Bleiben Hinweise übrig →
   „Freigeben" (`releaseClues()`, phase→`revealed`). Bleiben **keine** übrig →
   „Fehlversuch bestätigen" (`confirmAutoMiss()`, direkt→`resolved`,
   `result=false`) — entspricht der Originalregel „keine Hinweise = Fehlversuch".
3. **revealed** — nur die überlebenden Hinweise (`joSurvivingClueTexts`) gehen
   an Rater:in-Ansicht und Tafel. Rater:in sagt die Antwort laut; Lehrkraft
   klickt Richtig/Falsch (`resolveRound(bool)`).
4. **resolved** — Geheimwort wird für alle aufgedeckt, Score aktualisiert,
   `currentTurnIdx` rückt vor (Rater-Rotation), nächste Runde
   (`beginNextRound()`) oder Spielende bei erreichter Rundenzahl.

## Exklusiver Beitritt (offenes Roster statt fixer Teamliste)

Anders als das dokumentierte `takenTeams`-Muster (fixe Team-Anzahl) hat Just
One ein **offenes** Spieler-Roster: beliebig viele Personen treten mit
selbstgewähltem Namen bei.

- `playerId` wird pro Gerät zufällig erzeugt und in `localStorage`
  (`jo_playerId_<code>`) persistiert (analog `codenames/game.js`
  `getOrCreatePlayerId`).
- Beitritt = `mutate()`, hängt `{id, name, joinedAt}` an `players[]` an (kein
  Slot-Konflikt möglich, da angehängt statt beansprucht).
- Kick durch Lehrkraft = `mutate()`, entfernt aus `players[]` **und**
  `turnOrder[]` (mit `currentTurnIdx`-Clamp). Betrifft die Kick-Person die
  laufende Runde als Rater:in, wird die Runde abgebrochen
  (`currentRound=null`) — die Lehrkraft startet manuell neu.
- Kick-Erkennung im Client: `!players.some(p => p.id === myPlayerId)` (gleiche
  Struktur wie der bestehende `Array.isArray`-Guard, nur auf `players` bezogen).
- Rater-Rotation: `turnOrder[currentTurnIdx]`, Fortschaltung modulo Länge.
  Mindestens 3 aktive Spieler:innen nötig, um eine Runde zu starten.

## Bewertungsskala (Spielende)

`joRatingText(correct, total)` in `round-shared.js` — eigener, kurzer Text
nach Trefferquote (nicht die Skala aus der Spielschachtel):
90%+ „Telepathisch!", 70%+ „Klasse gespielt!", 50%+ „Solide Teamleistung.",
30%+ „Ausbaufähig …", darunter „Puh, das war knifflig …".

## Theme

Standard-Palette Orange (Light) / Dunkelblau (`body.dark`), kein
spielspezifischer Grund für Abweichung.
