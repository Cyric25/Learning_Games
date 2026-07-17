# Codenames

Wortraten in zwei Teams (rot/blau). Zwei Spymaster geben Hinweise, ihre
Operatives raten Karten. Eigene API, eigene Wortlisten — nutzt **nicht** die
zentrale Fragendatenbank.

## Dateien

| Datei | Rolle |
|-------|-------|
| `codenames/index.html` | Spieler-Einstieg (Start/Lobby/Spiel) |
| `codenames/game.js` | gesamte Spiellogik (Client) |
| `codenames/admin.html` | Wortlisten-Editor |
| `codenames/spectator.html` | Zuschaueransicht |
| `codenames/api.php` | eigene action-basierte API (`?action=…`) |
| `codenames/style.css` | Styles |

## Architektur: server-autoritativ

Anders als die anderen Spiele ist der **Server voll autoritativ**. Jede Aktion
(`create_game`, `join_game`, `submit_clue`, `guess_card`, `end_turn`, …) läuft
über `apiPost(action, data)` und wird serverseitig unter `flock` pro PIN
verarbeitet. Der Client hält keinen eigenen Spielzustand vor, sondern **pollt**
`get_state` alle 1,5 s. Spiele werden über eine 4-stellige **PIN** identifiziert
(kein Code-System wie bei den Quiz-Spielen; PIN wird exklusiv per `fopen('x')`
vergeben).

Rollen: `spymaster` (sieht alle Kartenfarben), `operative` (rät), `spectator`.
`get_state` filtert für Nicht-Spymaster die Farben unaufgedeckter Karten heraus.

## Wortlisten

`data/codenames/<id>.json` + `index.json`. Erstellen/Löschen (`save_wordlist` /
`delete_wordlist`) verlangt den **Admin-Token** `X-Admin-Key`. Eine Runde nutzt
25 Wörter (feste Wortliste oder 25 Custom-Wörter).

## Besonderheiten (behobene Fallstricke)

- **Hinweis-Eingabefeld übersteht Re-Render:** `renderClueArea` rettet Wert,
  Fokus und Cursor-Position über den 1,5-s-Poll-Rebuild — sonst wäre das Eingeben
  eines Hinweises nur in <1,5-s-Häppchen möglich.
- **Online-Anzeige uhrunabhängig:** `get_state` liefert `server_now`; der Client
  vergleicht `last_seen` dagegen statt gegen die (evtl. abweichende) lokale Uhr.
- **Refresh-Overlap-Guard:** `doRefresh` hat ein `_refreshing`-Flag, damit bei
  langsamem Server keine ältere Antwort einen neueren Zustand überschreibt.
- **PIN-Kollision:** exklusive Dateianlage verhindert doppelt vergebene PINs.

## Wichtige Funktionen (`game.js`)

`apiPost` / `apiGet` · `doJoin` · `doRefresh` / `handleStateUpdate` ·
`renderScoreBar` / `renderCardGrid` / `renderClueArea` · `doSubmitClue` ·
`doGuessCard` · `doEndTurn`.

## Rich-Content (seit Juli 2026)

Codenames-Karten zeigen bewusst **reinen Text**: Kartenwörter laufen durch
`richToPlainText()` (`js/rich-content.js`) — `$…$`-Formeln erscheinen als
TeX-Quelltext, Bild-Marker als Alt-Text. Der Wortlisten-Editor weist darauf
hin. Hinweiswörter der Spymaster bleiben unverändert escaped.