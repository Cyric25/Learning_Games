// ── Spielwähler + Setup-Flow JS (Template) ───────────────────────────
//
// BASIERT AUF: Leiterspiel-quiz/js/leiterspiel.js
// REFERENZ: SETUP-UI-ANALYSE.md (Risiko-Quiz Setup-Flow)
//
// ERSETZEN:
//   XxxStorage   → Name des Storage-Objekts (z.B. LsStorage, MzStorage)
//   'Spielname'  → Spieltitel (z.B. 'Schlangen & Leitern')
//   'view.html'  → Pfad zur Schüleransicht (falls vorhanden)
//   screen-IDs   → an die tatsächlichen Screen-IDs des Spiels anpassen
//
// ERGÄNZEN in _gsEnter():
//   - Spielspezifischen State aus dem Spielstand wiederherstellen
//   - Board/Canvas initialisieren
//   - SSE-Subscription starten
//
// WICHTIG — Hoisting:
//   createNewGame als `async function createNewGame()` deklarieren
//   → wird gehoisted → onclick="createNewGame()" findet die Funktion immer
//   _gsEnter/_gsDelete als reguläre Declarations + manuell auf window exportieren
//   (window._gsEnter = _gsEnter) — NACH den Declarations, vor DOMContentLoaded
//
// ─────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Spielwähler anzeigen ──────────────────────────────────────────────
async function showGameSelector() {
  showScreen('game-selector');
  const list = document.getElementById('gs-game-list');
  list.innerHTML = '<p class="gs-empty">Lade Spiele…</p>';
  const registry = await XxxStorage.loadGamesRegistry();  // ANPASSEN
  const entries  = Object.entries(registry);
  if (entries.length === 0) {
    list.innerHTML = '<p class="gs-empty">Noch keine Spiele vorhanden.</p>';
    return;
  }
  entries.sort((a,b) => (b[1].updatedAt||b[1].createdAt||'').localeCompare(a[1].updatedAt||a[1].createdAt||''));
  list.innerHTML = entries.map(([code, info]) => {
    const statusLabel = {
      playing:     '🟢 Läuft',
      finished:    '🏁 Beendet',
      'dice-order':'🎲 Startreihe'
    }[info.status] || '⚙ Setup';
    const date = info.updatedAt
      ? new Date(info.updatedAt).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})
      : '';
    const ts = info.updatedAt || info.createdAt;
    let expiryHint = '';
    if (ts) {
      const rem = 24*3600000 - (Date.now() - new Date(ts).getTime());
      if (rem > 0) {
        const h = Math.floor(rem/3600000), m = Math.floor((rem%3600000)/60000);
        expiryHint = ` · ${h}h ${m}m übrig`;
      }
    }
    return `<div class="gs-game-card" onclick="window._gsEnter('${code}')">
      <div class="gs-game-code">${code}</div>
      <div class="gs-game-info">
        <div class="gs-game-title">${escapeHtml(info.title || 'Spiel')}</div>
        <div class="gs-game-meta">${statusLabel} · ${date}${expiryHint}</div>
      </div>
      <div class="gs-game-actions">
        <button class="gs-btn-delete" onclick="event.stopPropagation();window._gsDelete('${code}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Schüler beitreten ─────────────────────────────────────────────────
// Leitet zu view.html?code=XXXX weiter.
// ANPASSEN: Wenn kein view.html vorhanden, diese Funktion entfernen.
function joinAsStudent() {
  const input = document.getElementById('gs-code-input');
  const errEl = document.getElementById('gs-join-error');
  const code  = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (errEl) errEl.textContent = '';
  if (!code || code.length < 4) {
    if (errEl) errEl.textContent = 'Bitte 4-stelligen Code eingeben.';
    return;
  }
  window.location.href = 'view.html?code=' + code;  // ANPASSEN
}

// ── Lehrkraft: neues Spiel erstellen ─────────────────────────────────
// Function Declaration → gehoisted → automatisch window.createNewGame
async function createNewGame() {
  const code = XxxStorage.generateCode();  // ANPASSEN
  XxxStorage.setCode(code);
  // ANPASSEN: Skeleton-State an die Spielstruktur anpassen
  await XxxStorage.save({
    meta: { gameCode: code, title: 'Spielname', createdAt: new Date().toISOString() },
    phase: 'setup',
    teams: [],
    usedQuestionIds: new Set(),
    activeCategoryIds: [],
    liveQuestion: null
    // + spielspezifische Felder (z.B. board, positions, …)
  });
  window.history.replaceState({}, '', 'index.html?code=' + code);
  showScreen('setup-screen');
  const t = document.getElementById('setup-game-title');
  if (t) t.value = '';
  showCodeBanner();
}

// ── Spielwähler-Aktionen ──────────────────────────────────────────────
// Als reguläre Declarations + manuell auf window exportieren (s. Ende der Datei)
async function _gsEnter(code) {
  XxxStorage.setCode(code);              // ANPASSEN
  const gs = await XxxStorage.load(code);
  if (!gs) { alert('Spiel nicht gefunden.'); showGameSelector(); return; }
  window.history.replaceState({}, '', 'index.html?code=' + code);
  gameState = gs;  // ANPASSEN: globale State-Variable

  // ANPASSEN: Phase-Fallunterscheidung an spielspezifische Phasen anpassen
  if (gs.phase === 'playing') {
    if (gs.activeCategoryIds) selectedCategoryIds = new Set(gs.activeCategoryIds);
    // TODO: Board/Canvas aus gespeichertem State wiederherstellen
    // TODO: renderBoard(); startSSESubscription();
    showScreen('game-screen');
    showCodeBanner();
  } else if (gs.phase === 'dice-order') {
    if (gs.activeCategoryIds) selectedCategoryIds = new Set(gs.activeCategoryIds);
    // TODO: initDiceOrder();
    showScreen('dice-order-screen');
    showCodeBanner();
  } else if (gs.phase === 'finished') {
    // TODO: Ergebnisse rendern
    showScreen('winner-screen');
  } else {
    // phase === 'setup' oder unbekannte Phase
    showScreen('setup-screen');
    showCodeBanner();
  }
}

async function _gsDelete(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await XxxStorage.deleteGame(code);  // ANPASSEN
  showGameSelector();
}

// Exports nach den Declarations (vor DOMContentLoaded — onclick-Handler finden sie)
window._gsEnter  = _gsEnter;
window._gsDelete = _gsDelete;

// ── Code-Badge (Lehrkraft — fixiert unten rechts) ─────────────────────
// Zeigt Code + Link zu view.html (für Schüler sichtbar auf Leinwand).
function showCodeBanner() {
  const code = XxxStorage.getCode();  // ANPASSEN
  if (!code) return;
  const existing = document.getElementById('code-banner');
  if (existing) { existing.querySelector('.code-val').textContent = code; return; }
  const b = document.createElement('div');
  b.id = 'code-banner';
  b.style.cssText = [
    'position:fixed;bottom:12px;right:12px;z-index:999',
    'background:var(--bg-card,#1a2744);color:var(--text-primary,#fff)',
    'border-radius:12px;padding:10px 16px;font-size:.85rem',
    'box-shadow:0 2px 12px rgba(0,0,0,.4);display:flex;align-items:center;gap:10px'
  ].join(';');
  b.innerHTML =
    '<span>📱 Schüler:</span>' +
    '<strong class="code-val" style="font-size:1.2rem;letter-spacing:2px;font-family:monospace">' + code + '</strong>' +
    '<a href="view.html?code=' + code + '" target="_blank" style="color:var(--accent);font-size:.8rem;text-decoration:none">Link ↗</a>';  // ANPASSEN
  document.body.appendChild(b);
}

// ── Code-Banner inline im Setup-Screen aktualisieren ─────────────────
// Füllt #setup-code-banner + #setup-code-value (aus setup-screen.html).
function showCodeBannerInline() {
  const code = XxxStorage.getCode();  // ANPASSEN
  if (!code) return;
  const banner = document.getElementById('setup-code-banner');
  const val    = document.getElementById('setup-code-value');
  if (banner) banner.style.display = '';
  if (val)    val.textContent = code;
}

// ── Code kopieren (onclick auf Code-Wert) ─────────────────────────────
// VERWENDUNG im HTML:
//   <span onclick="copyCode(this)" id="setup-code-value">XXXX</span>
//   <div class="lobby-code-box" onclick="copyCode(this.querySelector('.lobby-code-value'))">
function copyCode(el) {
  if (!el) return;
  const code = el.textContent.trim();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const orig = el.textContent;
    el.textContent = '✓ Kopiert!';
    setTimeout(() => { el.textContent = orig; }, 1200);
  }).catch(() => {
    // Fallback für ältere Browser
    const ta = document.createElement('textarea');
    ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}
window.copyCode = copyCode;

// ── Lobby-Screen befüllen + anzeigen (Screen 3 "Bereit!") ────────────
// Aufruf: nach erfolgreicher Konfiguration (Teams + Kategorien gewählt).
// ANPASSEN: Zusammenfassungstext spielspezifisch anpassen.
function showLobbyScreen(summaryText) {
  const code = XxxStorage.getCode();  // ANPASSEN
  const codeVal = document.getElementById('lobby-code-val');
  if (codeVal) codeVal.textContent = code || '----';
  const summary = document.getElementById('lobby-summary');
  if (summary && summaryText) summary.textContent = summaryText;
  showScreen('lobby-screen');
}

// ── Zurück zum Spielwähler ────────────────────────────────────────────
function resetToSelector() {
  XxxStorage.setCode(null);  // ANPASSEN
  window.history.replaceState({}, '', 'index.html');
  const banner = document.getElementById('code-banner');
  if (banner) banner.remove();
  // TODO: SSE-Subscription stoppen falls vorhanden (z.B. lsSub && lsSub.unsubscribe())
  showGameSelector();
}

// ── DOMContentLoaded Init ─────────────────────────────────────────────
// ANPASSEN: loadData() durch spielspezifische Datenladefunktion ersetzen.
document.addEventListener('DOMContentLoaded', async () => {
  // TODO: Spielspezifische Initialisierung (Modus-Buttons, Team-Selektor, etc.)
  await loadData();  // ANPASSEN: loadFragen() oder ähnliches
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) await _gsEnter(urlCode.toUpperCase());
  else showGameSelector();
});
