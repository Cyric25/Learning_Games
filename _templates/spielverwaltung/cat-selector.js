// ── Kategorie-Selektor (Template) ────────────────────────────────────
//
// VORAUSSETZUNGEN (im jeweiligen Spiel-JS deklarieren):
//
//   let rawCategories    = [];          // questions.json .categories (Hierarchie)
//   let allQuestions     = [];          // flaches Array, .kategorieId = Blatt-ID
//   let activeCategories = new Set();   // gewählte Blatt-Kategorie-IDs
//
// EINBINDEN:
//   Diesen Block direkt in die Spiellogik-JS-Datei kopieren.
//   Funktionsnamen dürfen umbenannt werden, solange die onclick-Handler
//   in cat-selector.html (toggleAllCategories) angepasst werden.
//
// ICONS: Reihenfolge der Top-Level-Kategorien aus questions.json
//   → Kein Icon im JSON? Dann über CAT_ICONS-Palette vergeben.
//
// ─────────────────────────────────────────────────────────────────────

const CAT_ICONS = ['📚','🔬','🌍','⚡','🎯','🏛️','🧮','🌿','⚗️','🎨',
                   '💡','🦁','🎵','🏔️','🌊','🔭','🧬','🗺️','⚙️','🎭'];

// Baut die gesamte Kategorie-UI auf.
// Rufe auf, nachdem rawCategories + allQuestions befüllt sind.
function buildCategoryUI() {
  const sec  = document.getElementById('category-section');
  const list = document.getElementById('cat-select-list');
  if (!rawCategories.length) { if (sec) sec.style.display = 'none'; return; }
  if (sec) sec.style.display = '';
  list.innerHTML = '';

  // Alle Blatt-Kategorien standardmäßig aktivieren
  activeCategories.clear();
  function collectLeaves(cat) {
    if (cat.subcategories && cat.subcategories.length) {
      cat.subcategories.forEach(collectLeaves);
    } else {
      activeCategories.add(cat.id);
    }
  }
  rawCategories.forEach(collectLeaves);

  rawCategories.forEach(function(cat, ci) {
    _buildCatNode(list, cat, CAT_ICONS[ci % CAT_ICONS.length], 0);
  });
  updateCategoryInfo();
}

// Rekursiv: Blatt → .cat-select-item  |  Gruppe → .cat-group-wrap (eingeklappt)
function _buildCatNode(container, cat, icon, depth) {
  var subs = cat.subcategories || [];

  if (!subs.length) {
    // ── Blatt-Kategorie ──
    var qCount = allQuestions.filter(function(q) { return q.kategorieId === cat.id; }).length;
    var item = document.createElement('div');
    item.className = 'cat-select-item selected';
    item.dataset.catId = cat.id;
    if (depth > 0) item.style.marginLeft = (depth * 1.2) + 'rem';
    item.innerHTML =
      '<span class="cat-select-icon">' + icon + '</span>' +
      '<span class="cat-select-name">' + cat.name + '</span>' +
      '<span class="cat-select-count">' + qCount + '</span>' +
      '<div class="cat-select-check">&#10003;</div>';
    item.addEventListener('click', function() {
      if (activeCategories.has(cat.id)) {
        activeCategories.delete(cat.id);
        item.classList.remove('selected');
      } else {
        activeCategories.add(cat.id);
        item.classList.add('selected');
      }
      _syncGroupHeader(item.closest('.cat-group-wrap'));
      updateCategoryInfo();
    });
    container.appendChild(item);
    return;
  }

  // ── Akkordeon-Gruppe (eingeklappt per default) ──
  var wrap = document.createElement('div');
  wrap.className = 'cat-group-wrap';

  var qTotal = _countLeafQ(cat);
  var header = document.createElement('div');
  header.className = 'cat-group-header collapsed';   // ← collapsed = eingeklappt
  header.innerHTML =
    '<span class="cat-group-chevron">&#9660;</span>' +
    '<span class="cat-group-icon">' + icon + '</span>' +
    '<span class="cat-group-name">' + cat.name + '</span>' +
    '<span class="cat-group-count">' + qTotal + ' Fragen</span>' +
    '<label class="cat-group-toggle" onclick="event.stopPropagation()">' +
      '<input type="checkbox" checked class="cat-group-cb">' +
    '</label>';

  var children = document.createElement('div');
  children.className = 'cat-group-children hidden';  // ← hidden = eingeklappt
  subs.forEach(function(s) { _buildCatNode(children, s, icon, depth + 1); });

  // Gruppen-Checkbox: alle Blätter darunter an/aus
  header.querySelector('.cat-group-cb').addEventListener('change', function(e) {
    var on = e.target.checked;
    children.querySelectorAll('.cat-select-item').forEach(function(item) {
      on ? activeCategories.add(item.dataset.catId)
         : activeCategories.delete(item.dataset.catId);
      item.classList.toggle('selected', on);
    });
    updateCategoryInfo();
  });

  // Header-Klick: auf-/zuklappen
  header.addEventListener('click', function(e) {
    if (e.target.closest('label')) return;
    var collapsed = header.classList.toggle('collapsed');
    children.classList.toggle('hidden', collapsed);
  });

  wrap.appendChild(header);
  wrap.appendChild(children);
  container.appendChild(wrap);
}

// Zählt alle Fragen unter einem (möglicherweise verschachtelten) Knoten
function _countLeafQ(cat) {
  if (!cat.subcategories || !cat.subcategories.length) {
    return allQuestions.filter(function(q) { return q.kategorieId === cat.id; }).length;
  }
  return (cat.subcategories || []).reduce(function(s, c) {
    return s + _countLeafQ(c);
  }, 0);
}

// Synchronisiert Gruppen-Checkbox nach Einzel-Toggle eines Blatts
function _syncGroupHeader(wrap) {
  if (!wrap) return;
  var items = Array.from(wrap.querySelectorAll('.cat-select-item'));
  var allSel = items.length > 0 && items.every(function(i) {
    return i.classList.contains('selected');
  });
  var cb = wrap.querySelector('.cat-group-cb');
  if (cb) cb.checked = allSel;
  var parentWrap = wrap.parentElement && wrap.parentElement.closest('.cat-group-wrap');
  if (parentWrap) _syncGroupHeader(parentWrap);
}

// "Alle" / "Keine" Buttons
function toggleAllCategories(on) {
  document.querySelectorAll('#cat-select-list .cat-select-item').forEach(function(item) {
    on ? activeCategories.add(item.dataset.catId)
       : activeCategories.delete(item.dataset.catId);
    item.classList.toggle('selected', on);
  });
  document.querySelectorAll('#cat-select-list .cat-group-cb').forEach(function(cb) {
    cb.checked = on;
  });
  updateCategoryInfo();
}

// Info-Zeile unter der Liste aktualisieren
// ANPASSEN: Feldname .kategorieId je nach Spiel ggf. abweichend
function updateCategoryInfo() {
  var el = document.getElementById('cat-select-info');
  if (!el) return;
  var n = allQuestions.filter(function(q) {
    return activeCategories.has(q.kategorieId);
  }).length;
  el.textContent = n + ' Fragen aus ' + activeCategories.size + ' Kategorien';
  el.className = 'cat-select-info' + (n === 0 ? ' warning' : '');
}
