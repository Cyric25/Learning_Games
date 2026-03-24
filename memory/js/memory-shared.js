// memory-shared.js – Gemeinsame Utilities für Memory-Spiel
// MemoryStorageManager, MemoryModel, MemoryMDParser

// ============================================================
// MemoryStorageManager – localStorage + optionaler Server-Sync
// ============================================================
const MemoryStorageManager = {
  _LS_KEY: 'memory_pairs',

  _hasServer() {
    return window.location.protocol !== 'file:';
  },

  _apiUrl(resource) {
    let url = '../api.php?f=' + resource;
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

  async loadPairs() {
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('memory-pairs'));
        if (r.ok) {
          const d = await r.json();
          if (d.categories) { this._lsSet(this._LS_KEY, d); return d; }
        }
      } catch { /* Server nicht erreichbar – lokaler Fallback */ }
    }
    const local = this._lsGet(this._LS_KEY);
    return (local && local.categories) ? local : { categories: [] };
  },

  async savePairs(pairsData) {
    this._lsSet(this._LS_KEY, pairsData);
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('memory-pairs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pairsData)
        });
        return r.ok;
      } catch { /* Server nicht erreichbar */ }
    }
    return false;
  }
};

// ============================================================
// MemoryModel – Datenmodell für Memory-Paare
// ============================================================
const MemoryModel = {
  _uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
  },

  createCategory(name) {
    return {
      id: 'cat-' + this._uid(),
      name: name,
      pairs: []
    };
  },

  createPair(sideA, sideB, difficulty) {
    return {
      id: 'pair-' + this._uid(),
      sideA: sideA,   // { type: 'text'|'formula'|'image', content: '...' }
      sideB: sideB,
      difficulty: difficulty || 1
    };
  },

  // Zufällige Auswahl von n Paaren aus den gewählten Kategorien
  selectPairs(pairsData, categoryIds, count, difficultyFilter) {
    let pool = [];
    for (const cat of pairsData.categories) {
      if (categoryIds.includes(cat.id)) {
        for (const pair of cat.pairs) {
          if (!difficultyFilter || difficultyFilter === 'all' || pair.difficulty === difficultyFilter) {
            pool.push(pair);
          }
        }
      }
    }
    // Shuffle (Fisher-Yates)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  },

  // Karten-Array aus Paaren erzeugen (2 Karten pro Paar, gemischt)
  createCards(pairs) {
    const cards = [];
    for (const pair of pairs) {
      cards.push({ pairId: pair.id, side: 'A', ...pair.sideA, flipped: false, matched: false });
      cards.push({ pairId: pair.id, side: 'B', ...pair.sideB, flipped: false, matched: false });
    }
    // Shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }
};

// ============================================================
// MemoryMDParser – Markdown-Import für Memory-Paare
// ============================================================
const MemoryMDParser = {
  /**
   * Parst Markdown im Format:
   *   ## Kategoriename
   *   - typA | inhaltA | typB | inhaltB
   *   - typA | inhaltA | typB | inhaltB | schwierigkeit
   *
   * Typen: text, formula, image
   * Schwierigkeit: 1 (leicht), 2 (mittel), 3 (schwer) — Standard: 1
   */
  parse(mdText) {
    const lines = mdText.split('\n');
    const categories = [];
    let currentCat = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Kategorie-Überschrift
      if (line.startsWith('## ')) {
        const name = line.substring(3).trim();
        if (name) {
          currentCat = MemoryModel.createCategory(name);
          categories.push(currentCat);
        }
        continue;
      }

      // Paar-Zeile
      if (line.startsWith('- ') && currentCat) {
        const content = line.substring(2).trim();
        const parts = content.split('|').map(p => p.trim());

        if (parts.length >= 4) {
          const typeA = this._normalizeType(parts[0]);
          const contentA = parts[1];
          const typeB = this._normalizeType(parts[2]);
          const contentB = parts[3];
          const difficulty = parts[4] ? parseInt(parts[4], 10) || 1 : 1;

          if (typeA && contentA && typeB && contentB) {
            const pair = MemoryModel.createPair(
              { type: typeA, content: contentA },
              { type: typeB, content: contentB },
              Math.max(1, Math.min(3, difficulty))
            );
            currentCat.pairs.push(pair);
          }
        }
      }
    }

    return categories;
  },

  _normalizeType(t) {
    t = t.toLowerCase().trim();
    if (t === 'text' || t === 'formula' || t === 'image') return t;
    if (t === 'formel') return 'formula';
    if (t === 'bild') return 'image';
    if (t === 'name' || t === 'bezeichnung' || t === 'begriff') return 'text';
    return null;
  }
};
