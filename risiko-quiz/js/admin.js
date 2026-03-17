// admin.js – Admin-Logik für Risiko-Quiz

let questionBank = { categories: [] }; // aus questions.json
let currentGame  = null;               // aus gamestate.json (ohne categories)

let editingQuestionId = null;
let editingCatId = null;
let editingSubcatId = null;
let editingSubsubcatId = null;
let editingL4Id = null;
let importParsed = null;
const collapsedCats = new Map(); // catId → collapsed (bool)
const collapsedSubs = new Map(); // subId → collapsed
const collapsedSubsubs = new Map(); // subsubId → collapsed

// ── Init ─────────────────────────────────────────────────────
async function init() {
  // Prüfe ob ein Code in der URL steht
  const urlCode = new URLSearchParams(window.location.search).get('code');

  if (urlCode) {
    await enterGame(urlCode.toUpperCase());
  } else {
    // Migration: prüfe ob ein Legacy-Spielstand existiert
    await migrateIfNeeded();
    showGameSelector();
  }
}

// ── Spielwähler ──────────────────────────────────────────────
async function showGameSelector() {
  document.getElementById('game-selector').style.display = '';
  document.getElementById('admin-header').style.display = 'none';
  document.getElementById('tabs').style.display = 'none';
  document.getElementById('content').style.display = 'none';

  const registry = await StorageManager.loadGamesRegistry();
  const list = document.getElementById('gs-game-list');
  const entries = Object.entries(registry);

  if (entries.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;">Noch keine Spiele vorhanden.</p>';
    return;
  }

  // Sortieren: neueste zuerst
  entries.sort((a, b) => (b[1].updatedAt || b[1].createdAt || '').localeCompare(a[1].updatedAt || a[1].createdAt || ''));

  list.innerHTML = entries.map(([code, info]) => {
    const status = info.status === 'running' ? '🟢 Läuft' :
                   info.status === 'finished' ? '🏁 Beendet' :
                   info.status === 'paused' ? '⏸ Pausiert' : '⚙ Setup';
    const date = info.updatedAt ? new Date(info.updatedAt).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    // Verbleibende Zeit bis Auto-Löschung (24h nach letztem Update)
    let expiryHint = '';
    const ts = info.updatedAt || info.createdAt;
    if (ts) {
      const remaining = 24 * 60 * 60 * 1000 - (Date.now() - new Date(ts).getTime());
      if (remaining > 0) {
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        expiryHint = ` · ${h}h ${m}m übrig`;
      }
    }
    return `<div class="gs-game-card" onclick="enterGame('${code}')">
      <div class="gs-game-code">${code}</div>
      <div class="gs-game-info">
        <div class="gs-game-title">${escHtml(info.title || 'Unbenannt')}</div>
        <div class="gs-game-meta">${status} · ${date}${expiryHint}</div>
      </div>
      <div class="gs-game-actions">
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteGameFromSelector('${code}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function createNewGame() {
  const gameCode = GameModel.generateToken();
  const game = GameModel.createGame({ gameCode });
  StorageManager.setGameCode(gameCode);
  await StorageManager.saveGameState(game);
  // URL aktualisieren
  window.history.replaceState({}, '', 'admin.html?code=' + gameCode);
  await enterGame(gameCode);
}

async function deleteGameFromSelector(code) {
  if (!confirm('Spiel ' + code + ' wirklich löschen?')) return;
  await StorageManager.deleteGame(code);
  showGameSelector();
}

async function enterGame(code) {
  StorageManager.setGameCode(code);

  const [qb, gs] = await Promise.all([
    StorageManager.loadQuestions(),
    StorageManager.loadGameState()
  ]);

  questionBank = qb;
  currentGame = gs;

  if (!currentGame || !currentGame.meta) {
    currentGame = GameModel.createGame({ gameCode: code });
    await saveGame();
  }

  // Sicherstellen dass gameCode im Meta gesetzt ist
  if (!currentGame.meta.gameCode) {
    currentGame.meta.gameCode = code;
    await saveGame();
  }

  // URL aktualisieren
  if (!window.location.search.includes('code=')) {
    window.history.replaceState({}, '', 'admin.html?code=' + code);
  }

  // Spielwähler ausblenden, Admin einblenden
  document.getElementById('game-selector').style.display = 'none';
  document.getElementById('admin-header').style.display = '';
  document.getElementById('tabs').style.display = '';
  document.getElementById('content').style.display = '';

  updateCurrentGameLabel();
  updateGameCodeBadge();
  updateStartGameLink();
  fillSettingsForm();
  renderAll();
  bindEvents();
}

function copyGameCode() {
  const code = StorageManager.getGameCode();
  if (code) {
    navigator.clipboard.writeText(code).then(() => {
      const badge = document.getElementById('game-code-badge');
      const orig = badge.textContent;
      badge.textContent = '✓ Kopiert!';
      setTimeout(() => badge.textContent = orig, 1500);
    }).catch(() => {});
  }
}

// ── Migration: Legacy gamestate.json → games/{CODE}.json ─────
async function migrateIfNeeded() {
  if (!StorageManager._hasServer()) return;
  try {
    const r = await fetch(StorageManager._apiUrl('gamestate'));
    if (!r.ok) return;
    const legacy = await r.json();
    if (!legacy || !legacy.meta) return;

    // Prüfe ob Registry schon Einträge hat
    const registry = await StorageManager.loadGamesRegistry();
    if (Object.keys(registry).length > 0) return; // Schon migriert

    // Migriere
    const code = legacy.meta.gameCode || GameModel.generateToken();
    legacy.meta.gameCode = code;
    StorageManager.setGameCode(code);
    await StorageManager.saveGameState(legacy);
    StorageManager.setGameCode(null);

    alert('Bestehendes Spiel wurde migriert.\nNeuer Spielcode: ' + code);
  } catch { }
}

async function saveQuestions() {
  return await StorageManager.saveQuestions(questionBank);
}

async function saveGame() {
  await StorageManager.saveGameState(currentGame);
}

function updateCurrentGameLabel() {
  const el = document.getElementById('current-game-label');
  if (el) el.textContent = currentGame.meta.title || 'Unbenanntes Spiel';
}

function updateGameCodeBadge() {
  const badge = document.getElementById('game-code-badge');
  const code = StorageManager.getGameCode() || currentGame.meta.gameCode || '?';
  if (badge) badge.textContent = '🎮 ' + code;
}

function updateStartGameLink() {
  const link = document.getElementById('link-start-game');
  const code = StorageManager.getGameCode() || currentGame.meta.gameCode;
  if (link && code) link.href = 'index.html?code=' + code;
}

// ── Render all ───────────────────────────────────────────────
function renderAll() {
  renderCategories();
}

// ── Settings tab ─────────────────────────────────────────────
function fillSettingsForm() {
  const s = currentGame.meta.settings;
  document.getElementById('s-title').value = currentGame.meta.title || '';
  document.getElementById('s-capital').value = s.startCapital;
  document.getElementById('s-capital-val').textContent = s.startCapital;
  document.getElementById('s-timer-sec').value = s.timerSeconds;
  document.getElementById('s-timer-sec-val').textContent = s.timerSeconds + ' s';
  document.getElementById('s-timer-on').checked = s.timerEnabled !== false;
  document.getElementById('s-negative').checked = s.allowNegative || false;
  document.getElementById('s-show-answer').checked = s.showCorrectAnswer !== false;
  document.getElementById('s-steal-mode').checked = s.stealMode || false;
  updateToggleLabels();
}

function updateToggleLabels() {
  document.getElementById('s-timer-on-label').textContent =
    document.getElementById('s-timer-on').checked ? 'Timer an' : 'Timer aus';
  document.getElementById('s-negative-label').textContent =
    document.getElementById('s-negative').checked ? 'Erlaubt' : 'Nicht erlaubt';
  document.getElementById('s-show-answer-label').textContent =
    document.getElementById('s-show-answer').checked ? 'Wird angezeigt' : 'Versteckt';
  document.getElementById('s-steal-mode-label').textContent =
    document.getElementById('s-steal-mode').checked ? 'Aktiviert' : 'Deaktiviert';
}

async function saveSettings() {
  const title = document.getElementById('s-title').value.trim();
  if (!title) { showAlert('settings-alert', 'danger', 'Bitte Spieltitel eingeben.'); return; }

  currentGame.meta.title = title;
  currentGame.meta.settings.startCapital = parseInt(document.getElementById('s-capital').value);
  currentGame.meta.settings.timerSeconds = parseInt(document.getElementById('s-timer-sec').value);
  currentGame.meta.settings.timerEnabled = document.getElementById('s-timer-on').checked;
  currentGame.meta.settings.allowNegative = document.getElementById('s-negative').checked;
  currentGame.meta.settings.showCorrectAnswer = document.getElementById('s-show-answer').checked;
  currentGame.meta.settings.stealMode = document.getElementById('s-steal-mode').checked;

  await saveGame();
  updateCurrentGameLabel();
  updateGameCodeBadge();
  showAlert('settings-alert', 'success', 'Einstellungen gespeichert.');
}

// ── Categories & Questions ───────────────────────────────────
function renderQTable(container, questions, catId, subId, subsubId, l4Id) {
  const uid = l4Id || subsubId || subId;
  const tableWrap = document.createElement('div');
  tableWrap.innerHTML = `
    <table class="q-table">
      <thead>
        <tr><th>Stufe</th><th>Typ</th><th>Frage</th><th>Antwort</th><th></th></tr>
      </thead>
      <tbody id="q-tbody-${uid}"></tbody>
    </table>
  `;
  container.appendChild(tableWrap);

  const tbody = tableWrap.querySelector(`#q-tbody-${uid}`);
  const sorted = [...(questions || [])].sort((a, b) => a.difficulty - b.difficulty);
  sorted.forEach(q => {
    const tr = document.createElement('tr');
    let editCall, removeCall;
    if (l4Id) {
      editCall = `openQuestionModal('${catId}','${subId}','${q.id}','${subsubId}','${l4Id}')`;
      removeCall = `removeQuestion('${catId}','${subId}','${q.id}','${subsubId}','${l4Id}')`;
    } else if (subsubId) {
      editCall = `openQuestionModal('${catId}','${subId}','${q.id}','${subsubId}')`;
      removeCall = `removeQuestion('${catId}','${subId}','${q.id}','${subsubId}')`;
    } else {
      editCall = `openQuestionModal('${catId}','${subId}','${q.id}')`;
      removeCall = `removeQuestion('${catId}','${subId}','${q.id}')`;
    }
    tr.innerHTML = `
      <td><span class="diff-badge diff-${q.difficulty}">${q.difficulty}</span></td>
      <td><span class="type-badge type-${q.type}">${q.type === 'mc' ? 'MC' : 'Offen'}</span></td>
      <td><span class="q-preview" title="${escHtml(q.question)}">${escHtml(q.question)}</span></td>
      <td><span class="q-preview" title="${escHtml(q.answer)}">${escHtml(q.answer)}</span></td>
      <td>
        <div style="display:flex;gap:0.3rem;">
          <button class="btn btn-secondary btn-sm" onclick="${editCall}">✎</button>
          <button class="btn btn-danger btn-sm" onclick="${removeCall}">✕</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-secondary);text-align:center;padding:1rem;">Noch keine Fragen</td></tr>';
  }
}

function mkCollapseBtn(id, map, label) {
  const collapsed = map.get(id) || false;
  return `<button class="btn btn-secondary btn-sm cat-collapse-btn" onclick="toggleCollapse('${id}', event)" title="${collapsed ? 'Aufklappen' : 'Einklappen'}">${collapsed ? '▶' : '▼'}</button>`;
}

function toggleCollapse(id, event) {
  if (event) event.stopPropagation();
  // Determine which map to use by checking all three
  let map = collapsedCats;
  if (collapsedSubs.has(id)) map = collapsedSubs;
  else if (collapsedSubsubs.has(id)) map = collapsedSubsubs;
  else if (!collapsedCats.has(id)) {
    // First time – try to find in DOM
    const el = document.querySelector(`[data-collapse-id="${id}"]`);
    if (!el) { collapsedCats.set(id, true); }
    else {
      const type = el.dataset.collapseType || 'cat';
      map = type === 'sub' ? collapsedSubs : type === 'subsub' ? collapsedSubsubs : collapsedCats;
    }
  }
  map.set(id, !(map.get(id) || false));
  renderCategories();
}

// Standard: eingeklappt (true), wenn noch kein Wert explizit gesetzt wurde
function isCollapsed(id, map) {
  if (!map.has(id)) return true; // neu → standardmäßig eingeklappt
  return map.get(id);
}

function renderCategories() {
  const container = document.getElementById('category-blocks');
  container.innerHTML = '';

  if (questionBank.categories.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary)">Noch keine Kategorien. Füge eine hinzu oder importiere Fragen per MD.</p>';
    return;
  }

  questionBank.categories.forEach(cat => {
    const subcats = cat.subcategories || [];
    const catCollapsed = isCollapsed(cat.id, collapsedCats);
    const block = document.createElement('div');
    block.className = 'cat-block';
    block.dataset.catId = cat.id;

    block.innerHTML = `
      <div class="cat-header">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <button class="btn btn-secondary btn-sm cat-collapse-btn" data-collapse-id="${cat.id}" data-collapse-type="cat"
            onclick="collapsedCats.set('${cat.id}', !collapsedCats.get('${cat.id}')); renderCategories();"
            title="${catCollapsed ? 'Aufklappen' : 'Einklappen'}">${catCollapsed ? '▶' : '▼'}</button>
          <input class="cat-name-edit" type="text" value="${escHtml(cat.name)}"
            onchange="updateCatName('${cat.id}', this.value)"
            oninput="updateCatName('${cat.id}', this.value)">
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <span style="color:var(--text-secondary);font-size:0.85rem;">${subcats.length} Unterkat${subcats.length !== 1 ? 's' : ''}</span>
          <button class="btn btn-success btn-sm" onclick="addSubcategory('${cat.id}')">+ 1.Unterkat</button>
          <button class="btn btn-danger btn-sm" onclick="removeCat('${cat.id}')">✕</button>
        </div>
      </div>
    `;

    const subcatContainer = document.createElement('div');
    subcatContainer.style.paddingLeft = '1.5rem';
    subcatContainer.style.display = catCollapsed ? 'none' : '';

    if (subcats.length === 0) {
      subcatContainer.innerHTML = '<p style="color:var(--text-secondary);padding:0.8rem;font-size:0.9rem;">Keine Unterkategorien.</p>';
    } else {
      subcats.forEach(sub => renderSubBlock(sub, cat, subcatContainer));
    }

    block.appendChild(subcatContainer);
    container.appendChild(block);
  });
}

function renderSubBlock(sub, cat, container) {
  const subsubs = sub.subcategories || [];
  const hasSubsubs = subsubs.length > 0;
  const directQCount = (sub.questions || []).length;
  const subCollapsed = isCollapsed(sub.id, collapsedSubs);
  const missing = (!hasSubsubs && directQCount === 0) || (hasSubsubs)
    ? []
    : GameModel.DIFFICULTIES.filter(d => !(sub.questions || []).some(q => q.difficulty === d));

  const subBlock = document.createElement('div');
  subBlock.className = 'cat-block';
  subBlock.style.marginTop = '0.5rem';
  subBlock.style.marginBottom = '0.5rem';
  subBlock.dataset.subcatId = sub.id;

  subBlock.innerHTML = `
    <div class="cat-header" style="background:rgba(255,255,255,0.05);">
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button class="btn btn-secondary btn-sm cat-collapse-btn"
          onclick="collapsedSubs.set('${sub.id}', !collapsedSubs.get('${sub.id}')); renderCategories();"
          title="${subCollapsed ? 'Aufklappen' : 'Einklappen'}">${subCollapsed ? '▶' : '▼'}</button>
        <input class="cat-name-edit" type="text" value="${escHtml(sub.name)}"
          style="font-size:1rem;font-weight:600;"
          onchange="updateSubcatName('${cat.id}', '${sub.id}', this.value)"
          oninput="updateSubcatName('${cat.id}', '${sub.id}', this.value)">
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center;">
        ${!hasSubsubs && missing.length ? `<span class="warning-badge">⚠ ${missing.join(', ')} fehlt</span>` : (!hasSubsubs && directQCount > 0 ? '<span style="color:var(--success);font-size:0.85rem;">✓</span>' : '')}
        <button class="btn btn-success btn-sm" onclick="addSubSubcategory('${cat.id}', '${sub.id}')">+ 2.UK</button>
        <button class="btn btn-success btn-sm" onclick="openQuestionModal('${cat.id}', '${sub.id}')">+ Frage</button>
        <button class="btn btn-danger btn-sm" onclick="removeSubcategory('${cat.id}', '${sub.id}')">✕</button>
      </div>
    </div>
  `;

  const subBody = document.createElement('div');
  subBody.style.display = subCollapsed ? 'none' : '';

  if (!hasSubsubs || directQCount > 0) {
    renderQTable(subBody, sub.questions, cat.id, sub.id, null);
  }

  if (hasSubsubs) {
    const subsubContainer = document.createElement('div');
    subsubContainer.style.paddingLeft = '1.5rem';
    subsubs.forEach(subsub => renderSubSubBlock(subsub, sub, cat, subsubContainer));
    subBody.appendChild(subsubContainer);
  }

  subBlock.appendChild(subBody);
  container.appendChild(subBlock);
}

function renderSubSubBlock(subsub, sub, cat, container) {
  const l4s = subsub.subcategories || [];
  const hasL4 = l4s.length > 0;
  const directQCount = (subsub.questions || []).length;
  const subsubCollapsed = isCollapsed(subsub.id, collapsedSubsubs);
  const missing = hasL4 ? [] : GameModel.DIFFICULTIES.filter(
    d => !(subsub.questions || []).some(q => q.difficulty === d)
  );

  const subsubBlock = document.createElement('div');
  subsubBlock.className = 'cat-block';
  subsubBlock.style.marginTop = '0.5rem';
  subsubBlock.style.marginBottom = '0.5rem';
  subsubBlock.dataset.subsubcatId = subsub.id;

  subsubBlock.innerHTML = `
    <div class="cat-header" style="background:rgba(255,255,255,0.03);">
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button class="btn btn-secondary btn-sm cat-collapse-btn"
          onclick="collapsedSubsubs.set('${subsub.id}', !collapsedSubsubs.get('${subsub.id}')); renderCategories();"
          title="${subsubCollapsed ? 'Aufklappen' : 'Einklappen'}">${subsubCollapsed ? '▶' : '▼'}</button>
        <input class="cat-name-edit" type="text" value="${escHtml(subsub.name)}"
          style="font-size:0.95rem;font-weight:600;"
          onchange="updateSubSubcatName('${cat.id}', '${sub.id}', '${subsub.id}', this.value)"
          oninput="updateSubSubcatName('${cat.id}', '${sub.id}', '${subsub.id}', this.value)">
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center;">
        ${!hasL4 && missing.length ? `<span class="warning-badge">⚠ ${missing.join(', ')} fehlt</span>` : (!hasL4 && directQCount > 0 ? '<span style="color:var(--success);font-size:0.85rem;">✓</span>' : '')}
        <button class="btn btn-success btn-sm" onclick="addLevel4('${cat.id}', '${sub.id}', '${subsub.id}')">+ 3.UK</button>
        <button class="btn btn-success btn-sm" onclick="openQuestionModal('${cat.id}', '${sub.id}', null, '${subsub.id}')">+ Frage</button>
        <button class="btn btn-danger btn-sm" onclick="removeSubSubcategory('${cat.id}', '${sub.id}', '${subsub.id}')">✕</button>
      </div>
    </div>
  `;

  const subsubBody = document.createElement('div');
  subsubBody.style.display = subsubCollapsed ? 'none' : '';

  if (!hasL4 || directQCount > 0) {
    renderQTable(subsubBody, subsub.questions, cat.id, sub.id, subsub.id);
  }

  if (hasL4) {
    const l4Container = document.createElement('div');
    l4Container.style.paddingLeft = '1.5rem';
    l4s.forEach(l4 => {
      const l4Missing = GameModel.DIFFICULTIES.filter(
        d => !(l4.questions || []).some(q => q.difficulty === d)
      );
      const l4Block = document.createElement('div');
      l4Block.className = 'cat-block';
      l4Block.style.marginTop = '0.5rem';
      l4Block.style.marginBottom = '0.5rem';
      l4Block.innerHTML = `
        <div class="cat-header" style="background:rgba(255,255,255,0.02);">
          <input class="cat-name-edit" type="text" value="${escHtml(l4.name)}"
            style="font-size:0.9rem;font-weight:600;"
            onchange="updateLevel4Name('${cat.id}','${sub.id}','${subsub.id}','${l4.id}', this.value)"
            oninput="updateLevel4Name('${cat.id}','${sub.id}','${subsub.id}','${l4.id}', this.value)">
          <div style="display:flex;gap:0.5rem;align-items:center;">
            ${l4Missing.length ? `<span class="warning-badge">⚠ ${l4Missing.join(', ')} fehlt</span>` : '<span style="color:var(--success);font-size:0.85rem;">✓</span>'}
            <button class="btn btn-success btn-sm" onclick="openQuestionModal('${cat.id}','${sub.id}',null,'${subsub.id}','${l4.id}')">+ Frage</button>
            <button class="btn btn-danger btn-sm" onclick="removeLevel4('${cat.id}','${sub.id}','${subsub.id}','${l4.id}')">✕</button>
          </div>
        </div>
      `;
      renderQTable(l4Block, l4.questions, cat.id, sub.id, subsub.id, l4.id);
      l4Container.appendChild(l4Block);
    });
    subsubBody.appendChild(l4Container);
  }

  subsubBlock.appendChild(subsubBody);
  container.appendChild(subsubBlock);
}

async function addCategory() {
  const name = await showNameDialog('Kategoriename', 'z.B. Chemie');
  if (!name) return;
  questionBank.categories.push(GameModel.createCategory(name));
  await saveQuestions();
  renderCategories();
  showAlert('questions-alert', 'success', `Kategorie "${name}" hinzugefügt.`);
}

async function removeCat(catId) {
  if (!await showConfirmDialog('Kategorie und alle Unterkategorien/Fragen löschen?')) return;
  questionBank.categories = questionBank.categories.filter(c => c.id !== catId);
  await saveQuestions();
  renderCategories();
}

async function updateCatName(catId, val) {
  const cat = questionBank.categories.find(c => c.id === catId);
  if (cat) { cat.name = val; await saveQuestions(); }
}

async function addSubcategory(catId) {
  const name = await showNameDialog('Unterkategoriename', 'z.B. Atombau');
  if (!name) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  if (!cat.subcategories) cat.subcategories = [];
  cat.subcategories.push(GameModel.createSubcategory(name));
  await saveQuestions();
  renderCategories();
}

async function removeSubcategory(catId, subcatId) {
  if (!await showConfirmDialog('Unterkategorie und alle Fragen löschen?')) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.subcategories = (cat.subcategories || []).filter(s => s.id !== subcatId);
  await saveQuestions();
  renderCategories();
}

async function updateSubcatName(catId, subcatId, val) {
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subcatId);
  if (sub) { sub.name = val; await saveQuestions(); }
}

async function addSubSubcategory(catId, subId) {
  const name = await showNameDialog('2. Unterkategoriename', 'z.B. Elektronen');
  if (!name) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subId);
  if (!sub) return;
  if (!sub.subcategories) sub.subcategories = [];
  sub.subcategories.push(GameModel.createSubSubcategory(name));
  await saveQuestions();
  renderCategories();
}

async function removeSubSubcategory(catId, subId, subsubId) {
  if (!await showConfirmDialog('2. Unterkategorie und alle Fragen löschen?')) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subId);
  if (!sub) return;
  sub.subcategories = (sub.subcategories || []).filter(ss => ss.id !== subsubId);
  await saveQuestions();
  renderCategories();
}

async function updateSubSubcatName(catId, subId, subsubId, val) {
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subId);
  if (!sub) return;
  const ss = (sub.subcategories || []).find(ss => ss.id === subsubId);
  if (ss) { ss.name = val; await saveQuestions(); }
}

async function addLevel4(catId, subId, subsubId) {
  const name = await showNameDialog('3. Unterkategoriename', 'z.B. Schalen');
  if (!name) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subId);
  if (!sub) return;
  const ss = (sub.subcategories || []).find(ss => ss.id === subsubId);
  if (!ss) return;
  if (!ss.subcategories) ss.subcategories = [];
  ss.subcategories.push(GameModel.createLevel4(name));
  await saveQuestions();
  renderCategories();
}

async function removeLevel4(catId, subId, subsubId, l4Id) {
  if (!await showConfirmDialog('3. Unterkategorie und alle Fragen löschen?')) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subId);
  if (!sub) return;
  const ss = (sub.subcategories || []).find(ss => ss.id === subsubId);
  if (!ss) return;
  ss.subcategories = (ss.subcategories || []).filter(n => n.id !== l4Id);
  await saveQuestions();
  renderCategories();
}

async function updateLevel4Name(catId, subId, subsubId, l4Id, val) {
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subId);
  if (!sub) return;
  const ss = (sub.subcategories || []).find(ss => ss.id === subsubId);
  if (!ss) return;
  const l4 = (ss.subcategories || []).find(n => n.id === l4Id);
  if (l4) { l4.name = val; await saveQuestions(); }
}

async function removeQuestion(catId, subcatId, qId, subsubcatId, l4catId) {
  if (!await showConfirmDialog('Diese Frage löschen?')) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subcatId);
  if (!sub) return;
  let targetNode = sub;
  if (subsubcatId) {
    const ss = (sub.subcategories || []).find(ss => ss.id === subsubcatId);
    if (ss) {
      targetNode = ss;
      if (l4catId) {
        const l4 = (ss.subcategories || []).find(n => n.id === l4catId);
        if (l4) targetNode = l4;
      }
    }
  }
  targetNode.questions = (targetNode.questions || []).filter(q => q.id !== qId);
  await saveQuestions();
  renderCategories();
}

// ── Question Modal ────────────────────────────────────────────
function openQuestionModal(catId, subcatId, questionId, subsubcatId, l4catId) {
  editingCatId = catId;
  editingSubcatId = subcatId || null;
  editingSubsubcatId = subsubcatId || null;
  editingL4Id = l4catId || null;
  editingQuestionId = questionId || null;

  const catSel = document.getElementById('qm-cat');
  catSel.innerHTML = '';
  questionBank.categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (c.id === catId) opt.selected = true;
    catSel.appendChild(opt);
  });

  populateSubcatDropdown(catId, subcatId);
  populateSubSubcatDropdown(catId, subcatId, subsubcatId);
  populateL4Dropdown(catId, subcatId, subsubcatId, l4catId);

  if (questionId) {
    const foundQ = GameModel.findQuestion({ categories: questionBank.categories }, questionId);
    if (foundQ) {
      document.getElementById('q-modal-title').textContent = 'Frage bearbeiten';
      document.getElementById('qm-diff').value = foundQ.difficulty;
      document.getElementById('qm-type').value = foundQ.type;
      document.getElementById('qm-question').value = foundQ.question;
      document.getElementById('qm-answer').value = foundQ.answer;
      document.getElementById('qm-hint').value = foundQ.hint || '';
      renderMcOptions(foundQ.options, foundQ.correctIndex);
      updateQModalType(foundQ.type);
    }
  } else {
    document.getElementById('q-modal-title').textContent = 'Neue Frage';
    document.getElementById('qm-diff').value = '100';
    document.getElementById('qm-type').value = 'open';
    document.getElementById('qm-question').value = '';
    document.getElementById('qm-answer').value = '';
    document.getElementById('qm-hint').value = '';
    renderMcOptions(['', ''], null);
    updateQModalType('open');
  }

  showAlert('qm-alert', '', '');
  document.getElementById('q-modal').classList.add('open');
}

function populateSubcatDropdown(catId, selectedSubcatId) {
  const sel = document.getElementById('qm-subcat');
  sel.innerHTML = '';
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat || !cat.subcategories || cat.subcategories.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '– Keine Unterkategorien –';
    sel.appendChild(opt);
    populateSubSubcatDropdown(catId, null, null);
    return;
  }
  cat.subcategories.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (s.id === selectedSubcatId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateSubSubcatDropdown(catId, subcatId, selectedSubsubId) {
  const sel = document.getElementById('qm-subsubcat');
  sel.innerHTML = '<option value="">– Direkt –</option>';
  if (!subcatId) { populateL4Dropdown(catId, subcatId, null, null); return; }
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subcatId);
  if (!sub || !sub.subcategories || sub.subcategories.length === 0) { populateL4Dropdown(catId, subcatId, null, null); return; }
  sub.subcategories.forEach(ss => {
    const opt = document.createElement('option');
    opt.value = ss.id;
    opt.textContent = ss.name;
    if (ss.id === selectedSubsubId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateL4Dropdown(catId, subcatId, subsubId, selectedL4Id) {
  const sel = document.getElementById('qm-l4cat');
  sel.innerHTML = '<option value="">– Direkt –</option>';
  if (!subsubId) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  const sub = (cat.subcategories || []).find(s => s.id === subcatId);
  if (!sub) return;
  const ss = (sub.subcategories || []).find(ss => ss.id === subsubId);
  if (!ss || !ss.subcategories || ss.subcategories.length === 0) return;
  ss.subcategories.forEach(l4 => {
    const opt = document.createElement('option');
    opt.value = l4.id;
    opt.textContent = l4.name;
    if (l4.id === selectedL4Id) opt.selected = true;
    sel.appendChild(opt);
  });
}

function closeQuestionModal() {
  document.getElementById('q-modal').classList.remove('open');
  editingCatId = null;
  editingSubcatId = null;
  editingSubsubcatId = null;
  editingL4Id = null;
  editingQuestionId = null;
}

function updateQModalType(type) {
  document.getElementById('qm-open-section').style.display = type === 'open' ? '' : 'none';
  document.getElementById('qm-mc-section').style.display = type === 'mc' ? '' : 'none';
}

function renderMcOptions(options, correctIndex) {
  const container = document.getElementById('qm-mc-options');
  container.innerHTML = '';
  options.forEach((opt, i) => {
    const row = document.createElement('div');
    row.className = 'mc-option-row';
    row.innerHTML = `
      <input type="radio" name="mc-correct" value="${i}" ${correctIndex === i ? 'checked' : ''}>
      <input type="text" class="mc-opt-input" value="${escHtml(opt)}" placeholder="Option ${i + 1}"
        oninput="updateMcAnswerText()">
      <button class="btn btn-danger btn-sm" onclick="removeMcOption(${i})" ${options.length <= 2 ? 'disabled' : ''}>✕</button>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll('input[type="radio"]').forEach(r => {
    r.addEventListener('change', updateMcAnswerText);
  });
  updateMcAnswerText();
}

function addMcOption() {
  const opts = getMcOptions();
  opts.push('');
  const correctIdx = getCorrectMcIndex();
  renderMcOptions(opts, correctIdx);
}

function removeMcOption(idx) {
  const opts = getMcOptions();
  if (opts.length <= 2) return;
  const wasCorrect = getCorrectMcIndex() === idx;
  opts.splice(idx, 1);
  renderMcOptions(opts, wasCorrect ? 0 : getCorrectMcIndex());
}

function getMcOptions() {
  return [...document.querySelectorAll('#qm-mc-options .mc-opt-input')].map(i => i.value);
}

function getCorrectMcIndex() {
  const checked = document.querySelector('#qm-mc-options input[type="radio"]:checked');
  return checked ? parseInt(checked.value) : 0;
}

function updateMcAnswerText() {
  const opts = getMcOptions();
  const idx = getCorrectMcIndex();
  document.getElementById('qm-mc-answer-text').value = opts[idx] || '';
}

function findNodeForSave(catId, subcatId, subsubcatId, l4catId) {
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return null;
  const sub = (cat.subcategories || []).find(s => s.id === subcatId);
  if (!sub) return null;
  if (!subsubcatId) return sub;
  const ss = (sub.subcategories || []).find(ss => ss.id === subsubcatId);
  if (!ss) return null;
  if (!l4catId) return ss;
  return (ss.subcategories || []).find(n => n.id === l4catId) || null;
}

function findNodeContainingQuestion(qId) {
  for (const c of questionBank.categories) {
    const result = GameModel._findNodeWithQuestion(c, qId);
    if (result) return result;
  }
  return null;
}

async function saveQuestion() {
  const catId = document.getElementById('qm-cat').value;
  const subcatId = document.getElementById('qm-subcat').value;
  const subsubcatId = document.getElementById('qm-subsubcat').value;
  const l4catId = document.getElementById('qm-l4cat').value;
  const type = document.getElementById('qm-type').value;
  const diff = parseInt(document.getElementById('qm-diff').value);
  const qText = document.getElementById('qm-question').value.trim();
  const hint = document.getElementById('qm-hint').value.trim();

  let answer = '';
  let options = [];
  let correctIndex = null;

  if (!qText) { showAlert('qm-alert', 'danger', 'Bitte Fragetext eingeben.'); return; }
  if (!subcatId) { showAlert('qm-alert', 'danger', 'Bitte Unterkategorie wählen.'); return; }

  if (type === 'open') {
    answer = document.getElementById('qm-answer').value.trim();
    if (!answer) { showAlert('qm-alert', 'danger', 'Bitte Antwort eingeben.'); return; }
  } else {
    options = getMcOptions();
    correctIndex = getCorrectMcIndex();
    answer = options[correctIndex] || '';
    if (options.length < 2) { showAlert('qm-alert', 'danger', 'Mindestens 2 Optionen erforderlich.'); return; }
    if (!answer) { showAlert('qm-alert', 'danger', 'Bitte korrekte Antwort markieren und Text eingeben.'); return; }
  }

  const targetNode = findNodeForSave(catId, subcatId, subsubcatId || null, l4catId || null);
  if (!targetNode) { showAlert('qm-alert', 'danger', 'Zielknoten nicht gefunden.'); return; }

  if (editingQuestionId) {
    // Alten Knoten finden: rekursiv durch alle Kategorien
    let oldNode = null;
    outer: for (const c of questionBank.categories) {
      for (const s of (c.subcategories || [])) {
        const found = findNodeWithQuestion(s, editingQuestionId);
        if (found) { oldNode = found; break outer; }
      }
    }

    if (oldNode) {
      const q = (oldNode.questions || []).find(q => q.id === editingQuestionId);
      if (oldNode !== targetNode) {
        oldNode.questions = (oldNode.questions || []).filter(q => q.id !== editingQuestionId);
        if (q) {
          q.difficulty = diff; q.type = type; q.question = qText;
          q.answer = answer; q.options = options; q.correctIndex = correctIndex; q.hint = hint;
          if (!targetNode.questions) targetNode.questions = [];
          targetNode.questions.push(q);
        } else {
          if (!targetNode.questions) targetNode.questions = [];
          targetNode.questions.push(GameModel.createQuestion({ difficulty: diff, type, question: qText, answer, options, correctIndex, hint }));
        }
      } else {
        if (q) {
          q.difficulty = diff; q.type = type; q.question = qText;
          q.answer = answer; q.options = options; q.correctIndex = correctIndex; q.hint = hint;
        }
      }
    }
  } else {
    if (!targetNode.questions) targetNode.questions = [];
    targetNode.questions.push(GameModel.createQuestion({ difficulty: diff, type, question: qText, answer, options, correctIndex, hint }));
  }

  await saveQuestions();
  renderCategories();
  closeQuestionModal();
}

function findNodeWithQuestion(node, qId) {
  if ((node.questions || []).some(q => q.id === qId)) return node;
  for (const child of (node.subcategories || [])) {
    const found = findNodeWithQuestion(child, qId);
    if (found) return found;
  }
  return null;
}

// ── MD Import ─────────────────────────────────────────────────
function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      importParsed = MDParser.parse(e.target.result);
      showImportPreview();
    } catch (err) {
      showAlert('questions-alert', 'danger', 'Fehler beim Parsen: ' + err.message);
      switchTab('tab-questions');
    }
  };
  reader.readAsText(file);
}

function showImportPreview() {
  const validation = MDParser.validate(importParsed);
  const previewEl = document.getElementById('import-preview');
  const titleEl = document.getElementById('import-title-preview');
  const listEl = document.getElementById('import-validation-list');
  const contentEl = document.getElementById('import-content-preview');

  const totalQ = importParsed.categories.reduce((s, c) => s + c.questions.length, 0);
  titleEl.textContent = `${importParsed.categories.length} Abschnitt${importParsed.categories.length !== 1 ? 'e' : ''}, ${totalQ} Fragen erkannt`;
  listEl.innerHTML = '';

  validation.errors.forEach(e => addValidationItem(listEl, 'error', '✕ ' + e));
  validation.warnings.forEach(w => addValidationItem(listEl, 'warn', '⚠ ' + w));
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    addValidationItem(listEl, 'ok', '✓ Keine Probleme gefunden');
  }

  const catOpts = questionBank.categories.map(c =>
    `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`
  ).join('');

  const selectStyle = 'padding:0.35rem 0.6rem;background:var(--input-bg,rgba(255,255,255,0.08));border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-family:inherit;font-size:0.85rem;';

  let html = '<div style="display:flex;flex-direction:column;gap:0.5rem;">';
  importParsed.categories.forEach((sub, idx) => {
    const subName = sub.name || '(unbenannt)';
    const diffs = sub.questions.map(q =>
      `<span class="diff-badge diff-${q.difficulty}" style="margin:0 1px;">${q.difficulty}</span>`
    ).join('');

    html += `<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:0.8rem;padding:0.7rem 1rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--border);">`;
    html += `<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;min-width:0;">`;
    html += `<strong style="white-space:nowrap;">${escHtml(subName)}</strong>`;
    html += `<span>${diffs || '<em style="opacity:.5">leer</em>'}</span>`;
    html += `</div>`;
    html += `<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;justify-content:flex-end;">`;
    html += `<span style="color:var(--text-secondary);font-size:0.85rem;">→ Hauptkat:</span>`;
    html += `<select id="import-cat-map-${idx}" style="${selectStyle}" onchange="updateImportSubcatDropdown(${idx}, this.value)">`;
    html += `<option value="">+ Neu</option>${catOpts}`;
    html += `</select>`;
    html += `<span style="color:var(--text-secondary);font-size:0.85rem;">1.Unterkat:</span>`;
    html += `<select id="import-subcat-map-${idx}" style="${selectStyle}">`;
    html += `<option value="">– Als 1.Unterkat –</option>`;
    html += `</select>`;
    html += `</div>`;
    html += `</div>`;
  });
  html += '</div>';

  contentEl.innerHTML = html;
  document.getElementById('btn-import-confirm').disabled = validation.errors.length > 0;
  previewEl.style.display = 'block';
}

function updateImportSubcatDropdown(idx, catId) {
  const sel = document.getElementById(`import-subcat-map-${idx}`);
  if (!sel) return;
  sel.innerHTML = '<option value="">– Als 1.Unterkat –</option>';
  if (!catId) return;
  const cat = questionBank.categories.find(c => c.id === catId);
  if (!cat) return;
  (cat.subcategories || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
}

function addValidationItem(list, type, text) {
  const li = document.createElement('li');
  li.className = type;
  li.textContent = text;
  list.appendChild(li);
}

async function doImport() {
  if (!importParsed) return;

  let newCats = 0, newSubs = 0, newSubsubs = 0, newQs = 0;

  for (let i = 0; i < importParsed.categories.length; i++) {
    const importSub = importParsed.categories[i];
    const catSel = document.getElementById(`import-cat-map-${i}`);
    const subcatSel = document.getElementById(`import-subcat-map-${i}`);
    const targetCatId = catSel ? catSel.value : '';
    const targetSubcatId = subcatSel ? subcatSel.value : '';

    let targetCat;
    if (!targetCatId) {
      const newName = importSub.name || 'Importierte Kategorie';
      targetCat = GameModel.createCategory(newName);
      questionBank.categories.push(targetCat);
      newCats++;
    } else {
      targetCat = questionBank.categories.find(c => c.id === targetCatId);
      if (!targetCat) continue;
    }

    if (!targetCat.subcategories) targetCat.subcategories = [];

    if (targetSubcatId) {
      // Abschnitt als 2.Unterkat unter gewählter 1.Unterkat einfügen
      const targetSub = targetCat.subcategories.find(s => s.id === targetSubcatId);
      if (!targetSub) continue;
      if (!targetSub.subcategories) targetSub.subcategories = [];
      let subsub = targetSub.subcategories.find(ss =>
        ss.name.toLowerCase() === (importSub.name || '').toLowerCase()
      );
      if (!subsub) {
        subsub = GameModel.createSubSubcategory(importSub.name || 'Standard');
        targetSub.subcategories.push(subsub);
        newSubsubs++;
      }
      (importSub.questions || []).forEach(q => {
        subsub.questions.push(Object.assign({}, q, {
          id: 'q-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
        }));
        newQs++;
      });
    } else {
      // Abschnitt als 1.Unterkat (bisheriges Verhalten)
      let sub = targetCat.subcategories.find(s =>
        s.name.toLowerCase() === (importSub.name || '').toLowerCase()
      );
      if (!sub) {
        sub = GameModel.createSubcategory(importSub.name || 'Standard');
        targetCat.subcategories.push(sub);
        newSubs++;
      }
      (importSub.questions || []).forEach(q => {
        sub.questions.push(Object.assign({}, q, {
          id: 'q-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
        }));
        newQs++;
      });
    }
  }

  await saveQuestions();
  renderAll();
  cancelImport();
  const parts = [];
  if (newCats > 0) parts.push(`${newCats} neue Hauptkategorie${newCats !== 1 ? 'n' : ''}`);
  if (newSubs > 0) parts.push(`${newSubs} 1.Unterkategorie${newSubs !== 1 ? 'n' : ''}`);
  if (newSubsubs > 0) parts.push(`${newSubsubs} 2.Unterkategorie${newSubsubs !== 1 ? 'n' : ''}`);
  parts.push(`${newQs} Frage${newQs !== 1 ? 'n' : ''}`);
  showAlert('questions-alert', 'success', `Import erfolgreich! ${parts.join(', ')} hinzugefügt.`);
  switchTab('tab-questions');
}

function cancelImport() {
  importParsed = null;
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('import-file').value = '';
}

// ── Save tab ──────────────────────────────────────────────────
function validateGame() {
  const merged = { ...currentGame, categories: questionBank.categories };
  const result = GameModel.validate(merged);
  const el = document.getElementById('validate-result');
  if (result.errors.length === 0 && result.warnings.length === 0) {
    el.innerHTML = '<div class="alert alert-success">✓ Spiel ist bereit. Keine Probleme gefunden.</div>';
  } else {
    let html = '';
    if (result.errors.length > 0) {
      html += '<div class="alert alert-danger"><strong>Fehler:</strong><ul style="margin-top:0.4rem;padding-left:1.2rem;">';
      result.errors.forEach(e => html += `<li>${escHtml(e)}</li>`);
      html += '</ul></div>';
    }
    if (result.warnings.length > 0) {
      html += '<div class="alert alert-warning"><strong>Warnungen:</strong><ul style="margin-top:0.4rem;padding-left:1.2rem;">';
      result.warnings.forEach(w => html += `<li>${escHtml(w)}</li>`);
      html += '</ul></div>';
    }
    el.innerHTML = html;
  }
}

// ── Tab switching ─────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
}

// ── Styled Dialogs ────────────────────────────────────────────
function showNameDialog(title, placeholder) {
  return new Promise(resolve => {
    const dialog     = document.getElementById('name-dialog');
    const titleEl    = document.getElementById('nd-title');
    const input      = document.getElementById('nd-input');
    const cancelBtn  = document.getElementById('nd-cancel');
    const confirmBtn = document.getElementById('nd-confirm');

    titleEl.textContent  = title;
    input.value          = '';
    input.placeholder    = placeholder || '';
    dialog.style.display = 'flex';
    setTimeout(() => input.focus(), 50);

    function cleanup() {
      dialog.style.display = 'none';
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      input.removeEventListener('keydown', onKeydown);
    }
    function onConfirm() { const v = input.value.trim(); cleanup(); resolve(v || null); }
    function onCancel()  { cleanup(); resolve(null); }
    function onKeydown(e) {
      if (e.key === 'Enter')  onConfirm();
      if (e.key === 'Escape') onCancel();
    }
    cancelBtn.addEventListener('click',  onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    input.addEventListener('keydown', onKeydown);
  });
}

function showConfirmDialog(message) {
  return new Promise(resolve => {
    const dialog     = document.getElementById('confirm-dialog');
    const msgEl      = document.getElementById('cd-message');
    const cancelBtn  = document.getElementById('cd-cancel');
    const confirmBtn = document.getElementById('cd-confirm');

    msgEl.textContent    = message;
    dialog.style.display = 'flex';

    function cleanup() {
      dialog.style.display = 'none';
      cancelBtn.removeEventListener('click',  onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
    }
    function onConfirm() { cleanup(); resolve(true); }
    function onCancel()  { cleanup(); resolve(false); }
    cancelBtn.addEventListener('click',  onCancel);
    confirmBtn.addEventListener('click', onConfirm);
  });
}

// ── Utilities ─────────────────────────────────────────────────
function showAlert(containerId, type, msg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!msg) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="alert alert-${type}">${escHtml(msg)}</div>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Event Binding ─────────────────────────────────────────────
let _eventsBound = false;
function bindEvents() {
  if (_eventsBound) return;
  _eventsBound = true;
  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  document.getElementById('s-capital').addEventListener('input', function () {
    document.getElementById('s-capital-val').textContent = this.value;
  });
  document.getElementById('s-timer-sec').addEventListener('input', function () {
    document.getElementById('s-timer-sec-val').textContent = this.value + ' s';
  });
  ['s-timer-on', 's-negative', 's-show-answer', 's-steal-mode'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateToggleLabels);
  });

  // Questions
  document.getElementById('btn-add-cat').addEventListener('click', addCategory);

  // Question modal
  document.getElementById('btn-qm-cancel').addEventListener('click', closeQuestionModal);
  document.getElementById('btn-qm-save').addEventListener('click', saveQuestion);
  document.getElementById('btn-add-mc-option').addEventListener('click', addMcOption);
  document.getElementById('qm-type').addEventListener('change', function () {
    updateQModalType(this.value);
  });
  document.getElementById('qm-cat').addEventListener('change', function () {
    populateSubcatDropdown(this.value, null);
    populateSubSubcatDropdown(this.value, null, null);
    populateL4Dropdown(this.value, null, null, null);
  });
  document.getElementById('qm-subcat').addEventListener('change', function () {
    const catId = document.getElementById('qm-cat').value;
    populateSubSubcatDropdown(catId, this.value, null);
    populateL4Dropdown(catId, this.value, null, null);
  });
  document.getElementById('qm-subsubcat').addEventListener('change', function () {
    const catId = document.getElementById('qm-cat').value;
    const subcatId = document.getElementById('qm-subcat').value;
    populateL4Dropdown(catId, subcatId, this.value, null);
  });

  document.getElementById('q-modal').addEventListener('click', function (e) {
    if (e.target === this) closeQuestionModal();
  });

  // Import
  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('click', () => document.getElementById('import-file').click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleImportFile(e.dataTransfer.files[0]);
  });
  document.getElementById('import-file').addEventListener('change', function () {
    handleImportFile(this.files[0]);
  });
  document.getElementById('btn-import-confirm').addEventListener('click', doImport);
  document.getElementById('btn-import-cancel').addEventListener('click', cancelImport);

  // Save tab
  document.getElementById('btn-validate').addEventListener('click', validateGame);

  document.getElementById('btn-save-questions').addEventListener('click', async () => {
    const ok = await saveQuestions();
    if (ok) {
      showAlert('save-alert', 'success', 'Fragen gespeichert (lokal + Server).');
    } else if (!StorageManager._hasServer()) {
      showAlert('save-alert', 'success', 'Fragen gespeichert (Dateimodus – nur auf diesem Gerät).');
    } else {
      showAlert('save-alert', 'warning', 'Fragen lokal gespeichert, aber Server-Speichern fehlgeschlagen. Auf anderen Geräten nicht verfügbar.');
    }
  });
  document.getElementById('btn-save-gamestate').addEventListener('click', async () => {
    await saveGame();
    showAlert('save-alert', 'success', 'Einstellungen gespeichert.');
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    StorageManager.exportToFile(questionBank, 'risiko-quiz-fragen.json');
  });
  document.getElementById('btn-export-md').addEventListener('click', () => {
    const md = MDParser.toMarkdown(questionBank);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'risiko-quiz-fragen.md';
    a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('btn-load-json').addEventListener('click', () =>
    document.getElementById('load-json-file').click()
  );
  document.getElementById('load-json-file').addEventListener('change', async function () {
    try {
      const data = await StorageManager.importFromFile(this.files[0]);
      if (!data.categories) { showAlert('save-alert', 'danger', 'Ungültige Fragen-Datei (kein "categories"-Feld).'); return; }
      questionBank = data;
      const ok = await saveQuestions();
      renderCategories();
      if (ok) {
        showAlert('save-alert', 'success', `Fragen geladen: ${data.categories.length} Kategorien (lokal + Server gespeichert).`);
      } else if (!StorageManager._hasServer()) {
        showAlert('save-alert', 'success', `Fragen geladen: ${data.categories.length} Kategorien (Dateimodus – nur auf diesem Gerät).`);
      } else {
        showAlert('save-alert', 'warning', `Fragen geladen: ${data.categories.length} Kategorien – Server-Speichern fehlgeschlagen. Auf anderen Geräten nicht verfügbar.`);
      }
      switchTab('tab-questions');
    } catch (e) {
      showAlert('save-alert', 'danger', 'Fehler: ' + e.message);
    }
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeQuestionModal();
  });
}

// ── Start ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-gs-create').addEventListener('click', createNewGame);
  init();
});
