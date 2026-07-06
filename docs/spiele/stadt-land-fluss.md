# Stadt-Land-Fluss

Der Klassiker: Buchstabe ziehen, Begriffe zu Kategorien finden. Single-File-SPA,
kein Server, kein Multiplayer. Light-Standard, `body.dark`.

## Datei

`stadt-land-fluss/index.html` — alle Styles und JS inline.
`stadt-land-fluss/categories.json` (bzw. Root-`categories.json`) — Kategorienamen,
mit eingebetteter Fallback-Liste.

## Zustand & Speicherung

| Variable | Typ | Zweck |
|----------|-----|-------|
| `excludedLetters` | Set | ausgeschlossene Buchstaben |
| `drawnLetters` | Set | bereits gezogene Buchstaben |
| `selectedCategories` | Set | aktive Kategorien |
| `allCategories` | Array | JSON + localStorage-Merge |

localStorage: `slf_added_categories` (eigene), `slf_deleted_categories`
(gelöschte JSON-Kategorien). Beim Laden werden JSON- und localStorage-Kategorien
gemergt (Overlay-Muster).

## Ablauf

`init` → `loadCategories` (fetch `categories.json`, Fallback: eingebettete Liste)
→ localStorage-Overlay → DOM. Buchstaben ziehen, Timer, Kategorien
hinzufügen/entfernen. Reine DOM-Manipulation ohne Framework.
