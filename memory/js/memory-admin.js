// memory-admin.js – Admin-Logik für Memory-Spiel

let pairsData = null;
let selectedCatId = null;
let importedCategories = null;

// ── Init ────────────────────────────────────────────────────
async function init() {
  pairsData = await MemoryStorageManager.loadPairs();
  renderCategories();
  populateCatSelect();
}

// ── Tabs ────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.tab-btn[onclick*="' + name + '"]').classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

// ── Kategorien ──────────────────────────────────────────────
function renderCategories() {
  const list = document.getElementById('admin-cat-list');
  list.innerHTML = '';

  for (const cat of pairsData.categories) {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML =
      '<span class="cat-name">' + escHtml(cat.name) + '</span>' +
      '<span class="cat-count">' + cat.pairs.length + ' Paare</span>' +
      '<button class="btn btn-secondary btn-sm" onclick="renameCategory(\'' + cat.id + '\')">&#9998;</button>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteCategory(\'' + cat.id + '\')">&#10005;</button>';
    list.appendChild(row);
  }
}

function addCategory() {
  const input = document.getElementById('new-cat-name');
  const name = input.value.trim();
  if (!name) return;

  const cat = MemoryModel.createCategory(name);
  pairsData.categories.push(cat);
  input.value = '';

  renderCategories();
  populateCatSelect();
  autoSave();
}

function renameCategory(id) {
  const cat = pairsData.categories.find(c => c.id === id);
  if (!cat) return;
  const newName = prompt('Kategorie umbenennen:', cat.name);
  if (newName && newName.trim()) {
    cat.name = newName.trim();
    renderCategories();
    populateCatSelect();
    autoSave();
  }
}

function deleteCategory(id) {
  const cat = pairsData.categories.find(c => c.id === id);
  if (!cat) return;
  if (!confirm('Kategorie "' + cat.name + '" mit ' + cat.pairs.length + ' Paaren löschen?')) return;

  pairsData.categories = pairsData.categories.filter(c => c.id !== id);
  if (selectedCatId === id) {
    selectedCatId = null;
    document.getElementById('pair-cat-select').value = '';
    document.getElementById('pair-list').innerHTML = '';
    document.getElementById('btn-add-pair').style.display = 'none';
    document.getElementById('btn-save-pairs').style.display = 'none';
  }

  renderCategories();
  populateCatSelect();
  autoSave();
}

// ── Pair Category Selector ──────────────────────────────────
function populateCatSelect() {
  const sel = document.getElementById('pair-cat-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">– Kategorie wählen –</option>';

  for (const cat of pairsData.categories) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name + ' (' + cat.pairs.length + ')';
    sel.appendChild(opt);
  }

  if (current && pairsData.categories.find(c => c.id === current)) {
    sel.value = current;
  }
}

function selectPairCategory() {
  selectedCatId = document.getElementById('pair-cat-select').value || null;
  renderPairs();
}

// ── Pair Editor ─────────────────────────────────────────────
function renderPairs() {
  const list = document.getElementById('pair-list');
  const addBtn = document.getElementById('btn-add-pair');
  const saveBtn = document.getElementById('btn-save-pairs');

  if (!selectedCatId) {
    list.innerHTML = '';
    addBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    return;
  }

  const cat = pairsData.categories.find(c => c.id === selectedCatId);
  if (!cat) return;

  addBtn.style.display = 'inline-block';
  saveBtn.style.display = 'inline-block';
  list.innerHTML = '';

  cat.pairs.forEach(function (pair, idx) {
    const card = document.createElement('div');
    card.className = 'pair-card';
    card.innerHTML =
      '<div class="pair-sides">' +
        buildSideEditor('A', pair.sideA, idx) +
        buildSideEditor('B', pair.sideB, idx) +
      '</div>' +
      '<div class="pair-footer">' +
        '<label style="font-size:0.8rem;color:var(--text-secondary);">Schwierigkeit: ' +
          '<select onchange="updateDifficulty(' + idx + ', this.value)">' +
            '<option value="1"' + (pair.difficulty === 1 ? ' selected' : '') + '>Leicht</option>' +
            '<option value="2"' + (pair.difficulty === 2 ? ' selected' : '') + '>Mittel</option>' +
            '<option value="3"' + (pair.difficulty === 3 ? ' selected' : '') + '>Schwer</option>' +
          '</select>' +
        '</label>' +
        '<button class="btn btn-danger btn-sm" onclick="deletePair(' + idx + ')">Löschen</button>' +
      '</div>';
    list.appendChild(card);

    // Live-Previews rendern
    renderPreview('A', pair.sideA, idx);
    renderPreview('B', pair.sideB, idx);
  });
}

function buildSideEditor(side, data, idx) {
  return '<div class="side-editor">' +
    '<h4>Seite ' + side + '</h4>' +
    '<select onchange="updateType(' + idx + ', \'' + side + '\', this.value)">' +
      '<option value="text"' + (data.type === 'text' ? ' selected' : '') + '>Text</option>' +
      '<option value="formula"' + (data.type === 'formula' ? ' selected' : '') + '>Formel (LaTeX)</option>' +
      '<option value="image"' + (data.type === 'image' ? ' selected' : '') + '>Bild (URL/Pfad)</option>' +
    '</select>' +
    '<input type="text" value="' + escAttr(data.content) + '" ' +
      'oninput="updateContent(' + idx + ', \'' + side + '\', this.value)" ' +
      'placeholder="Inhalt…">' +
    '<div class="side-preview" id="preview-' + idx + '-' + side + '"></div>' +
  '</div>';
}

function renderPreview(side, data, idx) {
  const el = document.getElementById('preview-' + idx + '-' + side);
  if (!el) return;
  el.innerHTML = '';

  if (data.type === 'formula' && data.content) {
    try {
      katex.render(data.content, el, { throwOnError: false, displayMode: false });
    } catch {
      el.textContent = data.content;
    }
  } else if (data.type === 'image' && data.content) {
    var img = document.createElement('img');
    img.src = data.content;
    img.style.maxHeight = '50px';
    img.style.maxWidth = '100%';
    el.appendChild(img);
  } else {
    el.textContent = data.content || '–';
  }
}

function updateType(idx, side, type) {
  const cat = pairsData.categories.find(c => c.id === selectedCatId);
  if (!cat) return;
  const key = side === 'A' ? 'sideA' : 'sideB';
  cat.pairs[idx][key].type = type;
  renderPreview(side, cat.pairs[idx][key], idx);
}

function updateContent(idx, side, content) {
  const cat = pairsData.categories.find(c => c.id === selectedCatId);
  if (!cat) return;
  const key = side === 'A' ? 'sideA' : 'sideB';
  cat.pairs[idx][key].content = content;
  renderPreview(side, cat.pairs[idx][key], idx);
}

function updateDifficulty(idx, val) {
  const cat = pairsData.categories.find(c => c.id === selectedCatId);
  if (cat) cat.pairs[idx].difficulty = parseInt(val);
}

function addPair() {
  const cat = pairsData.categories.find(c => c.id === selectedCatId);
  if (!cat) return;
  const pair = MemoryModel.createPair(
    { type: 'text', content: '' },
    { type: 'text', content: '' },
    1
  );
  cat.pairs.push(pair);
  renderPairs();
  populateCatSelect();
}

function deletePair(idx) {
  const cat = pairsData.categories.find(c => c.id === selectedCatId);
  if (!cat) return;
  cat.pairs.splice(idx, 1);
  renderPairs();
  populateCatSelect();
}

async function savePairs() {
  const status = document.getElementById('save-status');
  status.className = 'save-status';
  status.style.display = 'none';

  try {
    await MemoryStorageManager.savePairs(pairsData);
    status.className = 'save-status success';
    status.textContent = 'Gespeichert!';
    populateCatSelect();
    setTimeout(function () { status.style.display = 'none'; }, 2000);
  } catch (err) {
    status.className = 'save-status error';
    status.textContent = 'Fehler: ' + err.message;
  }
}

async function autoSave() {
  await MemoryStorageManager.savePairs(pairsData);
}

// ── MD-Import ───────────────────────────────────────────────
function previewImport() {
  const text = document.getElementById('import-textarea').value;
  const preview = document.getElementById('import-preview');
  const confirmBtn = document.getElementById('btn-confirm-import');

  importedCategories = MemoryMDParser.parse(text);

  if (importedCategories.length === 0) {
    preview.style.display = 'block';
    preview.innerHTML = '<p style="color:var(--text-secondary);">Keine Kategorien erkannt. Überprüfe das Format.</p>';
    confirmBtn.style.display = 'none';
    return;
  }

  preview.style.display = 'block';
  confirmBtn.style.display = 'inline-block';
  preview.innerHTML = '';

  for (const cat of importedCategories) {
    const div = document.createElement('div');
    div.className = 'import-cat';
    var html = '<h4>' + escHtml(cat.name) + ' (' + cat.pairs.length + ' Paare)</h4>';
    for (const pair of cat.pairs) {
      html += '<div class="import-pair">';
      html += '<span>' + pair.sideA.type + ': ' + escHtml(pair.sideA.content) + '</span>';
      html += ' ↔ ';
      html += '<span>' + pair.sideB.type + ': ' + escHtml(pair.sideB.content) + '</span>';
      if (pair.difficulty > 1) html += ' <small>(Schwierigkeit ' + pair.difficulty + ')</small>';
      html += '</div>';
    }
    div.innerHTML = html;
    preview.appendChild(div);
  }
}

async function confirmImport() {
  if (!importedCategories || importedCategories.length === 0) return;

  const status = document.getElementById('import-status');

  // Importierte Kategorien hinzufügen (oder zu bestehenden mit gleichem Namen mergen)
  for (const imported of importedCategories) {
    const existing = pairsData.categories.find(c => c.name === imported.name);
    if (existing) {
      existing.pairs = existing.pairs.concat(imported.pairs);
    } else {
      pairsData.categories.push(imported);
    }
  }

  try {
    await MemoryStorageManager.savePairs(pairsData);
    status.className = 'save-status success';
    status.textContent = importedCategories.length + ' Kategorie(n) importiert!';

    // UI aufräumen
    document.getElementById('import-textarea').value = '';
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('btn-confirm-import').style.display = 'none';
    importedCategories = null;

    renderCategories();
    populateCatSelect();
    setTimeout(function () { status.style.display = 'none'; }, 3000);
  } catch (err) {
    status.className = 'save-status error';
    status.textContent = 'Fehler: ' + err.message;
  }
}

// ── Utility ─────────────────────────────────────────────────
function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Start ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
