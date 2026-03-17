// shared.js – Gemeinsame Utilities für Risiko-Quiz
// StorageManager, GameModel, MDParser

// ============================================================
// StorageManager – localStorage + optionaler Server-Sync
// ============================================================
const StorageManager = {
  _LS_Q:  'rq_questions',
  _LS_GS: 'rq_gamestate',
  _currentCode: null,

  // Kein Server-Zugriff wenn als file:// geöffnet
  _hasServer() {
    return window.location.protocol !== 'file:';
  },

  // Direkte api.php-URL – kein mod_rewrite nötig, funktioniert auf jedem PHP-Webspace
  _apiUrl(resource, params) {
    let url = '../api.php?f=' + resource;
    if (params) Object.entries(params).forEach(([k, v]) => { url += '&' + k + '=' + encodeURIComponent(v); });
    try { return new URL(url, window.location.href).href; }
    catch { return '/api.php?f=' + resource; }
  },

  // ── Game-Code Management ────────────────────────────────────
  setGameCode(code) {
    this._currentCode = code ? code.toUpperCase() : null;
  },
  getGameCode() {
    return this._currentCode;
  },
  _gsKey() {
    return this._currentCode ? this._LS_GS + '_' + this._currentCode : this._LS_GS;
  },

  // Liest aus localStorage
  _lsGet(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  // Schreibt in localStorage
  _lsSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { }
  },

  // ── Questions (zentral, unverändert) ────────────────────────
  async loadQuestions() {
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('questions'));
        if (r.ok) {
          const d = await r.json();
          if (d.categories) { this._lsSet(this._LS_Q, d); return d; }
        }
      } catch { /* Server nicht erreichbar – lokaler Fallback */ }
    }
    const local = this._lsGet(this._LS_Q);
    return (local && local.categories) ? local : { categories: [] };
  },

  async saveQuestions(questionBank) {
    this._lsSet(this._LS_Q, questionBank);
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('questions'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(questionBank)
        });
        return r.ok;
      } catch { /* Server nicht erreichbar */ }
    }
    return false;
  },

  // ── Games Registry ──────────────────────────────────────────
  async loadGamesRegistry() {
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('games'));
        if (r.ok) return await r.json();
      } catch { }
    }
    return this._lsGet('rq_games_registry') || {};
  },

  async saveGamesRegistry(registry) {
    this._lsSet('rq_games_registry', registry);
    if (this._hasServer()) {
      try {
        await fetch(this._apiUrl('games'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registry)
        });
      } catch { }
    }
  },

  // ── Per-Game State (code-based) ─────────────────────────────
  async loadGameStateByCode(code) {
    code = code.toUpperCase();
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('game', { code }));
        if (r.ok) {
          const d = await r.json();
          if (d.meta) { this._lsSet(this._LS_GS + '_' + code, d); return d; }
          return null;
        }
      } catch { }
    }
    const local = this._lsGet(this._LS_GS + '_' + code);
    return (local && local.meta) ? local : null;
  },

  async saveGameStateByCode(code, gameData) {
    code = code.toUpperCase();
    const { categories, ...state } = gameData;
    this._lsSet(this._LS_GS + '_' + code, state);
    if (this._hasServer()) {
      try {
        await fetch(this._apiUrl('game', { code }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });
      } catch { }
    }
  },

  async deleteGame(code) {
    code = code.toUpperCase();
    try { localStorage.removeItem(this._LS_GS + '_' + code); } catch { }
    if (this._hasServer()) {
      try {
        await fetch(this._apiUrl('game', { code }), { method: 'DELETE' });
      } catch { }
    }
  },

  // ── GameState (dispatcht zu code-basiert wenn Code gesetzt) ─
  async loadGameState() {
    if (this._currentCode) {
      return this.loadGameStateByCode(this._currentCode);
    }
    // Legacy: einzelne gamestate.json (für Migration / Kompatibilität)
    if (this._hasServer()) {
      try {
        const r = await fetch(this._apiUrl('gamestate'));
        if (r.ok) {
          const d = await r.json();
          if (d.meta) { this._lsSet(this._LS_GS, d); return d; }
          return null;
        }
      } catch { }
    }
    const local = this._lsGet(this._LS_GS);
    return (local && local.meta) ? local : null;
  },

  async saveGameState(gameData) {
    if (this._currentCode) {
      return this.saveGameStateByCode(this._currentCode, gameData);
    }
    // Legacy
    const { categories, ...state } = gameData;
    this._lsSet(this._LS_GS, state);
    if (this._hasServer()) {
      try {
        await fetch(this._apiUrl('gamestate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });
      } catch { }
    }
  },

  // ── SSE: Server-Sent Events Subscription ────────────────────
  // Gibt { unsubscribe() } zurück
  subscribeGameState(code, callback) {
    code = code.toUpperCase();
    let stopped = false;
    let eventSource = null;
    let pollInterval = null;

    const startSSE = () => {
      if (stopped) return;
      const url = this._apiUrl('sse', { code });
      eventSource = new EventSource(url);

      eventSource.onmessage = (e) => {
        if (stopped) return;
        try {
          const data = JSON.parse(e.data);
          if (data.meta) callback(data);
        } catch { }
      };

      eventSource.addEventListener('reconnect', () => {
        // Server hat die Verbindung nach 30s beendet, reconnect automatisch
      });

      eventSource.onerror = () => {
        if (stopped) return;
        // SSE fehlgeschlagen → Fallback auf Polling
        if (eventSource) { eventSource.close(); eventSource = null; }
        startPolling();
      };
    };

    const startPolling = () => {
      if (stopped || pollInterval) return;
      const doPoll = async () => {
        if (stopped) return;
        try {
          const gs = await this.loadGameStateByCode(code);
          if (gs) callback(gs);
        } catch { }
      };
      doPoll();
      pollInterval = setInterval(doPoll, 1000);
    };

    // Start: SSE wenn Server verfügbar, sonst Polling
    if (this._hasServer()) {
      startSSE();
    } else {
      startPolling();
    }

    return {
      unsubscribe() {
        stopped = true;
        if (eventSource) { eventSource.close(); eventSource = null; }
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      }
    };
  },

  exportToFile(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try { resolve(JSON.parse(e.target.result)); }
        catch { reject(new Error('Ungültiges JSON-Format')); }
      };
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
      reader.readAsText(file);
    });
  }
};

// ============================================================
// GameModel
// ============================================================
const GameModel = {
  DIFFICULTIES: [100, 200, 300, 400, 500],

  TEAM_COLORS: [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12',
    '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'
  ],

  generateToken() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  },

  isTeamEliminated(team) {
    return team.score <= 0;
  },

  canTeamSteal(team) {
    return team.score >= 100 && !this.isTeamEliminated(team);
  },

  createGame({
    title = 'Neues Spiel',
    startCapital = 500,
    allowNegative = false,
    showCorrectAnswer = false,
    timerSeconds = 30,
    timerEnabled = true,
    stealMode = false,
    gameCode = null
  } = {}) {
    const id = 'spiel-' + Date.now();
    const teamDefs = [
      { name: 'Team 1', color: '#e74c3c' },
      { name: 'Team 2', color: '#3498db' },
      { name: 'Team 3', color: '#2ecc71' },
      { name: 'Team 4', color: '#f39c12' },
      { name: 'Team 5', color: '#9b59b6' },
      { name: 'Team 6', color: '#1abc9c' },
      { name: 'Team 7', color: '#e67e22' },
      { name: 'Team 8', color: '#e91e63' }
    ];
    const base = Date.now();
    const defaultTeams = teamDefs.map((t, i) => ({
      id: base + i + 1,
      name: t.name,
      color: t.color,
      score: 0,
      history: [],
      token: this.generateToken()
    }));
    return {
      meta: {
        id,
        title,
        gameCode: gameCode || this.generateToken(),
        createdAt: new Date().toISOString(),
        settings: {
          startCapital,
          allowNegative,
          showCorrectAnswer,
          timerSeconds,
          timerEnabled,
          stealMode
        }
      },
      teams: defaultTeams,
      boardSlots: [],
      activeTeamIds: defaultTeams.map(t => t.id),
      currentTeamIndex: 0,
      status: 'setup', // setup | running | paused | finished
      session: { playedQuestions: {}, playedCells: {} }
    };
  },

  createTeam(name, color) {
    return {
      id: Date.now() + Math.floor(Math.random() * 1000),
      name,
      color,
      score: 0,
      history: [],
      token: this.generateToken()
    };
  },

  // played + playedBy entfernt – Session übernimmt das
  createQuestion({
    difficulty = 100,
    type = 'open',
    question = '',
    answer = '',
    options = [],
    correctIndex = null,
    hint = ''
  } = {}) {
    return {
      id: 'q-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      difficulty,
      type,
      question,
      answer,
      options: [...options],
      correctIndex,
      hint
    };
  },

  createCategory(name) {
    return {
      id: 'cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name,
      subcategories: []
    };
  },

  createSubcategory(name) {
    return {
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name,
      questions: [],
      subcategories: []
    };
  },

  createSubSubcategory(name) {
    return {
      id: 'subsub-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name,
      questions: [],
      subcategories: []
    };
  },

  createLevel4(name) {
    return {
      id: 'l4-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name,
      questions: []
    };
  },

  // ── Session-Hilfsmethoden ─────────────────────────────────

  cellKey(slot, diff) {
    if (slot.type === 'l4category') {
      return `${slot.categoryId}-${slot.subcategoryId}-${slot.subSubcategoryId}-${slot.l4Id}-${diff}`;
    }
    if (slot.type === 'subsubcategory') {
      return `${slot.categoryId}-${slot.subcategoryId}-${slot.subSubcategoryId}-${diff}`;
    }
    return `${slot.categoryId}-${slot.subcategoryId || 'cat'}-${diff}`;
  },

  // Sammelt alle Fragen eines Knotens rekursiv (beliebige Tiefe)
  _getAllQuestionsInNode(node, diff) {
    let qs = [...(node.questions || [])];
    for (const child of (node.subcategories || [])) {
      qs = qs.concat(this._getAllQuestionsInNode(child));
    }
    return diff !== undefined ? qs.filter(q => q.difficulty === diff) : qs;
  },

  // Rekursive Suche nach einer Frage in einem Knoten
  _findQuestionInNode(node, questionId) {
    const q = (node.questions || []).find(q => q.id === questionId);
    if (q) return q;
    for (const child of (node.subcategories || [])) {
      const found = this._findQuestionInNode(child, questionId);
      if (found) return found;
    }
    return null;
  },

  // Gibt den Pfad-Array von der cat bis zum Blattknoten zurück, der die Frage enthält
  // z.B. [cat, sub] oder [cat, sub, subsub] oder [cat, sub, subsub, l4]
  _findQuestionPathInNode(node, questionId, pathSoFar) {
    if ((node.questions || []).some(q => q.id === questionId)) return [...pathSoFar, node];
    for (const child of (node.subcategories || [])) {
      const found = this._findQuestionPathInNode(child, questionId, [...pathSoFar, node]);
      if (found) return found;
    }
    return null;
  },

  isQuestionPlayed(gameData, qId) {
    return !!(gameData.session?.playedQuestions?.[qId]);
  },

  getQuestionPlayedBy(gameData, qId) {
    return gameData.session?.playedQuestions?.[qId]?.playedBy || null;
  },

  isCellPlayed(gameData, slot, diff) {
    return !!(gameData.session?.playedCells?.[this.cellKey(slot, diff)]);
  },

  markCellPlayed(gameData, slot, diff) {
    if (!gameData.session) gameData.session = { playedQuestions: {}, playedCells: {} };
    gameData.session.playedCells[this.cellKey(slot, diff)] = true;
  },

  resetSession(gameData) {
    gameData.session = { playedQuestions: {}, playedCells: {} };
  },

  getActiveTeams(gameData) {
    if (!gameData.activeTeamIds || gameData.activeTeamIds.length === 0) {
      return gameData.teams;
    }
    return gameData.teams.filter(t => gameData.activeTeamIds.includes(t.id));
  },

  // ── Fragen-Hilfsmethoden ─────────────────────────────────

  getSlotQuestionsForDiff(gameData, slot, diff) {
    const cat = (gameData.categories || []).find(c => c.id === slot.categoryId);
    if (!cat) return [];
    if (slot.type === 'category') {
      return (cat.subcategories || []).flatMap(s => this._getAllQuestionsInNode(s, diff));
    }
    const sub = (cat.subcategories || []).find(s => s.id === slot.subcategoryId);
    if (!sub) return [];
    if (slot.type === 'subcategory') {
      return this._getAllQuestionsInNode(sub, diff);
    }
    const subsub = (sub.subcategories || []).find(ss => ss.id === slot.subSubcategoryId);
    if (!subsub) return [];
    if (slot.type === 'subsubcategory') {
      return this._getAllQuestionsInNode(subsub, diff);
    }
    if (slot.type === 'l4category') {
      const l4 = (subsub.subcategories || []).find(n => n.id === slot.l4Id);
      return l4 ? (l4.questions || []).filter(q => q.difficulty === diff) : [];
    }
    return [];
  },

  // Returns flat array of all questions in the configured board slots
  getQuestionsForSlots(gameData) {
    const slots = gameData.boardSlots || [];
    return slots.flatMap(slot => {
      const cat = (gameData.categories || []).find(c => c.id === slot.categoryId);
      if (!cat) return [];
      if (slot.type === 'category') {
        return (cat.subcategories || []).flatMap(s => this._getAllQuestionsInNode(s));
      }
      const sub = (cat.subcategories || []).find(s => s.id === slot.subcategoryId);
      if (!sub) return [];
      if (slot.type === 'subcategory') return this._getAllQuestionsInNode(sub);
      const subsub = (sub.subcategories || []).find(ss => ss.id === slot.subSubcategoryId);
      if (!subsub) return [];
      if (slot.type === 'subsubcategory') return this._getAllQuestionsInNode(subsub);
      if (slot.type === 'l4category') {
        const l4 = (subsub.subcategories || []).find(n => n.id === slot.l4Id);
        return l4 ? (l4.questions || []) : [];
      }
      return [];
    });
  },

  initTeamScores(gameData) {
    const startCapital = gameData.meta.settings.startCapital;
    gameData.teams.forEach(team => {
      team.score = startCapital;
      team.history = [];
    });
  },

  applyScore(gameData, teamId, questionId, correct) {
    const team = gameData.teams.find(t => t.id === teamId);
    const question = this.findQuestion(gameData, questionId);
    if (!team || !question) return null;

    const scoreBefore = team.score;
    let scoreChange;

    if (correct) {
      scoreChange = question.difficulty;
    } else {
      if (!gameData.meta.settings.allowNegative) {
        scoreChange = -Math.min(team.score, question.difficulty);
      } else {
        scoreChange = -question.difficulty;
      }
    }

    team.score = scoreBefore + scoreChange;

    const categoryLabel = this.getQuestionLabel(gameData, questionId);

    const historyEntry = {
      questionId,
      category: categoryLabel,
      difficulty: question.difficulty,
      correct,
      scoreChange,
      scoreBefore,
      scoreAfter: team.score,
      timestamp: new Date().toISOString()
    };

    team.history.push(historyEntry);

    // Session-basiertes Tracking statt q.played / q.playedBy
    if (!gameData.session) gameData.session = { playedQuestions: {}, playedCells: {} };
    gameData.session.playedQuestions[questionId] = { playedBy: teamId, correct };

    return historyEntry;
  },

  findQuestion(gameData, questionId) {
    for (const cat of (gameData.categories || [])) {
      for (const sub of (cat.subcategories || [])) {
        const found = this._findQuestionInNode(sub, questionId);
        if (found) return found;
      }
    }
    return null;
  },

  // Gibt [cat, sub, ...] zurück – voller Pfad der Knoten bis zur Frage
  findQuestionPath(gameData, questionId) {
    for (const cat of (gameData.categories || [])) {
      for (const sub of (cat.subcategories || [])) {
        const nodePath = this._findQuestionPathInNode(sub, questionId, []);
        if (nodePath) return [cat, ...nodePath];
      }
    }
    return null;
  },

  findCategoryForQuestion(gameData, questionId) {
    const path = this.findQuestionPath(gameData, questionId);
    return path ? path[0] : null;
  },

  findSubcategoryForQuestion(gameData, questionId) {
    const path = this.findQuestionPath(gameData, questionId);
    return path && path.length > 1 ? path[1] : null;
  },

  findSubSubcategoryForQuestion(gameData, questionId) {
    const path = this.findQuestionPath(gameData, questionId);
    return path && path.length > 2 ? path[2] : null;
  },

  getQuestionLabel(gameData, questionId) {
    const path = this.findQuestionPath(gameData, questionId);
    if (!path) return '';
    return path.map(n => n.name).join(' / ');
  },

  isFieldLocked(gameData, teamId, difficulty) {
    const team = gameData.teams.find(t => t.id === teamId);
    if (!team) return true;
    return team.score < difficulty;
  },

  canTeamPlay(gameData, teamId) {
    const team = gameData.teams.find(t => t.id === teamId);
    if (!team) return false;
    const slots = gameData.boardSlots || [];
    return this.DIFFICULTIES.some(diff =>
      team.score >= diff &&
      slots.some(slot => {
        if (this.isCellPlayed(gameData, slot, diff)) return false;
        const qs = this.getSlotQuestionsForDiff(gameData, slot, diff);
        return qs.some(q => !this.isQuestionPlayed(gameData, q.id));
      })
    );
  },

  isGameFinished(gameData) {
    const slots = gameData.boardSlots || [];
    if (slots.length === 0) return false;

    // Alle Fragen gespielt?
    const allCellsPlayed = this.DIFFICULTIES.every(diff =>
      slots.every(slot => {
        const qs = this.getSlotQuestionsForDiff(gameData, slot, diff);
        if (qs.length === 0) return true; // Keine Fragen = zählt als erledigt
        return qs.every(q => this.isQuestionPlayed(gameData, q.id));
      })
    );
    if (allCellsPlayed) return true;

    // Kein aktives Team kann spielen?
    const activeTeams = this.getActiveTeams(gameData);
    return !activeTeams.some(t => this.canTeamPlay(gameData, t.id));
  },

  advanceTeam(gameData) {
    const teams = this.getActiveTeams(gameData);
    const n = teams.length;
    if (n === 0) return;

    for (let i = 1; i <= n; i++) {
      const idx = (gameData.currentTeamIndex + i) % n;
      // Eliminierte Teams (score <= 0) überspringen
      if (this.isTeamEliminated(teams[idx])) continue;
      if (this.canTeamPlay(gameData, teams[idx].id)) {
        gameData.currentTeamIndex = idx;
        return;
      }
    }
    // Kein Team kann spielen
    gameData.status = 'finished';
  },

  getCurrentTeam(gameData) {
    const teams = this.getActiveTeams(gameData);
    return teams[gameData.currentTeamIndex] || null;
  },

  getStats(gameData) {
    const sorted = [...this.getActiveTeams(gameData)].sort((a, b) => b.score - a.score);
    const allQ = this.getQuestionsForSlots(gameData);
    const totalQuestions = allQ.length;
    const playedQuestions = allQ.filter(q => this.isQuestionPlayed(gameData, q.id)).length;
    return {
      winner: sorted[0] || null,
      ranking: sorted,
      totalQuestions,
      playedQuestions
    };
  },

  validate(gameData) {
    const errors = [];
    const warnings = [];

    if (!gameData.meta.title) errors.push('Kein Spieltitel angegeben');
    if (gameData.teams.length < 2) errors.push('Mindestens 2 Teams erforderlich');
    if ((gameData.categories || []).length === 0) errors.push('Keine Kategorien vorhanden');

    const validateLeafNode = (node, labelPath, errors, warnings) => {
      const difficulties = (node.questions || []).map(q => q.difficulty);
      this.DIFFICULTIES.forEach(d => {
        if (!difficulties.includes(d)) warnings.push(`"${labelPath}": Stufe ${d} fehlt`);
      });
      (node.questions || []).forEach(q => {
        if (!q.question) errors.push(`"${labelPath}" / ${q.difficulty}: Kein Fragetext`);
        if (!q.answer) errors.push(`"${labelPath}" / ${q.difficulty}: Keine Antwort`);
        if (q.type === 'mc' && (!q.options || q.options.length < 2)) {
          errors.push(`"${labelPath}" / ${q.difficulty}: MC braucht mind. 2 Optionen`);
        }
      });
    };

    const validateNode = (node, labelPath, errors, warnings) => {
      const children = node.subcategories || [];
      if (children.length > 0) {
        children.forEach(child => validateNode(child, `${labelPath} / ${child.name}`, errors, warnings));
      } else {
        validateLeafNode(node, labelPath, errors, warnings);
      }
    };

    (gameData.categories || []).forEach(cat => {
      if (!cat.subcategories || cat.subcategories.length === 0) {
        warnings.push(`Kategorie "${cat.name}": Keine Unterkategorien`);
        return;
      }
      cat.subcategories.forEach(sub => {
        validateNode(sub, `${cat.name} / ${sub.name}`, errors, warnings);
      });
    });

    return { errors, warnings };
  }
};

// ============================================================
// MDParser
// ============================================================
const MDParser = {
  parse(mdText) {
    const lines = mdText.split('\n').map(l => l.trim());

    // Auto-detect Format B: any ## line that matches "NNN Punkte"
    const isFormatB = lines.some(l => /^## \d+\s+Punkte$/i.test(l));
    if (isFormatB) return this._parseFormatB(lines);

    // ── Format A ─────────────────────────────────────────────
    const result = { categories: [] };
    let currentCategory = null;
    let currentQuestion = null;

    const pushQuestion = () => {
      if (currentQuestion && currentCategory) {
        if (currentQuestion.type === 'mc' && currentQuestion.options.length > 0 && currentQuestion.answer) {
          const idx = currentQuestion.options.findIndex(
            o => o.toLowerCase() === currentQuestion.answer.toLowerCase()
          );
          currentQuestion.correctIndex = idx >= 0 ? idx : null;
        }
        currentCategory.questions.push(currentQuestion);
        currentQuestion = null;
      }
    };

    for (const line of lines) {
      if (/^## (?!#)/.test(line)) {
        pushQuestion();
        currentCategory = { name: line.substring(3).trim(), questions: [] };
        result.categories.push(currentCategory);
      } else if (/^### /.test(line)) {
        pushQuestion();
        const diffStr = line.substring(4).trim();
        const difficulty = parseInt(diffStr);
        if (!isNaN(difficulty)) {
          currentQuestion = GameModel.createQuestion({ difficulty, type: 'open' });
        }
      } else if (line.startsWith('- ') && currentQuestion) {
        const content = line.substring(2).trim();
        if (content.startsWith('type:')) {
          currentQuestion.type = content.substring(5).trim();
        } else if (content.startsWith('q:')) {
          currentQuestion.question = content.substring(2).trim();
        } else if (content.startsWith('a:')) {
          currentQuestion.answer = content.substring(2).trim();
        } else if (content.startsWith('o:')) {
          currentQuestion.options = content.substring(2).trim().split('|').map(o => o.trim());
        } else if (content.startsWith('hint:')) {
          currentQuestion.hint = content.substring(5).trim();
        }
      }
    }
    pushQuestion();
    return result;
  },

  _parseFormatB(lines) {
    const result = { categories: [] };
    const category = { name: '', questions: [] };
    result.categories.push(category);

    let currentDifficulty = 100;
    let currentQuestion = null;
    let readingAnswer = false;

    const pushQuestion = () => {
      if (!currentQuestion) return;
      if (currentQuestion.question) {
        if (currentQuestion.type === 'mc' &&
            currentQuestion.options.length > 0 &&
            currentQuestion.correctIndex !== null) {
          currentQuestion.answer = currentQuestion.options[currentQuestion.correctIndex] || '';
        }
        if (currentQuestion.answer) {
          category.questions.push(currentQuestion);
        }
      }
      currentQuestion = null;
      readingAnswer = false;
    };

    for (const line of lines) {
      const diffMatch = line.match(/^## (\d+)\s+Punkte$/i);
      if (diffMatch) {
        currentDifficulty = parseInt(diffMatch[1]);
        continue;
      }

      if (/^### Frage \d+\s*\(Offen\)/i.test(line)) {
        pushQuestion();
        currentQuestion = GameModel.createQuestion({ difficulty: currentDifficulty, type: 'open' });
        readingAnswer = false;
        continue;
      }

      if (/^### Frage \d+\s*\(Multiple Choice\)/i.test(line)) {
        pushQuestion();
        currentQuestion = GameModel.createQuestion({ difficulty: currentDifficulty, type: 'mc' });
        currentQuestion.options = [];
        readingAnswer = false;
        continue;
      }

      if (/^---+$/.test(line)) {
        pushQuestion();
        continue;
      }

      if (!currentQuestion) continue;

      if (/^\*\*Antwort:\*\*/.test(line)) {
        readingAnswer = true;
        const inline = line.replace(/^\*\*Antwort:\*\*\s*/, '').trim();
        if (inline) currentQuestion.answer = inline;
        continue;
      }

      const correctMatch = line.match(/^\*\*Richtige Antwort:\*\*\s*([A-D])\s*$/i);
      if (correctMatch) {
        currentQuestion.correctIndex = correctMatch[1].toUpperCase().charCodeAt(0) - 65;
        continue;
      }

      if (currentQuestion.type === 'mc' && /^[A-D]\)\s/.test(line)) {
        currentQuestion.options.push(line.replace(/^[A-D]\)\s*/, '').trim());
        continue;
      }

      if (!line) continue;

      if (readingAnswer) {
        currentQuestion.answer = currentQuestion.answer
          ? currentQuestion.answer + ' ' + line
          : line;
        continue;
      }

      currentQuestion.question = currentQuestion.question
        ? currentQuestion.question + ' ' + line
        : line;
    }

    pushQuestion();
    return result;
  },

  validate(parsed) {
    const errors = [];
    const warnings = [];

    if (parsed.categories.length === 0) errors.push('Keine Unterkategorien (## Name) gefunden');

    parsed.categories.forEach(cat => {
      const difficulties = cat.questions.map(q => q.difficulty);
      GameModel.DIFFICULTIES.forEach(d => {
        if (!difficulties.includes(d)) {
          warnings.push(`Unterkategorie "${cat.name}": Schwierigkeitsstufe ${d} fehlt`);
        }
      });
      cat.questions.forEach(q => {
        if (!q.question) errors.push(`Kat. "${cat.name}" / ${q.difficulty}: Kein Fragetext (q:)`);
        if (!q.answer) errors.push(`Kat. "${cat.name}" / ${q.difficulty}: Keine Antwort (a:)`);
        if (q.type === 'mc') {
          if (!q.options || q.options.length < 2) {
            errors.push(`Kat. "${cat.name}" / ${q.difficulty}: MC braucht mind. 2 Optionen (o:)`);
          } else if (q.correctIndex === null || q.correctIndex === -1) {
            warnings.push(`Kat. "${cat.name}" / ${q.difficulty}: Antwort nicht in Optionen gefunden`);
          }
        }
      });
    });

    return { errors, warnings };
  },

  toMarkdown(categoriesOrGame) {
    const categories = categoriesOrGame.categories || [];
    let md = '';
    const headings = ['##', '###', '####', '#####'];

    function writeQuestion(q, prefix) {
      let s = `${prefix} ${q.difficulty}\n`;
      s += `- type: ${q.type}\n`;
      s += `- q: ${q.question}\n`;
      if (q.type === 'mc' && q.options && q.options.length > 0) {
        s += `- o: ${q.options.join(' | ')}\n`;
      }
      s += `- a: ${q.answer}\n`;
      if (q.hint) s += `- hint: ${q.hint}\n`;
      s += '\n';
      return s;
    }

    function writeNode(node, depth) {
      const diffPrefix = headings[Math.min(depth + 1, headings.length - 1)];
      const children = node.subcategories || [];
      // Direkte Fragen an diesem Knoten
      [...(node.questions || [])].sort((a, b) => a.difficulty - b.difficulty).forEach(q => {
        md += writeQuestion(q, diffPrefix);
      });
      // Kind-Knoten
      children.forEach(child => {
        if (this._getAllQuestionsInNode(child).length === 0) return;
        md += `${headings[Math.min(depth + 1, headings.length - 1)]} ${child.name}\n\n`;
        writeNode.call(this, child, depth + 1);
      });
    }

    categories.forEach(cat => {
      (cat.subcategories || []).forEach(sub => {
        if (this._getAllQuestionsInNode(sub).length === 0) return;
        md += `## ${sub.name}\n\n`;
        writeNode.call(this, sub, 1);
      });
    });
    return md;
  }
};
