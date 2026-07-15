// admin.js – Begriffsverwaltung für Just One

let wordlistData = null;
let selectedCatId = null;
let selectedSubcatId = null;
let importedCategories = null;

// ── Init ────────────────────────────────────────────────────
async function init() {
  wordlistData = await JoWordlistStorage.load();
  renderCatTree();
  populateWordCatSelect();
}

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  loadFileIntoTextarea(file);
}

function handleImportDrop(event) {
  event.preventDefault();
  document.getElementById('import-textarea').style.borderColor = '';
  const file = event.dataTransfer.files[0];
  if (!file) return;
  loadFileIntoTextarea(file);
}

function loadFileIntoTextarea(file) {
  const reader = new FileReader();
  reader.onload = function (ev) {
    document.getElementById('import-textarea').value = ev.target.result;
    document.getElementById('import-filename').textContent = file.name;
  };
  reader.readAsText(file, 'UTF-8');
}

// ── Tabs ────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.tab-btn[onclick*="' + name + '"]').classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

// ── Kategoriebaum ───────────────────────────────────────────
function renderCatTree() {
  const tree = document.getElementById('admin-cat-tree');
  tree.innerHTML = '';

  for (const cat of wordlistData.categories) {
    const block = document.createElement('div');
    block.className = 'cat-block';

    let html =
      '<div class="cat-row">' +
        '<span class="cat-name">' + escHtml(cat.name) + '</span>' +
        '<span class="cat-count">' + JoWordlistModel.countWords(cat) + ' Begriffe</span>' +
        '<button class="btn btn-secondary btn-sm" onclick="renameCategory(\'' + cat.id + '\')">&#9998;</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="addSubcategory(\'' + cat.id + '\')">+ Unterkategorie</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteCategory(\'' + cat.id + '\')">&#10005;</button>' +
      '</div>';

    if (cat.subcategories.length) {
      html += '<div class="subcat-list">';
      for (const sub of cat.subcategories) {
        html +=
          '<div class="subcat-row">' +
            '<span class="subcat-name">' + escHtml(sub.name) + '</span>' +
            '<span class="subcat-count">' + sub.words.length + ' Begriffe</span>' +
            '<button class="btn btn-secondary btn-sm" onclick="renameSubcategory(\'' + cat.id + '\',\'' + sub.id + '\')">&#9998;</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteSubcategory(\'' + cat.id + '\',\'' + sub.id + '\')">&#10005;</button>' +
          '</div>';
      }
      html += '</div>';
    }

    block.innerHTML = html;
    tree.appendChild(block);
  }
}

function addCategory() {
  const input = document.getElementById('new-cat-name');
  const name = input.value.trim();
  if (!name) return;

  wordlistData.categories.push(JoWordlistModel.createCategory(name));
  input.value = '';

  renderCatTree();
  populateWordCatSelect();
  autoSave();
}

function renameCategory(id) {
  const cat = wordlistData.categories.find(c => c.id === id);
  if (!cat) return;
  const newName = prompt('Kategorie umbenennen:', cat.name);
  if (newName && newName.trim()) {
    cat.name = newName.trim();
    renderCatTree();
    populateWordCatSelect();
    autoSave();
  }
}

function deleteCategory(id) {
  const cat = wordlistData.categories.find(c => c.id === id);
  if (!cat) return;
  const count = JoWordlistModel.countWords(cat);
  if (!confirm('Kategorie "' + cat.name + '" mit ' + count + ' Begriffen löschen?')) return;

  wordlistData.categories = wordlistData.categories.filter(c => c.id !== id);
  if (selectedCatId === id) { selectedCatId = null; selectedSubcatId = null; }

  renderCatTree();
  populateWordCatSelect();
  renderWordEditor();
  autoSave();
}

function addSubcategory(catId) {
  const cat = wordlistData.categories.find(c => c.id === catId);
  if (!cat) return;
  const name = prompt('Name der neuen Unterkategorie:');
  if (!name || !name.trim()) return;

  cat.subcategories.push(JoWordlistModel.createSubcategory(name.trim()));
  renderCatTree();
  populateWordCatSelect();
  autoSave();
}

function renameSubcategory(catId, subId) {
  const cat = wordlistData.categories.find(c => c.id === catId);
  const sub = cat && cat.subcategories.find(s => s.id === subId);
  if (!sub) return;
  const newName = prompt('Unterkategorie umbenennen:', sub.name);
  if (newName && newName.trim()) {
    sub.name = newName.trim();
    renderCatTree();
    populateWordCatSelect();
    autoSave();
  }
}

function deleteSubcategory(catId, subId) {
  const cat = wordlistData.categories.find(c => c.id === catId);
  const sub = cat && cat.subcategories.find(s => s.id === subId);
  if (!sub) return;
  if (!confirm('Unterkategorie "' + sub.name + '" mit ' + sub.words.length + ' Begriffen löschen?')) return;

  cat.subcategories = cat.subcategories.filter(s => s.id !== subId);
  if (selectedSubcatId === subId) selectedSubcatId = null;

  renderCatTree();
  populateWordCatSelect();
  renderWordEditor();
  autoSave();
}

async function autoSave() {
  await JoWordlistStorage.save(wordlistData);
}

// ── Begriffe-Editor ─────────────────────────────────────────
function populateWordCatSelect() {
  const sel = document.getElementById('word-cat-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">– Kategorie wählen –</option>';

  for (const cat of wordlistData.categories) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    sel.appendChild(opt);
  }

  if (current && wordlistData.categories.find(c => c.id === current)) {
    sel.value = current;
  }
  onWordCatChange();
}

function onWordCatChange() {
  selectedCatId = document.getElementById('word-cat-select').value || null;
  selectedSubcatId = null;

  const subSel = document.getElementById('word-subcat-select');
  subSel.innerHTML = '<option value="">– Unterkategorie wählen –</option>';

  const cat = wordlistData.categories.find(c => c.id === selectedCatId);
  if (cat) {
    subSel.disabled = false;
    for (const sub of cat.subcategories) {
      const opt = document.createElement('option');
      opt.value = sub.id;
      opt.textContent = sub.name + ' (' + sub.words.length + ')';
      subSel.appendChild(opt);
    }
  } else {
    subSel.disabled = true;
  }

  renderWordEditor();
}

function renderWordEditor() {
  selectedSubcatId = document.getElementById('word-subcat-select').value || null;
  const textarea = document.getElementById('word-textarea');
  const saveBtn = document.getElementById('btn-save-words');
  const countEl = document.getElementById('word-count');

  const cat = wordlistData.categories.find(c => c.id === selectedCatId);
  const sub = cat && cat.subcategories.find(s => s.id === selectedSubcatId);

  if (!sub) {
    textarea.value = '';
    textarea.disabled = true;
    saveBtn.style.display = 'none';
    countEl.textContent = '';
    return;
  }

  textarea.disabled = false;
  textarea.value = sub.words.join('\n');
  saveBtn.style.display = 'inline-block';
  updateWordCount();
  textarea.oninput = updateWordCount;
}

function updateWordCount() {
  const textarea = document.getElementById('word-textarea');
  const countEl = document.getElementById('word-count');
  const words = textarea.value.split('\n').map(w => w.trim()).filter(Boolean);
  countEl.textContent = words.length + ' Begriffe';
  countEl.classList.toggle('empty', words.length === 0);
}

async function saveWords() {
  const cat = wordlistData.categories.find(c => c.id === selectedCatId);
  const sub = cat && cat.subcategories.find(s => s.id === selectedSubcatId);
  if (!sub) return;

  const textarea = document.getElementById('word-textarea');
  sub.words = textarea.value.split('\n').map(w => w.trim()).filter(Boolean);

  const status = document.getElementById('save-status');
  try {
    await JoWordlistStorage.save(wordlistData);
    status.className = 'save-status success';
    status.textContent = 'Gespeichert!';
    renderCatTree();
    populateWordCatSelect();
    document.getElementById('word-cat-select').value = selectedCatId || '';
    onWordCatChange();
    document.getElementById('word-subcat-select').value = selectedSubcatId || '';
    renderWordEditor();
    setTimeout(() => { status.style.display = 'none'; }, 2000);
  } catch (err) {
    status.className = 'save-status error';
    status.textContent = 'Fehler: ' + err.message;
  }
}

// ── MD-Import ───────────────────────────────────────────────
function previewImport() {
  const text = document.getElementById('import-textarea').value;
  const preview = document.getElementById('import-preview');
  const confirmBtn = document.getElementById('btn-confirm-import');

  importedCategories = JoWordlistMDParser.parse(text);

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
    let html = '<h4>' + escHtml(cat.name) + ' (' + JoWordlistModel.countWords(cat) + ' Begriffe)</h4>';
    for (const sub of cat.subcategories) {
      html += '<div class="import-subcat"><h5>' + escHtml(sub.name) + '</h5>';
      for (const word of sub.words) {
        html += '<span class="import-word">' + escHtml(word) + '</span>';
      }
      html += '</div>';
    }
    div.innerHTML = html;
    preview.appendChild(div);
  }
}

async function confirmImport() {
  if (!importedCategories || importedCategories.length === 0) return;

  const status = document.getElementById('import-status');

  // Importierte Kategorien mergen (gleicher Name = gleiche Kategorie/Unterkategorie)
  for (const importedCat of importedCategories) {
    let cat = wordlistData.categories.find(c => c.name === importedCat.name);
    if (!cat) {
      cat = JoWordlistModel.createCategory(importedCat.name);
      wordlistData.categories.push(cat);
    }
    for (const importedSub of importedCat.subcategories) {
      let sub = cat.subcategories.find(s => s.name === importedSub.name);
      if (!sub) {
        sub = JoWordlistModel.createSubcategory(importedSub.name);
        cat.subcategories.push(sub);
      }
      sub.words = sub.words.concat(importedSub.words);
    }
  }

  try {
    await JoWordlistStorage.save(wordlistData);
    status.className = 'save-status success';
    status.textContent = importedCategories.length + ' Kategorie(n) importiert!';

    document.getElementById('import-textarea').value = '';
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('btn-confirm-import').style.display = 'none';
    importedCategories = null;

    renderCatTree();
    populateWordCatSelect();
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  } catch (err) {
    status.className = 'save-status error';
    status.textContent = 'Fehler: ' + err.message;
  }
}

// ── Utility ─────────────────────────────────────────────────
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Start ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
