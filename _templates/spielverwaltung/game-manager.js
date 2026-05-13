/* ── Spielwähler JS ──────────────────────────────────────────────────
   ERSETZEN:
     XxxStorage  → Name des Storage-Objekts (z.B. LsStorage)
     'setup-screen' / 'game-screen' → tatsächliche Screen-IDs
     'view.html'  → Pfad zur Schüleransicht

   Ergänzen in _gsEnter():
     - Spielspezifischen State aus dem Spielstand laden
     - Board/Canvas initialisieren
     - SSE-Subscription starten
   ──────────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function showGameSelector() {
  showScreen('game-selector');
  const list = document.getElementById('gs-game-list');
  list.innerHTML = '<p class="gs-empty">Lade Spiele…</p>';
  const registry = await XxxStorage.loadGamesRegistry();
  const entries = Object.entries(registry);
  if (entries.length === 0) { list.innerHTML = '<p class="gs-empty">Noch keine Spiele vorhanden.</p>'; return; }
  entries.sort((a,b) => (b[1].updatedAt||b[1].createdAt||'').localeCompare(a[1].updatedAt||a[1].createdAt||''));
  list.innerHTML = entries.map(([code, info]) => {
    const statusLabel = {playing:'🟢 Läuft', finished:'🏁 Beendet', 'dice-order':'🎲 Startreihe'}[info.status] || '⚙ Setup';
    const date = info.updatedAt ? new Date(info.updatedAt).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    const ts = info.updatedAt||info.createdAt;
    let expiryHint = '';
    if (ts) { const rem = 24*3600000-(Date.now()-new Date(ts).getTime()); if(rem>0){const h=Math.floor(rem/3600000),m=Math.floor((rem%3600000)/60000); expiryHint=` · ${h}h ${m}m übrig`;} }
    return `<div class="gs-game-card" onclick="window._gsEnter('${code}')">
      <div class="gs-game-code">${code}</div>
      <div class="gs-game-info">
        <div class="gs-game-title">${escapeHtml(info.title||'Spiel')}</div>
        <div class="gs-game-meta">${statusLabel} · ${date}${expiryHint}</div>
      </div>
      <div class="gs-game-actions">
        <button class="gs-btn-delete" onclick="event.stopPropagation();window._gsDelete('${code}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Schüler beitreten ─────────────────────────────────────────────
function joinAsStudent() {
  const input = document.getElementById('gs-code-input');
  const errEl = document.getElementById('gs-join-error');
  const code = (input ? input.value : '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (errEl) errEl.textContent = '';
  if (!code || code.length < 4) { if (errEl) errEl.textContent = 'Bitte 4-stelligen Code eingeben.'; return; }
  window.location.href = 'view.html?code=' + code;
}

// ── Lehrkraft: Spiel erstellen ────────────────────────────────────
// Function Declaration → gehoisted → automatisch window.createNewGame
async function createNewGame() {
  const code = XxxStorage.generateCode();
  XxxStorage.setCode(code);
  // TODO: Skeleton-State an Spielstruktur anpassen
  await XxxStorage.save({
    meta: { gameCode: code, title: 'Spielname', createdAt: new Date().toISOString() },
    phase: 'setup',
    teams: [],
    usedQuestionIds: new Set(),
    activeCategoryIds: [],
    liveQuestion: null
  });
  window.history.replaceState({}, '', 'index.html?code=' + code);
  showScreen('setup-screen');
  const t = document.getElementById('setup-game-title'); if(t) t.value='';
  showCodeBanner();
}

// ── Spielwähler-Aktionen ──────────────────────────────────────────
// Als Declarations definieren + danach manuell auf window exportieren
async function _gsEnter(code) {
  XxxStorage.setCode(code);
  const gs = await XxxStorage.load(code);
  if (!gs) { alert('Spiel nicht gefunden.'); showGameSelector(); return; }
  window.history.replaceState({}, '', 'index.html?code=' + code);
  gameState = gs;

  // TODO: Phase-Fallunterscheidung an Spielzustände anpassen
  if (gs.phase === 'playing') {
    if (gs.activeCategoryIds) selectedCategoryIds = new Set(gs.activeCategoryIds);
    // TODO: Board/Canvas aus gespeichertem State wiederherstellen
    showScreen('game-screen');
    showCodeBanner();
    // TODO: startSSESubscription();
  } else if (gs.phase === 'finished') {
    showScreen('result-screen');
    // TODO: Ergebnisse rendern
  } else {
    showScreen('setup-screen');
    showCodeBanner();
  }
}

async function _gsDelete(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await XxxStorage.deleteGame(code);
  showGameSelector();
}

// Exports NACH den Declarations (vor DOMContentLoaded, also sicher)
window._gsEnter  = _gsEnter;
window._gsDelete = _gsDelete;

// ── Code-Badge (Lehrkraft-View) ───────────────────────────────────
function showCodeBanner() {
  const code = XxxStorage.getCode(); if (!code) return;
  const existing = document.getElementById('code-banner');
  if (existing) { existing.querySelector('.code-val').textContent = code; return; }
  const b = document.createElement('div');
  b.id = 'code-banner';
  b.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999;background:var(--bg-card,#1a2744);color:var(--text-primary,#fff);border-radius:12px;padding:10px 16px;font-size:.85rem;box-shadow:0 2px 12px rgba(0,0,0,.4);display:flex;align-items:center;gap:10px;';
  b.innerHTML = '<span>📱 Schüler:</span><strong class="code-val" style="font-size:1.2rem;letter-spacing:2px">'+code+'</strong><a href="view.html?code='+code+'" target="_blank" style="color:var(--accent);font-size:.8rem;text-decoration:none">Link ↗</a>';
  document.body.appendChild(b);
}

// ── Zurück zum Spielwähler ────────────────────────────────────────
function resetToSelector() {
  XxxStorage.setCode(null);
  window.history.replaceState({}, '', 'index.html');
  const banner = document.getElementById('code-banner'); if(banner) banner.remove();
  // TODO: SSE-Subscription stoppen falls vorhanden
  showGameSelector();
}

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData(); // TODO: eigene Datenladefunktion
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) await _gsEnter(urlCode.toUpperCase());
  else showGameSelector();
});
