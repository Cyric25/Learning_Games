// wordlist-shared.js – Begriffsdatenbank für Just One
// JoWordlistStorage, JoWordlistModel, JoWordlistMDParser
//
// Eigene Datenbank (nicht die zentrale Fragendatenbank, nicht Codenames'
// Wortlisten) – Just One braucht offene Begriffs-Pools statt Frage-Objekten
// bzw. exakt-25-Wörter-Listen. Struktur zweistufig: Kategorie → Unterkategorie
// → Begriffe[] (analog zur zentralen DB, aber ohne beliebige Tiefe).

// ============================================================
// JoWordlistStorage – Server-Sync (?f=jo-words) + localStorage-Fallback
// ============================================================
const JoWordlistStorage = {
  _LS_KEY: 'jo_wordlists',

  _hasServer() {
    return window.location.protocol !== 'file:';
  },

  _apiUrl(resource) {
    const url = '../api.php?f=' + resource;
    try { return new URL(url, window.location.href).href; }
    catch { return '/api.php?f=' + resource; }
  },

  _lsGet(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },

  _lsSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { }
  },

  async load() {
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('jo-words'));
        if (r.ok) {
          const d = await r.json();
          if (d && d.categories) { this._lsSet(this._LS_KEY, d); return d; }
        }
      } catch { /* Server nicht erreichbar – lokaler Fallback */ }
    }
    const local = this._lsGet(this._LS_KEY);
    return (local && local.categories) ? local : { categories: [] };
  },

  async save(wordlistData) {
    this._lsSet(this._LS_KEY, wordlistData);
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('jo-words'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': 'LP-Spiele-2026' },
          body: JSON.stringify(wordlistData)
        });
        return r.ok;
      } catch { /* Server nicht erreichbar */ }
    }
    return false;
  }
};

// ============================================================
// JoWordlistModel – Datenmodell für Kategorien/Unterkategorien/Begriffe
// ============================================================
const JoWordlistModel = {
  _uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
  },

  createCategory(name) {
    return { id: 'cat-' + this._uid(), name: name, subcategories: [] };
  },

  createSubcategory(name) {
    return { id: 'subcat-' + this._uid(), name: name, words: [] };
  },

  countWords(cat) {
    return (cat.subcategories || []).reduce((sum, s) => sum + (s.words || []).length, 0);
  },

  totalWords(wordlistData) {
    return (wordlistData.categories || []).reduce((sum, c) => sum + this.countWords(c), 0);
  },

  // Alle Begriffe der gewählten Unterkategorie-IDs, mit Herkunfts-Info fürs
  // Vermeiden von Wiederholungen (id ist "<subcatId>::<wortindex>").
  pooledWords(wordlistData, activeSubcatIds) {
    const pool = [];
    for (const cat of (wordlistData.categories || [])) {
      for (const sub of (cat.subcategories || [])) {
        if (!activeSubcatIds || activeSubcatIds.includes(sub.id)) {
          (sub.words || []).forEach((w, i) => {
            pool.push({ id: sub.id + '::' + i, word: w });
          });
        }
      }
    }
    return pool;
  },

  // Zufälliger, noch nicht verwendeter Begriff aus dem Pool
  drawWord(pool, usedIds) {
    const used = new Set(usedIds || []);
    const remaining = pool.filter(p => !used.has(p.id));
    if (!remaining.length) return null;
    return remaining[Math.floor(Math.random() * remaining.length)];
  }
};

// ============================================================
// JoWordlistMDParser – Markdown-Import für Begriffslisten
// ============================================================
const JoWordlistMDParser = {
  /**
   * Parst Markdown im Format:
   *   ## Kategoriename
   *   ### Unterkategoriename
   *   - Begriff
   *   - Begriff
   */
  parse(mdText) {
    if (mdText.charCodeAt(0) === 0xFEFF) mdText = mdText.slice(1);

    const lines = mdText.split('\n');
    const categories = [];
    let currentCat = null;
    let currentSub = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('## ')) {
        const name = line.substring(3).trim();
        if (name) {
          currentCat = JoWordlistModel.createCategory(name);
          categories.push(currentCat);
          currentSub = null;
        }
        continue;
      }

      if (line.startsWith('### ')) {
        const name = line.substring(4).trim();
        if (name) {
          if (!currentCat) {
            currentCat = JoWordlistModel.createCategory('Importiert');
            categories.push(currentCat);
          }
          currentSub = JoWordlistModel.createSubcategory(name);
          currentCat.subcategories.push(currentSub);
        }
        continue;
      }

      if (line.startsWith('- ')) {
        const word = line.substring(2).trim();
        if (!word) continue;
        if (!currentCat) {
          currentCat = JoWordlistModel.createCategory('Importiert');
          categories.push(currentCat);
        }
        if (!currentSub) {
          currentSub = JoWordlistModel.createSubcategory('Allgemein');
          currentCat.subcategories.push(currentSub);
        }
        currentSub.words.push(word);
      }
    }

    return categories;
  },

  // Für den Export (Round-Trip mit parse())
  toMarkdown(wordlistData) {
    const lines = [];
    for (const cat of (wordlistData.categories || [])) {
      lines.push('## ' + cat.name);
      for (const sub of (cat.subcategories || [])) {
        lines.push('### ' + sub.name);
        for (const word of (sub.words || [])) {
          lines.push('- ' + word);
        }
      }
      lines.push('');
    }
    return lines.join('\n').trim() + '\n';
  }
};
