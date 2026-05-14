// ── Kategorie-Selektor (Template) ────────────────────────────────────
//
// BASIERT AUF: Leiterspiel-quiz/js/leiterspiel.js (buildCategoryUI)
// REFERENZ: Akkordeon-Hierarchie für questions.json (.categories)
//
// VORAUSSETZUNGEN — im Spiel-JS deklarieren:
//
//   let rawCategories       = [];   // questions.json .categories (Hierarchie, unverändert)
//   let selectedCategoryIds = new Set();   // gewählte Blatt-Kategorie-IDs
//
//   + spielspezifische Fragenbank (z.B. fragenBank.fragen oder allQuestions[])
//     → _countLeafQ() unten anpassen (ANPASSEN-Markierung)
//
// EINBINDEN:
//   Diesen Block direkt in die Spiellogik-JS-Datei kopieren.
//   Funktionsnamen + Variablen mit // ANPASSEN-Kommentaren anpassen.
//
// BLATT-ERKENNUNG:
//   Blatt = Kategorie mit eigenen Fragen (cat.questions && cat.questions.length > 0)
//   Gruppe = Kategorie ohne eigene Fragen, aber mit Unterkategorien
//   → Kategorien mit BEIDEN werden als Blatt behandelt (Fragen dominieren)
//
// ─────────────────────────────────────────────────────────────────────

// Emoji-Palette für Top-Level-Kategorien (Index = Reihenfolge in questions.json)
const CAT_ICONS = ['📚','🔬','🌍','⚡','🎯','🏛️','🧮','🌿','⚗️','🎨',
                   '💡','🦁','🎵','🏔️','🌊','🔭','🧬','🗺️','⚙️','🎭'];

// ── buildCategoryUI ───────────────────────────────────────────────────
// Baut die gesamte Akkordeon-Hierarchie auf.
// Aufruf: nachdem rawCategories + Fragenbank befüllt sind (z.B. am Ende von loadFragen()).
// Ruft danach showScreen('category-screen') NICHT auf — das macht proceedToCategories().
function buildCategoryUI() {
  if (!rawCategories.length) return;
  const list = document.getElementById('cat-select-list');
  if (!list) return;
  list.innerHTML = '';
  selectedCategoryIds.clear();   // ANPASSEN: ggf. anderer Variablenname

  // Alle Blätter standardmäßig aktivieren
  function collectLeaves(cat) {
    if (cat.questions && cat.questions.length > 0) return [cat.id];
    return (cat.subcategories || []).flatMap(s => collectLeaves(s));
  }
  rawCategories.forEach(cat => collectLeaves(cat).forEach(id => selectedCategoryIds.add(id)));

  rawCategories.forEach((cat, i) => {
    _buildCatNode(list, cat, CAT_ICONS[i % CAT_ICONS.length]);
  });
  updateCatSelectInfo();
}

// ── _buildCatNode ─────────────────────────────────────────────────────
// Rekursiv:
//   Blatt (cat.questions vorhanden)  → .cat-select-item
//   Gruppe (nur Unterkategorien)     → .cat-group-wrap (eingeklappt per default)
function _buildCatNode(container, cat, icon, depth) {
  depth = depth || 0;
  const subs  = cat.subcategories || [];
  const hasQ  = cat.questions && cat.questions.length > 0;

  // Leere Knoten überspringen
  if (!hasQ && !subs.length) return;

  const qCount = _countLeafQ(cat);

  // ── Blatt-Kategorie ──────────────────────────────────────────────
  if (hasQ) {
    const sel  = selectedCategoryIds.has(cat.id);  // ANPASSEN: Variablenname
    const item = document.createElement('div');
    item.className = 'cat-select-item' + (sel ? ' selected' : '');
    item.dataset.catId = cat.id;
    item.innerHTML =
      '<span class="cat-select-icon">' + (icon || '📁') + '</span>' +
      '<span class="cat-select-name">' + cat.name + '</span>' +
      '<span class="cat-select-count">' + qCount + ' Fr.</span>' +
      '<div class="cat-select-check">' + (sel ? '✓' : '') + '</div>';
    item.onclick = () => {
      const on = !selectedCategoryIds.has(cat.id);  // ANPASSEN: Variablenname
      const check = item.querySelector('.cat-select-check');
      if (on) {
        selectedCategoryIds.add(cat.id);
        item.classList.add('selected');
        check.textContent = '✓';
      } else {
        selectedCategoryIds.delete(cat.id);
        item.classList.remove('selected');
        check.textContent = '';
      }
      _syncGroupHeader(container.closest('.cat-group-wrap'));
      updateCatSelectInfo();
    };
    container.appendChild(item);
    return;
  }

  // ── Akkordeon-Gruppe (eingeklappt per default) ───────────────────
  // Alle Blatt-IDs dieser Gruppe für Gruppen-Checkbox vorberechnen
  const allLeaves = [];
  (function collect(c) {
    if (c.questions && c.questions.length > 0) allLeaves.push(c.id);
    (c.subcategories || []).forEach(s => collect(s));
  })(cat);
  const allSel = allLeaves.every(id => selectedCategoryIds.has(id));  // ANPASSEN

  const wrap = document.createElement('div');
  wrap.className = 'cat-group-wrap';

  const header = document.createElement('div');
  header.className = 'cat-group-header collapsed';
  header.innerHTML =
    '<span class="cat-group-chevron">▶</span>' +
    '<span class="cat-group-icon">' + icon + '</span>' +
    '<span class="cat-group-name">' + cat.name + '</span>' +
    '<span class="cat-group-count">' + qCount + ' Fragen</span>' +
    '<label class="cat-group-toggle" onclick="event.stopPropagation()">' +
      '<input type="checkbox" class="cat-group-cb"' + (allSel ? ' checked' : '') + '>' +
    '</label>';

  const children = document.createElement('div');
  children.className = 'cat-group-children hidden';

  // Header-Klick: auf-/zuklappen
  header.addEventListener('click', () => {
    const collapsed = header.classList.contains('collapsed');
    header.classList.toggle('collapsed', !collapsed);
    children.classList.toggle('hidden', !collapsed);
  });

  // Gruppen-Checkbox: alle Blätter dieser Gruppe ein-/ausschalten
  const cb = header.querySelector('.cat-group-cb');
  cb.addEventListener('change', () => {
    const on = cb.checked;
    allLeaves.forEach(id => {
      if (on) selectedCategoryIds.add(id);    // ANPASSEN: Variablenname
      else    selectedCategoryIds.delete(id);
    });
    children.querySelectorAll('.cat-select-item').forEach(item => {
      item.classList.toggle('selected', on);
      item.querySelector('.cat-select-check').textContent = on ? '✓' : '';
    });
    children.querySelectorAll('.cat-group-cb').forEach(gcb => gcb.checked = on);
    updateCatSelectInfo();
  });

  wrap.appendChild(header);
  wrap.appendChild(children);
  container.appendChild(wrap);
  subs.forEach(sub => _buildCatNode(children, sub, icon, depth + 1));
}

// ── _countLeafQ ───────────────────────────────────────────────────────
// Zählt Fragen unter einem Knoten (Blatt oder Gruppe).
// ANPASSEN: Zählmethode an die spielspezifische Fragenbank anpassen.
function _countLeafQ(cat) {
  if (cat.questions && cat.questions.length > 0) {
    // Option A: Direkt aus questions.json zählen (immer verfügbar)
    return cat.questions.length;
    // Option B: Aus konvertierter Fragenbank (nach spielspezifischer Konvertierung):
    // return fragenBank.fragen.filter(q => q.kategorie === cat.id).length;
    // Option C: Aus flachem allQuestions-Array:
    // return allQuestions.filter(q => q.kategorieId === cat.id).length;
  }
  return (cat.subcategories || []).reduce((s, c) => s + _countLeafQ(c), 0);
}

// ── _syncGroupHeader ──────────────────────────────────────────────────
// Synchronisiert die Gruppen-Checkbox nach dem Toggle eines einzelnen Blatts.
// Propagiert auch nach oben (verschachtelte Gruppen).
function _syncGroupHeader(wrap) {
  if (!wrap) return;
  const cb = wrap.querySelector(':scope > .cat-group-header .cat-group-cb');
  if (!cb) return;
  const items = wrap.querySelectorAll('.cat-select-item');
  cb.checked = items.length > 0 && [...items].every(i => i.classList.contains('selected'));
  const parentChildren = wrap.parentElement;
  if (parentChildren && parentChildren.classList.contains('cat-group-children'))
    _syncGroupHeader(parentChildren.closest('.cat-group-wrap'));
}

// ── toggleAllCategories ───────────────────────────────────────────────
// "Alle" / "Keine" Buttons in cat-selector.html rufen diese Funktion auf.
function toggleAllCategories(on) {
  selectedCategoryIds.clear();   // ANPASSEN: Variablenname
  document.querySelectorAll('#cat-select-list .cat-select-item').forEach(item => {
    item.classList.toggle('selected', on);
    item.querySelector('.cat-select-check').textContent = on ? '✓' : '';
    if (on) selectedCategoryIds.add(item.dataset.catId);   // ANPASSEN
  });
  document.querySelectorAll('#cat-select-list .cat-group-cb').forEach(cb => cb.checked = on);
  updateCatSelectInfo();
}

// ── updateCatSelectInfo ───────────────────────────────────────────────
// Aktualisiert die Info-Zeile unter der Kategorienliste.
// ANPASSEN: Zähllogik an die spielspezifische Fragenbank anpassen.
function updateCatSelectInfo() {
  const el = document.getElementById('cat-select-info');
  if (!el) return;

  // ANPASSEN: Fragenanzahl spielspezifisch ermitteln, z.B.:
  // const qCount = fragenBank.fragen.filter(q => selectedCategoryIds.has(q.kategorie)).length;
  // const qCount = allQuestions.filter(q => selectedCategoryIds.has(q.kategorieId)).length;
  const qCount = 0;  // ← ERSETZEN durch spielspezifische Zählung

  if (selectedCategoryIds.size === 0 || qCount === 0) {  // ANPASSEN
    el.className = 'cat-select-info warning';
    el.textContent = 'Keine Kategorie ausgewählt!';
  } else {
    el.className = 'cat-select-info';
    el.textContent = qCount + ' Fragen aus ' + selectedCategoryIds.size + ' Kategorien';  // ANPASSEN
  }
}
