/* quizpfad-admin.js – Fragenverwaltung */

let fragenBank = { kategorien: [], fragen: [] };

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadData);

async function loadData() {
  try {
    if (window.location.protocol !== 'file:') {
      try {
        const r = await fetch('../api.php?f=quizpfad-fragen');
        if (r.ok) { fragenBank = await r.json(); renderAll(); return; }
      } catch (e) { /* fallback */ }
    }
    const r = await fetch('data/fragen.json');
    if (r.ok) { fragenBank = await r.json(); renderAll(); return; }
  } catch (e) { /* ignore */ }

  const ls = localStorage.getItem('quizpfad_fragen');
  if (ls) fragenBank = JSON.parse(ls);
  renderAll();
}

function renderAll() {
  renderCategoryList();
  renderCategoriesEditor();
}

// ── Tab Switching ────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

// ── Questions Editor ─────────────────────────────────────────
function renderCategoryList() {
  const list = document.getElementById('cat-list');
  list.innerHTML = '';

  fragenBank.kategorien.forEach(kat => {
    const katFragen = fragenBank.fragen.filter(f => f.kategorie === kat.id);
    const card = document.createElement('div');
    card.className = 'cat-card';

    const header = document.createElement('div');
    header.className = 'cat-header';
    header.innerHTML =
      '<span style="font-size:1.3rem;">' + kat.icon + '</span>' +
      '<strong style="color:' + kat.farbe + ';">' + kat.name + '</strong>' +
      '<span style="color:var(--text-light);font-size:0.8rem;">(' + katFragen.length + ' Fragen)</span>' +
      '<button class="btn-sm" onclick="addQuestion(\'' + kat.id + '\')">+ Frage</button>';
    card.appendChild(header);

    const qList = document.createElement('div');
    qList.className = 'question-list';
    qList.id = 'qlist-' + kat.id;

    katFragen.forEach(q => {
      qList.appendChild(createQuestionRow(q));
    });

    card.appendChild(qList);
    list.appendChild(card);
  });
}

function createQuestionRow(q) {
  const row = document.createElement('div');
  row.className = 'q-row';
  row.dataset.id = q.id;

  // Type
  const typeSelect = document.createElement('select');
  typeSelect.className = 'q-type-select';
  ['multiple_choice', 'wahr_falsch', 'offen'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t === 'multiple_choice' ? 'Multiple Choice' : t === 'wahr_falsch' ? 'Wahr/Falsch' : 'Offen';
    if (t === q.typ) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  typeSelect.onchange = () => { q.typ = typeSelect.value; updateQuestionRow(row, q); };

  // Difficulty
  const diffSelect = document.createElement('select');
  ['leicht', 'mittel', 'schwer'].forEach(d => {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    if (d === q.schwierigkeit) opt.selected = true;
    diffSelect.appendChild(opt);
  });
  diffSelect.onchange = () => { q.schwierigkeit = diffSelect.value; };

  // Question text
  const qText = document.createElement('textarea');
  qText.value = q.frage;
  qText.placeholder = 'Fragetext...';
  qText.onchange = () => { q.frage = qText.value; };

  // Delete
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-sm danger';
  delBtn.textContent = '✗';
  delBtn.title = 'Frage löschen';
  delBtn.onclick = () => deleteQuestion(q.id);

  row.appendChild(typeSelect);
  row.appendChild(diffSelect);
  row.appendChild(qText);
  row.appendChild(delBtn);

  // Options editor (for MC)
  const optEditor = document.createElement('div');
  optEditor.className = 'q-options-editor';

  if (q.typ === 'multiple_choice') {
    const label = document.createElement('label');
    label.textContent = 'Antworten (| getrennt), richtige markiert mit *:';
    optEditor.appendChild(label);

    const optInput = document.createElement('input');
    optInput.type = 'text';
    optInput.value = q.antworten.map((a, i) => (i === q.richtig ? '*' + a : a)).join(' | ');
    optInput.placeholder = '*Richtige | Falsch1 | Falsch2 | Falsch3';
    optInput.onchange = () => {
      const parts = optInput.value.split('|').map(s => s.trim()).filter(Boolean);
      q.antworten = [];
      q.richtig = 0;
      parts.forEach((p, i) => {
        if (p.startsWith('*')) {
          q.richtig = i;
          q.antworten.push(p.substring(1).trim());
        } else {
          q.antworten.push(p);
        }
      });
    };
    optEditor.appendChild(optInput);
  } else if (q.typ === 'wahr_falsch') {
    const label = document.createElement('label');
    label.textContent = 'Richtig:';
    optEditor.appendChild(label);

    const wfSelect = document.createElement('select');
    ['Wahr', 'Falsch'].forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = v;
      if (i === q.richtig) opt.selected = true;
      wfSelect.appendChild(opt);
    });
    wfSelect.onchange = () => {
      q.richtig = parseInt(wfSelect.value);
      q.antworten = ['Wahr', 'Falsch'];
    };
    optEditor.appendChild(wfSelect);
  }

  // Explanation
  const explLabel = document.createElement('label');
  explLabel.textContent = 'Erklärung:';
  explLabel.style.marginTop = '6px';
  optEditor.appendChild(explLabel);

  const explInput = document.createElement('input');
  explInput.type = 'text';
  explInput.value = q.erklaerung || '';
  explInput.placeholder = 'Erklärung nach Antwort...';
  explInput.onchange = () => { q.erklaerung = explInput.value; };
  optEditor.appendChild(explInput);

  row.appendChild(optEditor);
  return row;
}

function updateQuestionRow(row, q) {
  // Adjust defaults when type changes
  if (q.typ === 'wahr_falsch') {
    q.antworten = ['Wahr', 'Falsch'];
    if (q.richtig > 1) q.richtig = 0;
  } else if (q.typ === 'offen') {
    q.antworten = [];
    q.richtig = -1;
  } else if (q.typ === 'multiple_choice') {
    if (!q.antworten || q.antworten.length < 2) {
      q.antworten = ['Antwort A', 'Antwort B', 'Antwort C', 'Antwort D'];
      q.richtig = 0;
    }
  }

  // Re-render this row
  const parent = row.parentElement;
  const newRow = createQuestionRow(q);
  parent.replaceChild(newRow, row);
}

function addQuestion(kategorieId) {
  const newQ = {
    id: 'q-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    kategorie: kategorieId,
    schwierigkeit: 'mittel',
    frage: '',
    typ: 'multiple_choice',
    antworten: ['Antwort A', 'Antwort B', 'Antwort C', 'Antwort D'],
    richtig: 0,
    erklaerung: ''
  };
  fragenBank.fragen.push(newQ);
  renderCategoryList();
}

function deleteQuestion(id) {
  fragenBank.fragen = fragenBank.fragen.filter(q => q.id !== id);
  renderCategoryList();
}

// ── Categories Editor ────────────────────────────────────────
function renderCategoriesEditor() {
  const editor = document.getElementById('categories-editor');
  editor.innerHTML = '';

  fragenBank.kategorien.forEach((kat, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;';

    row.innerHTML =
      '<input type="text" class="cat-icon-input" value="' + kat.icon + '" ' +
        'onchange="fragenBank.kategorien[' + i + '].icon=this.value; renderAll();">' +
      '<input type="text" value="' + kat.name + '" style="flex:1;min-width:120px;padding:6px 10px;' +
        'border:1px solid var(--border);border-radius:8px;background:var(--bg-field);color:var(--text-primary);" ' +
        'onchange="fragenBank.kategorien[' + i + '].name=this.value; renderAll();">' +
      '<input type="text" value="' + kat.id + '" style="width:100px;padding:6px 10px;' +
        'border:1px solid var(--border);border-radius:8px;background:var(--bg-field);color:var(--text-primary);" ' +
        'placeholder="ID" onchange="updateCategoryId(' + i + ', this.value);">' +
      '<input type="color" value="' + kat.farbe + '" ' +
        'onchange="fragenBank.kategorien[' + i + '].farbe=this.value; renderAll();">' +
      '<button class="btn-sm danger" onclick="deleteCategory(' + i + ')">✗</button>';

    editor.appendChild(row);
  });
}

function addCategory() {
  const id = 'kat-' + Date.now();
  fragenBank.kategorien.push({
    id: id,
    name: 'Neue Kategorie',
    icon: '📚',
    farbe: '#95a5a6'
  });
  renderAll();
}

function deleteCategory(idx) {
  const kat = fragenBank.kategorien[idx];
  if (!confirm('Kategorie "' + kat.name + '" und alle zugehörigen Fragen löschen?')) return;
  fragenBank.fragen = fragenBank.fragen.filter(q => q.kategorie !== kat.id);
  fragenBank.kategorien.splice(idx, 1);
  renderAll();
}

function updateCategoryId(idx, newId) {
  const oldId = fragenBank.kategorien[idx].id;
  fragenBank.kategorien[idx].id = newId;
  fragenBank.fragen.forEach(q => {
    if (q.kategorie === oldId) q.kategorie = newId;
  });
  renderAll();
}

// ── MD Import ────────────────────────────────────────────────
function parseMD(text) {
  const lines = text.split('\n');
  let currentKat = null;
  const imported = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      currentKat = trimmed.substring(3).trim();
    } else if (trimmed.startsWith('- ') && currentKat) {
      const parts = trimmed.substring(2).split('|').map(s => s.trim());
      if (parts.length < 3) continue;

      const typ = parts[0];
      const frage = parts[1];

      let q = {
        id: 'q-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        kategorie: currentKat,
        schwierigkeit: 'mittel',
        frage: frage,
        typ: 'offen',
        antworten: [],
        richtig: -1,
        erklaerung: ''
      };

      if (typ === 'mc' || typ === 'multiple_choice') {
        q.typ = 'multiple_choice';
        q.antworten = parts.slice(2, -2).filter(Boolean);
        q.richtig = parseInt(parts[parts.length - 2]) || 0;
        q.erklaerung = parts[parts.length - 1] || '';
      } else if (typ === 'wf' || typ === 'wahr_falsch') {
        q.typ = 'wahr_falsch';
        q.antworten = ['Wahr', 'Falsch'];
        q.richtig = parseInt(parts[parts.length - 2]) || 0;
        q.erklaerung = parts[parts.length - 1] || '';
      } else if (typ === 'offen') {
        q.typ = 'offen';
        q.richtig = -1;
        q.erklaerung = parts[parts.length - 1] || '';
      }

      imported.push(q);
    }
  }

  return imported;
}

function previewMD() {
  const text = document.getElementById('import-area').value;
  const questions = parseMD(text);
  const preview = document.getElementById('import-preview');

  if (questions.length === 0) {
    preview.innerHTML = '<p style="color:var(--danger);">Keine Fragen erkannt.</p>';
    preview.style.display = 'block';
    return;
  }

  let html = '<h4>' + questions.length + ' Fragen erkannt:</h4>';
  questions.forEach(q => {
    html += '<div style="padding:6px 0;border-bottom:1px solid var(--border);">';
    html += '<strong>[' + q.typ + ']</strong> ' + q.kategorie + ': ' + q.frage;
    if (q.antworten.length > 0) {
      html += '<br><small>Antworten: ' + q.antworten.join(', ') + ' (richtig: ' + q.richtig + ')</small>';
    }
    html += '</div>';
  });

  preview.innerHTML = html;
  preview.style.display = 'block';
}

function importMD() {
  const text = document.getElementById('import-area').value;
  const questions = parseMD(text);

  if (questions.length === 0) {
    showStatus('Keine Fragen zum Importieren gefunden.', 'error');
    return;
  }

  // Ensure categories exist
  const newKats = new Set(questions.map(q => q.kategorie));
  newKats.forEach(katId => {
    if (!fragenBank.kategorien.find(k => k.id === katId)) {
      fragenBank.kategorien.push({
        id: katId,
        name: katId.charAt(0).toUpperCase() + katId.slice(1),
        icon: '📚',
        farbe: '#95a5a6'
      });
    }
  });

  fragenBank.fragen.push(...questions);
  renderAll();
  showStatus(questions.length + ' Fragen importiert!', 'success');
  document.getElementById('import-area').value = '';
  document.getElementById('import-preview').style.display = 'none';
}

// ── Save / Download ──────────────────────────────────────────
async function saveAll() {
  // Save to localStorage
  localStorage.setItem('quizpfad_fragen', JSON.stringify(fragenBank));

  // Try server
  if (window.location.protocol !== 'file:') {
    try {
      const r = await fetch('../api.php?f=quizpfad-fragen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fragenBank)
      });
      if (r.ok) {
        showStatus('Gespeichert (Server + lokal)!', 'success');
        return;
      }
    } catch (e) { /* fallback */ }
  }

  showStatus('Lokal gespeichert!', 'success');
}

function downloadJSON() {
  const blob = new Blob([JSON.stringify(fragenBank, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fragen.json';
  a.click();
  URL.revokeObjectURL(url);
}

function showStatus(msg, type) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = 'status-msg visible ' + type;
  setTimeout(() => { el.classList.remove('visible'); }, 3000);
}
