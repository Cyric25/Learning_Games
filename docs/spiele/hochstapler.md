# Hochstapler

Bluffspiel nach dem Imposter-Prinzip („Der Hochstapler", Oh Happy Games), für
die Klasse adaptiert: Alle sehen dasselbe Geheimwort — **außer dem
Hochstapler**, der nur erfährt, dass er der Hochstapler ist. Reihum nennt jede
Person **mündlich** ein Hinweiswort (das Geheimwort selbst ist tabu); der
Hochstapler blufft mit. Nach den Hinweisrunden: mündliche Diskussion +
**digitale Abstimmung**. Wird der Hochstapler enttarnt, hat er eine **letzte
Chance**: Errät er das Geheimwort (mündlich, Lehrkraft wertet), gewinnt er
trotzdem. Wird ein:e Unschuldige:r gewählt, gewinnt der Hochstapler.

**Klassen-Adaption:** Hinweise und Diskussion laufen mündlich im Raum. Digital
sind nur Beitritt, Wort-/Rollenanzeige, Rundensteuerung durch die Lehrkraft
und die Abstimmung auf den Schülergeräten.

## Dateien

| Datei | Rolle |
|-------|-------|
| `hochstapler/index.html` | Lehrkraft: Spielwähler, Setup (Hinweisrunden, 1/2 Hochstapler), Kategorien, Warteraum, Rundenmoderation |
| `hochstapler/view.html` | Schülergerät: Beitritt, Wort-/Rollenkarte (gedrückt halten), Sprechreihenfolge, Abstimmung |
| `hochstapler/board.html` | Tafelansicht (Viewer-Sentinel `'*'`): Hinweisrunde, Sprechreihenfolge, Abstimmungsfortschritt, Auflösung |
| `hochstapler/admin.html` | Reiner Verweis auf `just-one/admin.html` (Begriffs-Editor) |
| `hochstapler/js/shared.js` | `HsStorage` — **dokumentiertes Duplikat** von `just-one/js/shared.js` (`JoStorage`); Prefixe `hs-`/`hs_gs_`, `_sanitizeState` klemmt `votes` |
| `hochstapler/js/game.js` | Lehrkraft-Logik; Kategorie-UI ist ein dokumentiertes Duplikat aus `just-one/js/game.js` |
| `hochstapler/js/play.js` | Schülergerät-Logik (Beitritt, Kick-Erkennung, Rollenkarte, Stimmabgabe) |
| `hochstapler/js/board.js` | Tafel-Rendering |
| `hochstapler/css/hochstapler.css` | Alle Styles — **dokumentiertes Duplikat** von `insider/css/insider.css` (plus Sprechreihenfolge-Chips, minus Timer) |
| `data/games/hochstapler/` | Pro-Code Spielstände + `index.json` Registry (Prefix `hs-` in `api.php`) |

**Geteilte Einbindungen (nicht kopiert):**
`../just-one/js/wordlist-shared.js` (Begriffs-DB) und
`../insider/js/vote-shared.js` (Abstimmungslogik, gemeinsam mit Insider).

## Begriffsquelle: Just-One-Begriffs-DB (kein eigener Editor)

Wie Insider: Geheimwörter kommen aus `data/just-one/wordlists.json` über
`JoWordlistStorage`/`JoWordlistModel`; gepflegt wird ausschließlich in
`just-one/admin.html`.

## Viewer-gefilterter State + Geheimfeld-Schutz

`filterHsState()` in `api.php` (`?playerId=…`), solange die Runde nicht
`resolved` ist:

| Viewer | `secretWord` | `impostorIds` |
|--------|:---:|:---:|
| Lehrkraft (kein `playerId`) | ✔ | ✔ (alle) |
| Ehrliche:r | ✔ | `[]` |
| Hochstapler | – | `[eigene Id]` — bei 2 Hochstaplern kennen sie einander **nicht** |
| Tafel (`'*'`) | – | `[]` |

Beim Schreiben stellt `protectSecretRoundFields()` (siehe
[insider.md](insider.md) bzw. `api.php`) `secretWord` und die **vollständige**
`impostorIds`-Liste aus dem gespeicherten Stand wieder her (nur bei gleicher
`currentRound.num`) — sonst würde die Stimmabgabe eines gefilterten Clients
die Geheimfelder löschen bzw. die Liste auf die eigene Id reduzieren.

## Rundenablauf (State Machine)

`currentRound.phase`: `roleReveal` → `hinting` → `voting` → `voteClosed` →
(`lastChance`) → `resolved`

1. **roleReveal** — Lehrkraft zieht Begriff; 1 Hochstapler zufällig (bzw. 2
   bei aktiviertem Setup-Schalter **und** ≥ 5 Spieler:innen — sonst
   automatisch nur 1). `speakOrder` wird pro Runde gemischt.
2. **hinting** — `hintRound: 1..settings.hintRounds` (Standard 2,
   konfigurierbar 1–4). Hinweise mündlich in der angezeigten Reihenfolge;
   Lehrkraft schaltet weiter oder öffnet vorzeitig die Abstimmung.
3. **voting** — identische Logik wie Insider (`vote-shared.js`): alle stimmen
   ab, wählbar sind alle außer sich selbst; letzte Stimme schließt
   (`vtCloseVote`), Gleichstand → einmalige Stichwahl, erneuter Gleichstand →
   `votedId:null`.
4. **voteClosed → Auflösen** (Lehrkraft, Force-Write): Ist die gewählte Person
   Hochstapler → `lastChance`; sonst (oder bei `votedId:null`) → `resolved`
   mit `result:'impostor'`.
5. **lastChance** — der enttarnte Hochstapler rät das Wort **mündlich**, die
   Lehrkraft wertet: erraten → `result:'impostor'`, falsch →
   `result:'honest'`. Bei 2 Hochstaplern zählt nur die gewählte Person
   (eine Abstimmung pro Runde).
6. **resolved** — Wort + alle Hochstapler werden für alle aufgedeckt
   (Filter endet).

Kein festes Rundenziel: „Spiel beenden" zeigt `results: {honest, impostor}` +
`roundHistory`. Mindestens **3** Spieler:innen. Kick des letzten verbliebenen
Hochstaplers bricht die Runde ab; kein Timer (bewusst — die Hinweisrunden
taktet die Lehrkraft).

## Theme

Standard-Palette Orange (Light) / Dunkelblau (`body.dark`), kein
spielspezifisches Theme.

## Rich-Content (seit Juli 2026)

Begriffe aus der Just-One-DB dürfen Formeln/Bilder enthalten; Wortkarten,
Auflösung und Tafel rendern über `renderRichContent()` (`js/rich-content.js`).