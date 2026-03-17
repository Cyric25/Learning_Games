// game.js – Spiellogik Risiko-Quiz

const TIMER_CIRCUMFERENCE = 326.73; // 2 * Math.PI * 52 (SVG-Kreisring r=52)

let gameData = null;
let timerInterval = null;
let timerRemaining = 0;
let currentQuestionId = null;
let currentSlot = null;
let modalResolved = false;
let selectedMcIndex = null;
let pendingSlots = [];
let selectedTeamIds = [];    // für Team-Select-Screen

const slotSourceCollapsed = new Map(); // catId → bool

// Klau-Modus
let stealPhase = false;
let stealTeamsRemaining = [];  // team IDs die noch nicht versucht haben
let stealCurrentTeamId = null; // Team das gerade antwortet
let stealOriginalTeamId = null;

// Team-Action-Poll (für view.html Interaktivität)
let teamActionPollInterval = null;
let sseSubscription = null;

// ── Game-Code Anzeige ─────────────────────────────────────────
function updateGameCodeDisplays() {
  const code = StorageManager.getGameCode();
  if (!code) return;
  // Slot-Screen
  const slotEl = document.getElementById('slot-game-code');
  const slotVal = document.getElementById('slot-code-value');
  if (slotEl && slotVal) { slotVal.textContent = code; slotEl.style.display = ''; }
  // Team-Screen
  const tsEl = document.getElementById('ts-game-code');
  const tsVal = document.getElementById('ts-code-value');
  if (tsEl && tsVal) { tsVal.textContent = code; tsEl.style.display = ''; }
  // Header
  const headerEl = document.getElementById('header-game-code');
  if (headerEl) { headerEl.textContent = '🎮 ' + code; headerEl.style.display = ''; }
}

function copyCode(el) {
  const code = StorageManager.getGameCode();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const orig = el.textContent;
    el.textContent = '✓ Kopiert!';
    setTimeout(() => { el.textContent = orig; }, 1200);
  }).catch(() => {});
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  // Nur URL-Parameter lädt ein Spiel direkt — sonst immer Join-Screen
  const urlCode = new URLSearchParams(window.location.search).get('code');

  if (!urlCode) {
    // URL säubern (falls ?code= durch History noch drin war)
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    showJoinScreen();
    return;
  }

  // Code aus URL entfernen damit Zurück-Navigation sauber ist
  window.history.replaceState({}, '', window.location.pathname);
  await loadGame(urlCode.toUpperCase());
}

function showJoinScreen() {
  // Alle anderen Screens verstecken
  document.getElementById('setup-screen').classList.remove('open');
  document.getElementById('slot-screen').style.display = 'none';
  document.getElementById('team-select-screen').style.display = 'none';
  var h = document.getElementById('header'); if (h) h.style.display = 'none';
  var m = document.getElementById('main'); if (m) m.style.display = 'none';
  // Join-Screen anzeigen
  document.getElementById('join-screen').style.display = 'flex';
}

async function joinGame() {
  const input = document.getElementById('join-code');
  const code = input.value.trim().toUpperCase();
  const errorEl = document.getElementById('join-error');

  if (!code || code.length < 4) {
    errorEl.textContent = 'Bitte einen 4-stelligen Code eingeben.';
    errorEl.style.display = '';
    return;
  }

  errorEl.style.display = 'none';
  StorageManager.setGameCode(code);

  try {
    const gs = await StorageManager.loadGameState();
    if (!gs || !gs.meta) {
      errorEl.textContent = 'Spiel "' + code + '" nicht gefunden.';
      errorEl.style.display = '';
      StorageManager.setGameCode(null);
      return;
    }
  } catch {
    errorEl.textContent = 'Verbindungsfehler. Bitte erneut versuchen.';
    errorEl.style.display = '';
    StorageManager.setGameCode(null);
    return;
  }

  // Spieler/Tafelmodus → view.html (dort Team-Auswahl)
  window.location.href = 'view.html?code=' + code;
}

async function createNewGame() {
  const errorEl = document.getElementById('join-error');
  errorEl.style.display = 'none';
  try {
    const gameCode = GameModel.generateToken();
    const game = GameModel.createGame({ gameCode });
    StorageManager.setGameCode(gameCode);
    await StorageManager.saveGameState(game);
    document.getElementById('join-screen').style.display = 'none';

    // Fragen laden und direkt mit dem erstellten Spiel arbeiten (nicht nochmal vom Server laden)
    const qb = await StorageManager.loadQuestions();
    gameData = { ...game, categories: qb.categories };
    updateGameCodeDisplays();

    if (gameData.categories.length === 0) {
      showSetupScreen('Keine Fragen vorhanden. Bitte zuerst Fragen anlegen.');
      return;
    }
    showSlotScreen();
  } catch (err) {
    console.error('createNewGame error:', err);
    errorEl.textContent = 'Fehler: ' + (err.message || err);
    errorEl.style.display = '';
  }
}

async function loadGame(code) {
  StorageManager.setGameCode(code);

  const [qb, gs] = await Promise.all([
    StorageManager.loadQuestions(),
    StorageManager.loadGameState()
  ]);

  const state = gs || GameModel.createGame({ gameCode: code });
  if (!state.session) GameModel.resetSession(state);
  // Merge: categories aus questions.json + state aus gamestate.json
  gameData = { ...state, categories: qb.categories };

  // Absicherung: Alte Spiele ohne Standard-Teams → nachträglich erzeugen
  if (!gameData.teams || gameData.teams.length === 0) {
    const fresh = GameModel.createGame({ gameCode: code });
    gameData.teams = fresh.teams;
    gameData.activeTeamIds = fresh.activeTeamIds;
  }

  updateGameCodeDisplays();

  if (gameData.categories.length === 0) {
    showSetupScreen('Keine Fragen vorhanden. Bitte zuerst Fragen anlegen.');
    return;
  }

  // Im Setup-Status direkt zur Konfiguration (Slots → Teams), keine Validierung nötig
  if (gameData.status === 'setup') {
    if (!gameData.boardSlots || gameData.boardSlots.length === 0) {
      showSlotScreen();
    } else {
      showTeamSelectScreen();
    }
    return;
  }

  const v = GameModel.validate(gameData);
  if (v.errors.length) {
    showSetupScreen('Spiel unvollständig: ' + v.errors[0]);
    return;
  }

  startGame();
}

function showSetupScreen(msg, canStart) {
  document.getElementById('slot-screen').style.display = 'none';
  document.getElementById('team-select-screen').style.display = 'none';
  document.getElementById('setup-screen').classList.add('open');

  if (msg) document.getElementById('setup-msg').textContent = msg;

  if (canStart) {
    document.getElementById('setup-msg').textContent =
      `Spiel bereit: "${gameData.meta.title}" – ${gameData.teams.length} Teams, ` +
      `${gameData.categories.length} Kategorien`;
    document.getElementById('btn-start-game').style.display = '';
  }

  const configBtn = document.getElementById('btn-configure-slots');
  if (configBtn) {
    configBtn.style.display = (gameData && gameData.categories.length > 0) ? '' : 'none';
  }
}

// ── Slot Screen ───────────────────────────────────────────────
function showSlotScreen() {
  pendingSlots = [...(gameData.boardSlots || [])];
  document.getElementById('setup-screen').classList.remove('open');
  document.getElementById('team-select-screen').style.display = 'none';
  document.getElementById('slot-screen').style.display = 'flex';
  renderSlotSourceList();
  renderSlotSelectedList();
}

function renderSlotSourceList() {
  const list = document.getElementById('slot-source-list');
  list.innerHTML = '';

  if (!gameData.categories || gameData.categories.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary);">Keine Kategorien vorhanden.</p>';
    return;
  }

  gameData.categories.forEach(cat => {
    // Standard: eingeklappt; wird beim ersten Klick aufgeklappt
    const collapsed = slotSourceCollapsed.has(cat.id) ? slotSourceCollapsed.get(cat.id) : true;

    // Category accordion header (entire header is clickable)
    const header = document.createElement('div');
    header.className = 'slot-cat-header' + (collapsed ? ' collapsed' : '');
    header.innerHTML = `
      <span class="slot-cat-chevron">▼</span>
      <span class="slot-cat-label">${escHtml(cat.name)}</span>
    `;
    header.addEventListener('click', () => {
      slotSourceCollapsed.set(cat.id, !slotSourceCollapsed.get(cat.id));
      renderSlotSourceList();
    });
    list.appendChild(header);

    if (collapsed) return;

    const tree = document.createElement('div');
    tree.className = 'slot-tree';

    // Ebene 0: Hauptkategorie "alle"
    const catSlot = { type: 'category', categoryId: cat.id, displayName: cat.name };
    const catActive = pendingSlots.some(s => s.type === 'category' && s.categoryId === cat.id);
    tree.appendChild(makeTreeItem(catSlot, cat.name + ' (alle)', 0, catActive));

    (cat.subcategories || []).forEach(sub => {
      // Ebene 1: 1.Unterkat
      const subSlot = {
        type: 'subcategory',
        categoryId: cat.id,
        subcategoryId: sub.id,
        displayName: sub.name
      };
      const subActive = pendingSlots.some(s =>
        s.type === 'subcategory' && s.subcategoryId === sub.id
      );
      tree.appendChild(makeTreeItem(subSlot, sub.name, 1, subActive));

      // Ebene 2: 2.Unterkat
      (sub.subcategories || []).forEach(subsub => {
        const subsubSlot = {
          type: 'subsubcategory',
          categoryId: cat.id,
          subcategoryId: sub.id,
          subSubcategoryId: subsub.id,
          displayName: subsub.name
        };
        const subsubActive = pendingSlots.some(s =>
          s.type === 'subsubcategory' && s.subSubcategoryId === subsub.id
        );
        tree.appendChild(makeTreeItem(subsubSlot, subsub.name, 2, subsubActive));

        // Ebene 3: 3.Unterkat (l4)
        (subsub.subcategories || []).forEach(l4 => {
          const l4Slot = {
            type: 'l4category',
            categoryId: cat.id,
            subcategoryId: sub.id,
            subSubcategoryId: subsub.id,
            l4Id: l4.id,
            displayName: l4.name
          };
          const l4Active = pendingSlots.some(s =>
            s.type === 'l4category' && s.l4Id === l4.id
          );
          tree.appendChild(makeTreeItem(l4Slot, l4.name, 3, l4Active));
        });
      });
    });

    list.appendChild(tree);
  });
}

function makeTreeItem(slot, label, indent, active) {
  const item = document.createElement('div');
  item.className = 'slot-tree-item' + (active ? ' active' : '');
  item.dataset.indent = indent;
  item.style.setProperty('--indent', indent);
  item.innerHTML = `
    <span class="slot-tree-add">${active ? '✓' : '+'}</span>
    <span class="slot-tree-label">${escHtml(label)}</span>
  `;
  item.addEventListener('click', () => toggleSlot(slot));
  return item;
}

function toggleSlot(slot) {
  const idx = pendingSlots.findIndex(s =>
    s.type === slot.type &&
    s.categoryId === slot.categoryId &&
    (slot.type === 'category' || s.subcategoryId === slot.subcategoryId) &&
    (slot.type !== 'subsubcategory' && slot.type !== 'l4category' || s.subSubcategoryId === slot.subSubcategoryId) &&
    (slot.type !== 'l4category' || s.l4Id === slot.l4Id)
  );

  if (idx !== -1) {
    pendingSlots.splice(idx, 1);
  } else {
    if (pendingSlots.length >= 8) return;
    pendingSlots.push(slot);
  }

  renderSlotSourceList();
  renderSlotSelectedList();
}

function renderSlotSelectedList() {
  const list = document.getElementById('slot-selected-list');
  document.getElementById('slot-count').textContent = pendingSlots.length;
  const fillEl = document.getElementById('slot-progress-fill');
  if (fillEl) fillEl.style.width = Math.round(pendingSlots.length / 8 * 100) + '%';
  list.innerHTML = '';

  if (pendingSlots.length === 0) {
    list.innerHTML = '<div class="slot-empty-hint">Noch keine Spalten gewählt.</div>';
    return;
  }

  const typeLabel = { category: '(alle)', subsubcategory: '(2.UK)', l4category: '(3.UK)' };
  pendingSlots.forEach((slot, idx) => {
    const item = document.createElement('div');
    item.className = 'slot-selected-item';
    item.innerHTML = `
      <span class="slot-item-num">${idx + 1}</span>
      <span class="slot-item-label">
        ${escHtml(slot.displayName)}
        ${typeLabel[slot.type] ? `<small>${typeLabel[slot.type]}</small>` : ''}
      </span>
      <button class="slot-remove-btn" onclick="removeSlot(${idx})">✕</button>
    `;
    list.appendChild(item);
  });
}

function removeSlot(idx) {
  pendingSlots.splice(idx, 1);
  renderSlotSourceList();
  renderSlotSelectedList();
}

function confirmSlots() {
  if (pendingSlots.length === 0) {
    alert('Bitte mindestens eine Spalte wählen.');
    return;
  }
  gameData.boardSlots = [...pendingSlots];
  document.getElementById('slot-screen').style.display = 'none';
  autosave();
  showTeamSelectScreen();
}

// ── Team Select Screen ────────────────────────────────────────
function showTeamSelectScreen() {
  // Sicherstellen dass Teams existieren
  if (!gameData.teams || gameData.teams.length === 0) {
    const base = Date.now();
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
    gameData.teams = teamDefs.map((t, i) => ({
      id: base + i + 1, name: t.name, color: t.color,
      score: 0, history: [], token: GameModel.generateToken()
    }));
    gameData.activeTeamIds = gameData.teams.map(t => t.id);
    autosave();
  }
  selectedTeamIds = [...(gameData.activeTeamIds || gameData.teams.map(t => t.id))];
  renderTeamSelectList();

  // Einstellungen aus gameData laden
  const s = gameData.meta.settings;
  const el = (id) => document.getElementById(id);
  if (el('ts-start-capital'))  el('ts-start-capital').value  = s.startCapital  ?? 500;
  if (el('ts-timer-enabled'))  el('ts-timer-enabled').checked = s.timerEnabled  !== false;
  if (el('ts-timer-seconds'))  el('ts-timer-seconds').value  = s.timerSeconds  ?? 30;
  if (el('ts-show-answer'))    el('ts-show-answer').checked   = !!s.showCorrectAnswer;
  if (el('ts-allow-negative')) el('ts-allow-negative').checked = !!s.allowNegative;
  if (el('ts-steal-mode'))     el('ts-steal-mode').checked    = !!s.stealMode;
  if (el('ts-steal-penalty')) el('ts-steal-penalty').checked = !!s.stealPenalty;
  if (el('ts-question-filter')) el('ts-question-filter').value = s.questionFilter || 'all';
  document.getElementById('slot-screen').style.display = 'none';
  document.getElementById('setup-screen').classList.remove('open');
  document.getElementById('team-select-screen').style.display = 'flex';
}

function renderTeamSelectList() {
  const list = document.getElementById('team-select-list');
  list.innerHTML = '';

  gameData.teams.forEach((team, idx) => {
    const isSelected = selectedTeamIds.includes(team.id);
    const item = document.createElement('div');
    item.className = 'team-select-item' + (isSelected ? ' selected' : '');
    // Team-Link für Schüler: view.html?code=XXXX&t=1 (1-basiert)
    const gameCode = StorageManager.getGameCode() || gameData.meta?.gameCode || '';
    const teamLink = `view.html?code=${gameCode}&t=${idx + 1}`;
    item.innerHTML = `
      <label class="team-select-check">
        <input type="checkbox" ${isSelected ? 'checked' : ''}
          data-team-id="${team.id}" onchange="toggleTeamSelection('${team.id}', this.checked)">
        <span class="team-select-dot" style="background:${team.color};"></span>
      </label>
      <input type="text" class="team-name-input" value="${escHtml(team.name)}"
        placeholder="Teamname" data-team-id="${team.id}"
        oninput="renameTeam('${team.id}', this.value)">
    `;
    list.appendChild(item);
  });
}

function toggleTeamSelection(teamId, checked) {
  // teamId kommt als String aus dem HTML-Attribut → in Zahl umwandeln
  const id = Number(teamId);
  if (checked) {
    if (!selectedTeamIds.includes(id)) selectedTeamIds.push(id);
  } else {
    selectedTeamIds = selectedTeamIds.filter(x => x !== id);
  }
  // Visuelle Markierung aktualisieren
  const items = document.querySelectorAll('.team-select-item');
  items.forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb) item.classList.toggle('selected', cb.checked);
  });
}

function renameTeam(teamId, val) {
  const team = gameData.teams.find(t => t.id == teamId);
  if (team) { team.name = val; }
  autosave();
}

function confirmTeams() {
  if (selectedTeamIds.length < 2) {
    alert('Mindestens 2 Teams wählen.');
    return;
  }
  gameData.activeTeamIds = [...selectedTeamIds];

  // Einstellungen speichern
  const s = gameData.meta.settings;
  const el = (id) => document.getElementById(id);
  if (el('ts-start-capital'))  s.startCapital       = Math.max(0, parseInt(el('ts-start-capital').value)  || 500);
  if (el('ts-timer-enabled'))  s.timerEnabled        = el('ts-timer-enabled').checked;
  if (el('ts-timer-seconds'))  s.timerSeconds        = Math.max(5, parseInt(el('ts-timer-seconds').value)  || 30);
  if (el('ts-show-answer'))    s.showCorrectAnswer   = el('ts-show-answer').checked;
  if (el('ts-allow-negative')) s.allowNegative       = el('ts-allow-negative').checked;
  if (el('ts-steal-mode'))     s.stealMode           = el('ts-steal-mode').checked;
  if (el('ts-steal-penalty')) s.stealPenalty        = el('ts-steal-penalty').checked;
  if (el('ts-question-filter')) s.questionFilter    = el('ts-question-filter').value || 'all';

  document.getElementById('team-select-screen').style.display = 'none';
  autosave();
  showStartModal();
}

function showStartModal() {
  // Zeige ein "Spiel starten"-Modal bevor das Spiel live geht
  let modal = document.getElementById('start-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'start-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,30,0.95);z-index:600;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;';
    modal.innerHTML = `
      <h1 style="color:var(--accent);font-size:clamp(2rem,5vw,3rem);margin:0 0 0.5rem;">Bereit!</h1>
      <p style="color:var(--text-secondary);font-size:clamp(1rem,2vw,1.3rem);margin:0 0 0.5rem;">
        ${gameData.activeTeamIds.length} Teams · ${gameData.boardSlots.length} Kategorien
      </p>
      <div id="start-modal-code" style="margin:1rem 0;padding:0.8rem 2rem;background:var(--bg-card);
        border:2px solid var(--accent);border-radius:14px;cursor:pointer;"
        onclick="copyCode(this)" title="Klicken zum Kopieren">
        <span style="color:var(--text-secondary);font-size:0.9rem;">Spielcode:</span>
        <span style="color:var(--accent);font-size:clamp(1.8rem,4vw,2.5rem);font-weight:800;
          letter-spacing:0.2em;margin-left:0.5rem;">${StorageManager.getGameCode() || ''}</span>
      </div>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin:0 0 2rem;">
        Spieler können jetzt mit diesem Code beitreten.
      </p>
      <button onclick="launchGame()" style="padding:1rem 3rem;font-size:clamp(1.2rem,2.5vw,1.6rem);
        font-weight:800;background:var(--success,#2ecc71);color:#fff;border:none;border-radius:14px;
        cursor:pointer;transition:transform 0.15s,opacity 0.2s;"
        onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
        ▶ Spiel starten
      </button>
      <button onclick="document.getElementById('start-modal').remove();showTeamSelectScreen()"
        style="margin-top:1rem;padding:0.6rem 2rem;font-size:1rem;background:none;color:var(--text-secondary);
        border:1px solid var(--border);border-radius:10px;cursor:pointer;">
        ← Zurück
      </button>
    `;
    document.body.appendChild(modal);
  }
}

function launchGame() {
  const modal = document.getElementById('start-modal');
  if (modal) modal.remove();
  startGame();
}

// ── Start Game ────────────────────────────────────────────────
function startGame() {
  if (gameData.status === 'setup') {
    GameModel.initTeamScores(gameData);
    gameData.liveQuestion = null; // Alte offene Frage aus vorheriger Sitzung löschen
    gameData.status = 'running';
    gameData.currentTeamIndex = 0;
    preselectQuestions(); // Fragen mit ausgeglichener MC/Offen-Verteilung vorauswählen
    autosave();
  }

  document.getElementById('setup-screen').classList.remove('open');
  document.getElementById('slot-screen').style.display = 'none';
  document.getElementById('team-select-screen').style.display = 'none';
  document.getElementById('header').style.display = '';
  document.getElementById('main').style.display = '';
  document.getElementById('team-bar').style.display = '';
  document.getElementById('game-title').textContent = gameData.meta.title;

  renderBoard();
  renderTeamBar();

  if (GameModel.isGameFinished(gameData)) {
    showEndScreen();
  }
}

function autosave() {
  if (gameData) StorageManager.saveGameState(gameData); // async, fire-and-forget
}

// ── Board ────────────────────────────────────────────────────
function renderBoard() {
  const board = document.getElementById('board');
  const slots = gameData.boardSlots || [];
  const diffs = GameModel.DIFFICULTIES;
  const currentTeam = GameModel.getCurrentTeam(gameData);

  if (slots.length === 0) {
    board.innerHTML = '<p style="color:var(--text-secondary);grid-column:1/-1;text-align:center;padding:2rem;">Keine Spalten konfiguriert.</p>';
    return;
  }

  board.style.gridTemplateColumns = `repeat(${slots.length}, 1fr)`;
  board.style.gridTemplateRows = `auto repeat(${diffs.length}, minmax(0, 1fr))`;
  board.innerHTML = '';

  // Category/slot headers
  slots.forEach(slot => {
    const header = document.createElement('div');
    header.className = 'category-header';
    header.textContent = slot.displayName;
    board.appendChild(header);
  });

  // Question cells
  diffs.forEach(diff => {
    slots.forEach(slot => {
      const allQ = applyQuestionFilter(getSlotQuestionsForDiff(slot, diff));
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.diff = diff;

      if (allQ.length === 0) {
        cell.innerHTML = `<span class="cell-value" style="opacity:0.2;">–</span>`;
        cell.style.background = '#0d0d1f';
        cell.style.cursor = 'default';
        board.appendChild(cell);
        return;
      }

      const isCellDone = GameModel.isCellPlayed(gameData, slot, diff);
      const unplayedQ = allQ.filter(q => !GameModel.isQuestionPlayed(gameData, q.id));
      const isLocked = currentTeam
        ? GameModel.isFieldLocked(gameData, currentTeam.id, diff)
        : false;

      if (isCellDone || unplayedQ.length === 0) {
        // Wer hat diese Zelle gespielt?
        const playedQ = allQ.find(q => GameModel.isQuestionPlayed(gameData, q.id));
        const playedByTeamId = playedQ
          ? GameModel.getQuestionPlayedBy(gameData, playedQ.id)
          : null;
        cell.classList.add('played');
        cell.innerHTML = `
          <span class="cell-value">${diff}</span>
          <span class="cell-team-marker" style="background:${getTeamColor(playedByTeamId)};"></span>
        `;
      } else if (isLocked) {
        cell.classList.add('locked');
        cell.innerHTML = `<span class="cell-value">${diff}</span>`;
      } else {
        cell.innerHTML = `<span class="cell-value">${diff}</span>`;
        cell.addEventListener('click', () => {
          const key = GameModel.cellKey(slot, diff);
          const selectedId = gameData.session?.selectedQuestions?.[key];
          // Vorausgewählte Frage verwenden, falls noch nicht gespielt; sonst Zufallsfallback
          const pick = (selectedId && unplayedQ.find(q => q.id === selectedId))
            || unplayedQ[Math.floor(Math.random() * unplayedQ.length)];
          openQuestion(slot, pick.id);
        });
      }

      board.appendChild(cell);
    });
  });
}

function getAllQuestionsInNode(node, diff) {
  let qs = [...(node.questions || [])];
  for (const child of (node.subcategories || [])) {
    qs = qs.concat(getAllQuestionsInNode(child)); // rekursiv: alle Ebenen
  }
  return diff !== undefined ? qs.filter(q => q.difficulty === diff) : qs;
}

function applyQuestionFilter(questions) {
  const filter = gameData?.meta?.settings?.questionFilter || 'all';
  if (filter === 'mc')   return questions.filter(q => q.type === 'mc');
  if (filter === 'open') return questions.filter(q => q.type !== 'mc');
  return questions;
}

function getSlotQuestionsForDiff(slot, diff) {
  const cat = gameData.categories.find(c => c.id === slot.categoryId);
  if (!cat) return [];
  if (slot.type === 'category') {
    return (cat.subcategories || []).flatMap(s => getAllQuestionsInNode(s, diff));
  }
  const sub = (cat.subcategories || []).find(s => s.id === slot.subcategoryId);
  if (!sub) return [];
  if (slot.type === 'subcategory') return getAllQuestionsInNode(sub, diff);
  const subsub = (sub.subcategories || []).find(ss => ss.id === slot.subSubcategoryId);
  if (!subsub) return [];
  if (slot.type === 'subsubcategory') return getAllQuestionsInNode(subsub, diff);
  if (slot.type === 'l4category') {
    const l4 = (subsub.subcategories || []).find(n => n.id === slot.l4Id);
    return l4 ? (l4.questions || []).filter(q => q.difficulty === diff) : [];
  }
  return [];
}

function getTeamColor(teamId) {
  if (!teamId) return 'transparent';
  const team = gameData.teams.find(t => t.id == teamId);
  return team ? team.color : 'transparent';
}

// ── Fragen-Vorauswahl bei Spielstart ──────────────────────────
// Wählt pro Feld (Slot × Schwierigkeit) eine Frage aus und speichert
// sie in session.selectedQuestions. Verteilung MC vs. Offen wird
// so gleichmäßig wie möglich gehalten.
function preselectQuestions() {
  if (!gameData.session) gameData.session = { playedQuestions: {}, playedCells: {} };
  gameData.session.selectedQuestions = {};

  const cells = [];
  for (const diff of GameModel.DIFFICULTIES) {
    for (const slot of (gameData.boardSlots || [])) {
      const allQ = applyQuestionFilter(getSlotQuestionsForDiff(slot, diff));
      if (allQ.length > 0) cells.push({ slot, diff, allQ });
    }
  }

  // Zufällige Reihenfolge, damit die Verteilung nicht systematisch verzerrt wird
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  let mcCount = 0;
  let openCount = 0;

  for (const { slot, diff, allQ } of cells) {
    const key = GameModel.cellKey(slot, diff);
    const mcQ   = allQ.filter(q => q.type === 'mc');
    const openQ = allQ.filter(q => q.type !== 'mc');

    // Bevorzuge den Typ, der bisher seltener war
    let pool;
    if (mcQ.length > 0 && openQ.length > 0) {
      pool = mcCount <= openCount ? mcQ : openQ;
    } else {
      pool = openQ.length > 0 ? openQ : mcQ;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    gameData.session.selectedQuestions[key] = pick.id;
    if (pick.type === 'mc') mcCount++;
    else openCount++;
  }
}

// ── Team Bar ─────────────────────────────────────────────────
function renderTeamBar() {
  const bar = document.getElementById('team-bar');
  bar.innerHTML = '';

  const activeTeams = GameModel.getActiveTeams(gameData);
  activeTeams.forEach((team, idx) => {
    const isActive = idx === gameData.currentTeamIndex;
    const isEliminated = GameModel.isTeamEliminated(team);
    const card = document.createElement('div');
    card.className = 'team-card'
      + (isActive ? ' active' : '')
      + (isEliminated ? ' eliminated' : '');
    card.dataset.teamId = team.id;

    const recentHistory = [...team.history].reverse().slice(0, 5);
    const historyHtml = recentHistory.length
      ? recentHistory.map(h =>
          `<div class="history-item">
            <span>${escHtml(h.category)} / ${h.difficulty}</span>
            <span class="hi-change ${h.correct ? 'pos' : 'neg'}">
              ${h.correct ? '+' : ''}${h.scoreChange}
            </span>
          </div>`
        ).join('')
      : '<div style="color:var(--text-secondary);font-size:0.85rem;">Noch keine Züge</div>';

    card.innerHTML = `
      <span class="team-color-dot" style="background:${team.color};"></span>
      <span class="team-name">${escHtml(team.name)}</span>
      <span class="team-score" id="score-${team.id}">${team.score}</span>
      <span class="score-delta" id="delta-${team.id}"></span>
      <div class="history-popup">
        <h4>${escHtml(team.name)} – Verlauf</h4>
        ${historyHtml}
      </div>
    `;
    bar.appendChild(card);
  });
}

function animateScore(teamId, change) {
  const el = document.getElementById(`delta-${teamId}`);
  if (!el) return;
  el.textContent = (change >= 0 ? '+' : '') + change;
  el.className = 'score-delta';
  void el.offsetWidth; // reflow
  el.classList.add(change >= 0 ? 'animate-up' : 'animate-down');
}

function updateScoreDisplay(teamId) {
  const team = gameData.teams.find(t => t.id == teamId);
  const el = document.getElementById(`score-${teamId}`);
  if (team && el) el.textContent = team.score;
}

// ── Question Modal ────────────────────────────────────────────
function openQuestion(slot, questionId) {
  const q = GameModel.findQuestion(gameData, questionId);
  const currentTeam = GameModel.getCurrentTeam(gameData);
  if (!q || !currentTeam || GameModel.isQuestionPlayed(gameData, questionId)) return;

  currentQuestionId = questionId;
  currentSlot = slot;
  modalResolved = false;
  selectedMcIndex = null;

  // Fill modal
  document.getElementById('modal-category').textContent = slot.displayName;
  document.getElementById('modal-risk').textContent = `Risiko: ${q.difficulty} Punkte`;
  document.getElementById('modal-question-text').textContent = q.question;
  document.getElementById('modal-answer-reveal').style.display = 'none';

  // Team info
  document.getElementById('modal-team-dot').style.background = currentTeam.color;
  document.getElementById('modal-team-name').textContent = currentTeam.name;
  document.getElementById('modal-score-preview').textContent =
    `Kontostand: ${currentTeam.score} → ?`;

  // MC options
  const mcContainer = document.getElementById('modal-mc-options');
  mcContainer.innerHTML = '';
  if (q.type === 'mc' && q.options.length > 0) {
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'mc-option';
      btn.textContent = opt;
      btn.dataset.idx = i;
      btn.addEventListener('click', () => selectMcOption(i, q));
      mcContainer.appendChild(btn);
    });
  }

  // Spielleiter-Infobox: Antwort sofort anzeigen (nur in teacher view)
  const slInfoEl = document.getElementById('modal-sl-info');
  if (slInfoEl) {
    let html = `<span class="sl-label">🔒 Spielleiter</span>`;
    html += `<span class="sl-answer">${escHtml(q.answer || '–')}</span>`;
    if (q.hint) html += `<span class="sl-hint">💡 ${escHtml(q.hint)}</span>`;
    slInfoEl.innerHTML = html;
    slInfoEl.style.display = 'block';
  }

  // Buttons: MC → direkt Richtig/Falsch; Offen → "Lösung für alle zeigen" (Spielleiter sieht Antwort bereits oben)
  const isMc = q.type === 'mc';
  const isStealOpen = gameData.meta.settings.stealMode && q.type === 'open';
  document.getElementById('btn-show-answer').style.display = isMc ? 'none' : '';
  document.getElementById('btn-weiss-nicht').style.display = isStealOpen ? '' : 'none';
  document.getElementById('btn-correct').style.display = isMc ? '' : 'none';
  document.getElementById('btn-wrong').style.display = isMc ? '' : 'none';
  document.getElementById('btn-modal-close').style.display = 'none';
  document.getElementById('btn-correct').disabled = false;
  document.getElementById('btn-wrong').disabled = false;

  // Aktuelle Frage für Schüler-Ansicht speichern (inkl. neue Felder für Teaminteraktivität)
  gameData.liveQuestion = {
    id: questionId,
    teamId: currentTeam.id,       // Wessen Zug ist es
    openedAt: Date.now(),
    resolved: false,
    answer: null,
    selectedMcIndex: null,        // MC-Auswahl durch Team (→ gelb auf allen Screens)
    stealPhase: false,            // Klau-Modus aktiv?
    stealCandidates: [],          // Teams die "Ich weiß es!" gedrückt haben
    stealPickedTeam: null,        // Vom Spielleiter ausgewähltes Team
    teamPassedQuestion: false     // Team hat "Weiß nicht" gedrückt
  };
  autosave();
  startTeamActionPoll();

  // Timer zurücksetzen und starten
  const settings = gameData.meta.settings;
  timerRemaining = settings.timerSeconds;
  const numberEl = document.getElementById('timer-number');
  const ringFill = document.getElementById('timer-ring-fill');
  const timerEl  = document.getElementById('modal-timer');
  if (numberEl) numberEl.textContent = timerRemaining;
  if (ringFill) {
    ringFill.style.transition = 'none';
    ringFill.style.strokeDashoffset = '0';
    void ringFill.getBoundingClientRect();
    ringFill.style.transition = '';
  }
  if (timerEl) timerEl.className = '';
  startTimer();

  document.getElementById('question-modal').classList.add('open');
}

function selectMcOption(idx) {
  if (modalResolved) return;
  selectedMcIndex = idx;

  // Gewählte Option gelb markieren – korrekte/falsche erst nach "Lösung anzeigen"
  document.querySelectorAll('.mc-option').forEach((btn, i) => {
    btn.classList.remove('correct', 'wrong', 'mc-selected-pending');
    if (i === idx) btn.classList.add('mc-selected-pending');
  });

  // Für view.html: gewählte Option syncen (erscheint gelb auf allen Screens)
  if (gameData.liveQuestion) {
    gameData.liveQuestion.selectedMcIndex = idx;
    autosave();
  }
}

function startTimer() {
  clearInterval(timerInterval);
  const timerEl   = document.getElementById('modal-timer');
  const ringFill  = document.getElementById('timer-ring-fill');
  const numberEl  = document.getElementById('timer-number');
  const timerTotal = timerRemaining;

  timerInterval = setInterval(() => {
    timerRemaining--;
    if (numberEl) numberEl.textContent = timerRemaining;
    if (ringFill) {
      ringFill.style.strokeDashoffset =
        TIMER_CIRCUMFERENCE * (1 - Math.max(0, timerRemaining) / timerTotal);
    }
    if (timerEl) {
      if (timerRemaining <= 5)       timerEl.className = 'danger';
      else if (timerRemaining <= 10) timerEl.className = 'warning';
    }
    if (timerRemaining <= 0) {
      clearInterval(timerInterval);
      timerExpired();
    }
  }, 1000);
}

function timerExpired() {
  if (modalResolved) return;
  playTimerSound();
  const q = GameModel.findQuestion(gameData, currentQuestionId);
  if (q) {
    // Bei MC: korrekte Option hervorheben, gewählte Option als richtig/falsch markieren
    if (q.type === 'mc') {
      document.querySelectorAll('.mc-option').forEach((btn, i) => {
        btn.classList.remove('mc-selected-pending', 'correct', 'wrong');
        if (i === q.correctIndex) btn.classList.add('correct');
        else if (i === selectedMcIndex && i !== q.correctIndex) btn.classList.add('wrong');
      });
    }
    // Antwort anzeigen (bei Klau-Modus + offener Frage erst nach Steal-Phase)
    const showNow = q.type !== 'open' || !gameData.meta.settings.stealMode;
    if (showNow) {
      const revealEl = document.getElementById('modal-answer-reveal');
      revealEl.textContent = '⏱ Zeit! Antwort: ' + q.answer;
      revealEl.style.display = 'block';
      if (gameData.liveQuestion) gameData.liveQuestion.answer = q.answer || '';
    }
  }
  stopTeamActionPoll();
  resolveQuestion(false);
}

function showAnswerForOpen() {
  const q = GameModel.findQuestion(gameData, currentQuestionId);
  if (!q) return;
  stopTeamActionPoll();

  // Bei MC: korrekte Option grün, ggf. gewählte falsche Option rot markieren
  if (q.type === 'mc') {
    document.querySelectorAll('.mc-option').forEach((btn, i) => {
      btn.classList.remove('mc-selected-pending', 'correct', 'wrong');
      if (i === q.correctIndex) btn.classList.add('correct');
      else if (i === selectedMcIndex && i !== q.correctIndex) btn.classList.add('wrong');
    });
  }

  // Antwort-Text anzeigen (open und MC)
  if (q.answer) {
    const revealEl = document.getElementById('modal-answer-reveal');
    revealEl.textContent = '✓ Antwort: ' + q.answer;
    revealEl.style.display = 'block';
  }

  // Ansichtsseite synchronisieren – Antwort erst jetzt sichtbar machen
  if (gameData.liveQuestion) {
    gameData.liveQuestion.answer = q.answer || '';
    autosave();
  }

  // Timer stoppen – Lehrkraft entscheidet richtig/falsch
  clearInterval(timerInterval);

  // SL-Info ausblenden (öffentliche Antwort ist jetzt sichtbar)
  const slInfoEl = document.getElementById('modal-sl-info');
  if (slInfoEl) slInfoEl.style.display = 'none';

  // Swap buttons: hide "Lösung anzeigen" + "Weiß nicht", show Richtig/Falsch
  document.getElementById('btn-show-answer').style.display = 'none';
  document.getElementById('btn-weiss-nicht').style.display = 'none';
  document.getElementById('btn-correct').style.display = '';
  document.getElementById('btn-wrong').style.display = '';
}

function weissNicht() {
  if (modalResolved) return;
  modalResolved = true;
  clearInterval(timerInterval);

  const currentTeam = GameModel.getCurrentTeam(gameData);
  const q = GameModel.findQuestion(gameData, currentQuestionId);

  // Zelle als gespielt markieren
  if (currentSlot && q) {
    GameModel.markCellPlayed(gameData, currentSlot, q.difficulty);
  }

  // Optionaler Punkteabzug (Einstellung: stealPenalty)
  if (gameData.meta.settings.stealPenalty && currentTeam && q) {
    const scoreBefore = currentTeam.score;
    const penalty = gameData.meta.settings.allowNegative
      ? -q.difficulty
      : -Math.min(currentTeam.score, q.difficulty);
    currentTeam.score = scoreBefore + penalty;
    currentTeam.history.push({
      questionId: currentQuestionId,
      category: GameModel.getQuestionLabel(gameData, currentQuestionId),
      difficulty: q.difficulty,
      correct: false,
      scoreChange: penalty,
      scoreBefore,
      scoreAfter: currentTeam.score,
      timestamp: new Date().toISOString()
    });
    document.getElementById('modal-score-preview').textContent =
      `${scoreBefore} → ${currentTeam.score}`;
    showScoreFlash(false, penalty);
    renderTeamBar();
    // Frage mit Spieler vermerken (für Verlauf-Animation beim Schließen)
    if (!gameData.session) gameData.session = { playedQuestions: {}, playedCells: {} };
    gameData.session.playedQuestions[currentQuestionId] = { playedBy: currentTeam.id, correct: false, passed: true };
  } else {
    // Kein Abzug: Frage ohne Spieler-Zuordnung als gespielt markieren
    if (!gameData.session) gameData.session = { playedQuestions: {}, playedCells: {} };
    gameData.session.playedQuestions[currentQuestionId] = { playedBy: null, correct: false, passed: true };
  }

  // Schüler-Ansicht: Antwort NICHT zeigen – erst nach Steal-Phase
  // liveQuestion.answer bleibt null → view.html zeigt keine Antwort

  stopTeamActionPoll();
  startStealPhase(currentTeam.id);
  autosave();
}

function resolveQuestion(correct) {
  if (modalResolved) return;
  modalResolved = true;
  clearInterval(timerInterval);

  const currentTeam = GameModel.getCurrentTeam(gameData);
  const historyEntry = GameModel.applyScore(gameData, currentTeam.id, currentQuestionId, correct);
  const q = GameModel.findQuestion(gameData, currentQuestionId);

  // Zelle als gespielt markieren – verhindert mehrfache Nutzung desselben Feldes
  if (currentSlot && q) {
    GameModel.markCellPlayed(gameData, currentSlot, q.difficulty);
  }

  // MC: korrekte Antwort grün, gewählte falsche Option rot
  if (q && q.type === 'mc') {
    document.querySelectorAll('.mc-option').forEach((btn, i) => {
      btn.classList.remove('correct', 'wrong', 'mc-selected-pending');
      if (i === q.correctIndex) btn.classList.add('correct');
      else if (selectedMcIndex !== null && i === selectedMcIndex && i !== q.correctIndex)
        btn.classList.add('wrong');
    });
  }

  // Schüler-Ansicht: resolved-Status setzen
  if (gameData.liveQuestion) {
    gameData.liveQuestion.resolved = true;
    gameData.liveQuestion.correct  = correct;
  }

  // Score-Preview
  if (historyEntry) {
    document.getElementById('modal-score-preview').textContent =
      `${historyEntry.scoreBefore} → ${historyEntry.scoreAfter}`;
  }

  showScoreFlash(correct, historyEntry?.scoreChange || 0);

  // ── Klau-Modus: bei falscher offener Frage → Steal-Phase ──
  if (!correct && gameData.meta.settings.stealMode && q && q.type === 'open') {
    const otherTeams = GameModel.getActiveTeams(gameData).filter(t => t.id !== currentTeam.id);
    if (otherTeams.length > 0) {
      startStealPhase(currentTeam.id);
      autosave();
      return; // Antwort-Reveal erst nach der Steal-Phase
    }
  }

  // Antwort für Spieler setzen (sichtbar bis Spielleiter "Weiter" klickt)
  if (gameData.liveQuestion && q?.answer && !gameData.liveQuestion.answer) {
    gameData.liveQuestion.answer = q.answer;
  }

  // Antwort-Reveal auf Spielleiter-Bildschirm (optional, via Einstellung)
  if (gameData.meta.settings.showCorrectAnswer) {
    const revealEl = document.getElementById('modal-answer-reveal');
    revealEl.textContent = '✓ Antwort: ' + (q?.answer || '');
    revealEl.style.display = 'block';
  }

  document.getElementById('btn-show-answer').style.display = 'none';
  document.getElementById('btn-correct').style.display = 'none';
  document.getElementById('btn-wrong').style.display = 'none';
  document.getElementById('btn-modal-close').style.display = '';

  autosave();
}

// ── Klau-Modus ────────────────────────────────────────────────
function startStealPhase(originalTeamId) {
  stealPhase = true;
  stealOriginalTeamId = originalTeamId;
  stealCurrentTeamId = null;
  // Nur Teams mit ≥100 Punkten dürfen klauen
  stealTeamsRemaining = GameModel.getActiveTeams(gameData)
    .filter(t => t.id !== originalTeamId && GameModel.canTeamSteal(t))
    .map(t => t.id);

  document.getElementById('btn-show-answer').style.display = 'none';
  document.getElementById('btn-weiss-nicht').style.display = 'none';
  document.getElementById('btn-correct').style.display = 'none';
  document.getElementById('btn-wrong').style.display = 'none';
  document.getElementById('btn-modal-close').style.display = 'none';

  // Sichtbarkeit zurücksetzen – können von vorherigem Klau-Durchlauf noch versteckt sein
  document.getElementById('steal-team-buttons').style.display = 'flex';
  document.getElementById('btn-steal-skip').style.display = '';

  // liveQuestion für view.html aktualisieren
  if (gameData.liveQuestion) {
    gameData.liveQuestion.stealPhase = true;
    gameData.liveQuestion.stealCandidates = [];
    gameData.liveQuestion.stealPickedTeam = null;
  }

  renderStealButtons();
  renderStealCandidates([]);
  document.getElementById('modal-steal-section').style.display = '';

  // Poll neu starten um Kandidaten aus view.html zu empfangen
  startTeamActionPoll();
}

function renderStealButtons() {
  const container = document.getElementById('steal-team-buttons');
  container.innerHTML = '';

  if (stealTeamsRemaining.length === 0) {
    endStealPhase();
    return;
  }

  stealTeamsRemaining.forEach(teamId => {
    const team = gameData.teams.find(t => t.id === teamId);
    if (!team) return;
    const btn = document.createElement('button');
    btn.className = 'steal-team-btn';
    btn.style.setProperty('--steal-color', team.color);
    btn.innerHTML = `<span class="steal-dot" style="background:${team.color};"></span>${escHtml(team.name)}`;
    btn.addEventListener('click', () => stealTeamClick(teamId));
    container.appendChild(btn);
  });
}

function renderStealCandidates(candidates) {
  const container = document.getElementById('steal-candidates-list');
  if (!container) return;
  container.innerHTML = '';

  if (!candidates || candidates.length === 0) {
    container.innerHTML = '<div class="steal-candidates-empty">⏳ Warte auf Meldungen…</div>';
    return;
  }

  // Nach Meldezeitpunkt sortieren, bereits ausgeschiedene Teams überspringen
  const sorted = [...candidates]
    .filter(c => stealTeamsRemaining.includes(Number(c.teamId)))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  sorted.forEach(({ teamId, teamName }, pos) => {
    const id = Number(teamId);
    const team = gameData.teams.find(t => t.id === id);
    if (!team) return;
    const btn = document.createElement('button');
    btn.className = 'steal-team-btn steal-candidate-btn';
    btn.style.setProperty('--steal-color', team.color);
    btn.innerHTML = `<span class="steal-dot" style="background:${team.color};"></span>${pos + 1}. 🙋 ${escHtml(teamName || team.name)}`;
    btn.addEventListener('click', () => stealTeamClick(id));
    container.appendChild(btn);
  });
}

function stealTeamClick(teamId) {
  stealCurrentTeamId = teamId;
  const team = gameData.teams.find(t => t.id === teamId);
  if (!team) return;

  document.getElementById('modal-team-dot').style.background = team.color;
  document.getElementById('modal-team-name').textContent = team.name + ' ⚡';
  document.getElementById('modal-score-preview').textContent = `Kontostand: ${team.score} → ?`;

  document.getElementById('steal-team-buttons').style.display = 'none';
  document.getElementById('btn-steal-skip').style.display = 'none';
  document.getElementById('btn-correct').style.display = '';
  document.getElementById('btn-correct').disabled = false;
  document.getElementById('btn-wrong').style.display = '';
  document.getElementById('btn-wrong').disabled = false;

  // view.html: ausgewähltes Team mitteilen (zeigt "Du bist dran!"-Banner)
  if (gameData.liveQuestion) {
    gameData.liveQuestion.stealPickedTeam = teamId;
    autosave();
  }
}

function resolveStealAnswer(correct) {
  const teamId = stealCurrentTeamId;
  const team = gameData.teams.find(t => t.id === teamId);
  const q = GameModel.findQuestion(gameData, currentQuestionId);
  if (!team || !q) return;

  const scoreBefore = team.score;
  let scoreChange;
  if (correct) {
    scoreChange = q.difficulty;
  } else {
    // Fixes -100 Strafe beim Klauen (nicht der volle Fragewert)
    const penalty = 100;
    scoreChange = gameData.meta.settings.allowNegative
      ? -penalty
      : -Math.min(team.score, penalty);
  }
  team.score = scoreBefore + scoreChange;

  // Verlauf eintragen
  team.history.push({
    questionId: currentQuestionId,
    category: GameModel.getQuestionLabel(gameData, currentQuestionId),
    difficulty: q.difficulty,
    correct,
    scoreChange,
    scoreBefore,
    scoreAfter: team.score,
    timestamp: new Date().toISOString()
  });

  // Gespielte Frage vermerken (nur bei richtiger Antwort)
  if (correct) {
    if (!gameData.session) gameData.session = { playedQuestions: {}, playedCells: {} };
    gameData.session.playedQuestions[currentQuestionId] = { playedBy: teamId, correct: true };
  }

  document.getElementById('modal-score-preview').textContent =
    `${scoreBefore} → ${team.score}`;
  showScoreFlash(correct, scoreChange);
  renderTeamBar();

  if (correct) {
    endStealPhase();
  } else {
    // Wenn Team durch Strafe auf 0 fällt → eliminiert (grau in Team-Bar)
    if (GameModel.isTeamEliminated(team)) {
      renderTeamBar(); // zeigt .eliminated Klasse
    }
    stealTeamsRemaining = stealTeamsRemaining.filter(id => id !== teamId)
      .filter(id => {
        const t = gameData.teams.find(x => x.id === id);
        return t && GameModel.canTeamSteal(t);
      });
    stealCurrentTeamId = null;
    // view.html: stealPickedTeam zurücksetzen
    if (gameData.liveQuestion) {
      gameData.liveQuestion.stealPickedTeam = null;
      autosave();
    }
    document.getElementById('btn-correct').style.display = 'none';
    document.getElementById('btn-wrong').style.display = 'none';
    // verbleibende Teams zeigen oder Phase beenden
    renderStealButtons();
    if (stealTeamsRemaining.length > 0) {
      document.getElementById('steal-team-buttons').style.display = '';
      document.getElementById('btn-steal-skip').style.display = '';
    }
    autosave();
  }
}

function endStealPhase() {
  stealPhase = false;
  stealCurrentTeamId = null;
  stealTeamsRemaining = [];
  stealOriginalTeamId = null;
  stopTeamActionPoll();

  document.getElementById('modal-steal-section').style.display = 'none';
  document.getElementById('btn-correct').style.display = 'none';
  document.getElementById('btn-wrong').style.display = 'none';

  // Antwort nach Steal-Phase: immer für Spieler setzen, optional öffentlich anzeigen
  const _q = GameModel.findQuestion(gameData, currentQuestionId);
  if (gameData.liveQuestion && _q?.answer) {
    gameData.liveQuestion.answer = _q.answer;
  }
  if (gameData.meta.settings.showCorrectAnswer && _q) {
    const revealEl = document.getElementById('modal-answer-reveal');
    if (revealEl.style.display === 'none') {
      revealEl.textContent = '✓ Antwort: ' + (_q.answer || '');
      revealEl.style.display = 'block';
    }
  }

  // Steal-Status im liveQuestion zurücksetzen
  if (gameData.liveQuestion) {
    gameData.liveQuestion.stealPhase = false;
    gameData.liveQuestion.stealPickedTeam = null;
  }

  document.getElementById('btn-modal-close').style.display = '';
  autosave();
  renderTeamBar();
}

function closeModal() {
  // Steal-State zurücksetzen
  stealPhase = false;
  stealCurrentTeamId = null;
  stealTeamsRemaining = [];
  stealOriginalTeamId = null;
  stopTeamActionPoll();
  document.getElementById('modal-steal-section').style.display = 'none';

  document.getElementById('question-modal').classList.remove('open');
  clearInterval(timerInterval);

  gameData.liveQuestion = null; // Frage für Schüler-Ansicht ausblenden
  if (modalResolved) {
    GameModel.advanceTeam(gameData);
  }
  autosave();

  renderBoard();
  renderTeamBar();

  // Score-Animation für das Team, das zuletzt gespielt hat
  const playedBy = GameModel.getQuestionPlayedBy(gameData, currentQuestionId);
  if (playedBy) {
    const team = gameData.teams.find(t => t.id == playedBy);
    if (team) {
      const last = team.history[team.history.length - 1];
      if (last) {
        animateScore(team.id, last.scoreChange);
        updateScoreDisplay(team.id);
      }
    }
  }

  currentQuestionId = null;
  currentSlot = null;
  modalResolved = false;

  if (GameModel.isGameFinished(gameData)) {
    setTimeout(showEndScreen, 500);
  }
}

function showScoreFlash(correct, change) {
  const existing = document.querySelector('.score-flash');
  if (existing) existing.remove();

  const flash = document.createElement('div');
  flash.className = 'score-flash ' + (correct ? 'correct' : 'wrong');
  flash.innerHTML = `<span class="flash-text">${correct ? '+' : ''}${change}</span>`;
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());
}

// ── Timer-Sound ───────────────────────────────────────────────
function playTimerSound() {
  try {
    const ctx = new (window.AudioContext || /** @type {any} */(window).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.8, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch { /* Browser ohne Web Audio */ }
}

// ── Team-Action-Poll (SSE + Polling-Fallback) ─────────────────
// Empfängt Aktionen aus view.html (MC-Auswahl, "Weiß nicht", Klau-Kandidaten)
function startTeamActionPoll() {
  stopTeamActionPoll();
  const code = StorageManager.getGameCode() || gameData?.meta?.gameCode;

  if (code && StorageManager._hasServer()) {
    // SSE-basiert
    sseSubscription = StorageManager.subscribeGameState(code, (gs) => {
      handleTeamAction(gs);
    });
  } else {
    // Polling-Fallback
    teamActionPollInterval = setInterval(async () => {
      if (!currentQuestionId) { stopTeamActionPoll(); return; }
      try {
        const gs = await StorageManager.loadGameState();
        if (gs) handleTeamAction(gs);
      } catch { }
    }, 800);
  }
}

function handleTeamAction(gs) {
  if (!currentQuestionId) return;
  if (!gs?.liveQuestion || gs.liveQuestion.id !== currentQuestionId) return;
  const lq = gs.liveQuestion;

  // Team hat MC-Antwort auto-ausgewertet (view.html)
  if (lq.autoResolved && !stealPhase && !modalResolved) {
    selectedMcIndex = lq.selectedMcIndex;
    if (gameData.liveQuestion) gameData.liveQuestion.selectedMcIndex = lq.selectedMcIndex;
    stopTeamActionPoll();
    resolveQuestion(lq.autoCorrect);
    return;
  }

  // MC-Auswahl vom Team synchronisieren (gelb markieren)
  if (lq.selectedMcIndex !== null && lq.selectedMcIndex !== selectedMcIndex && !stealPhase) {
    selectedMcIndex = lq.selectedMcIndex;
    if (gameData.liveQuestion) gameData.liveQuestion.selectedMcIndex = lq.selectedMcIndex;
    document.querySelectorAll('.mc-option').forEach((btn, i) => {
      btn.classList.remove('mc-selected-pending', 'correct', 'wrong');
      if (i === lq.selectedMcIndex) btn.classList.add('mc-selected-pending');
    });
  }

  // Team hat "Weiß nicht" gedrückt
  if (lq.teamPassedQuestion && !stealPhase && !modalResolved) {
    if (gameData.liveQuestion) gameData.liveQuestion.teamPassedQuestion = false;
    stopTeamActionPoll();
    weissNicht();
    return;
  }

  // Klau-Kandidaten aktualisieren (während Steal-Phase)
  if (stealPhase && lq.stealCandidates) {
    const prevLen = gameData.liveQuestion?.stealCandidates?.length || 0;
    if (lq.stealCandidates.length !== prevLen) {
      if (prevLen === 0 && lq.stealCandidates.length > 0) {
        clearInterval(timerInterval);
      }
      if (gameData.liveQuestion) gameData.liveQuestion.stealCandidates = [...lq.stealCandidates];
      renderStealCandidates(lq.stealCandidates);
    }
  }
}

function stopTeamActionPoll() {
  if (sseSubscription) {
    sseSubscription.unsubscribe();
    sseSubscription = null;
  }
  if (teamActionPollInterval) {
    clearInterval(teamActionPollInterval);
    teamActionPollInterval = null;
  }
}

// ── Timer display ─────────────────────────────────────────────
function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── End Screen ────────────────────────────────────────────────
function showEndScreen() {
  gameData.status = 'finished';
  autosave();

  const stats = GameModel.getStats(gameData);
  document.getElementById('end-subtitle').textContent =
    `${stats.playedQuestions} von ${stats.totalQuestions} Fragen gespielt`;

  const list = document.getElementById('ranking-list');
  list.innerHTML = '';
  stats.ranking.forEach((team, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="rank-pos">${i + 1}.</span>
      <span class="rank-color" style="background:${team.color};"></span>
      <span class="rank-name">${escHtml(team.name)}</span>
      <span class="rank-score">${team.score}</span>
    `;
    list.appendChild(li);
  });

  document.getElementById('end-screen').classList.add('open');
}

function replayGame() {
  if (!confirm('Spiel zurücksetzen und neu starten?')) return;
  GameModel.resetSession(gameData);
  gameData.activeTeamIds = [];
  gameData.boardSlots = [];
  gameData.status = 'setup';
  gameData.currentTeamIndex = 0;
  gameData.teams.forEach(t => { t.score = 0; t.history = []; });
  document.getElementById('end-screen').classList.remove('open');
  autosave();
  showSlotScreen();
}

// ── Correction Modal ──────────────────────────────────────────
function openCorrectionModal() {
  const rows = document.getElementById('correction-team-rows');
  rows.innerHTML = '';
  const activeTeams = GameModel.getActiveTeams(gameData);
  activeTeams.forEach(team => {
    const row = document.createElement('div');
    row.className = 'correction-team-row';
    row.innerHTML = `
      <span style="width:14px;height:14px;border-radius:50%;background:${team.color};display:inline-block;flex-shrink:0;"></span>
      <label>${escHtml(team.name)}</label>
      <input type="number" id="corr-${team.id}" value="${team.score}" min="0">
    `;
    rows.appendChild(row);
  });
  document.getElementById('correction-modal').classList.add('open');
  closeMenu();
}

function saveCorrectionModal() {
  const activeTeams = GameModel.getActiveTeams(gameData);
  activeTeams.forEach(team => {
    const input = document.getElementById(`corr-${team.id}`);
    if (input) {
      const val = parseInt(input.value);
      if (!isNaN(val)) team.score = val;
    }
  });
  autosave();
  renderTeamBar();
  renderBoard();
  document.getElementById('correction-modal').classList.remove('open');
}

// ── Menu ──────────────────────────────────────────────────────
function openMenu() {
  document.getElementById('menu-overlay').classList.add('open');
}

function closeMenu() {
  document.getElementById('menu-overlay').classList.remove('open');
}

function resetGame() {
  if (!confirm('Spiel zurücksetzen? Alle Punkte und Spielfortschritte werden gelöscht.')) return;
  GameModel.resetSession(gameData);
  gameData.activeTeamIds = [];
  gameData.boardSlots = [];
  gameData.status = 'setup';
  gameData.currentTeamIndex = 0;
  gameData.teams.forEach(t => { t.score = 0; t.history = []; });
  autosave();
  closeMenu();
  showSlotScreen();
}

// ── Utilities ─────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ── Event Binding ─────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btn-configure-slots').addEventListener('click', () => {
    document.getElementById('setup-screen').classList.remove('open');
    showSlotScreen();
  });

  document.getElementById('btn-slot-confirm').addEventListener('click', confirmSlots);

  document.getElementById('btn-slot-back').addEventListener('click', () => {
    document.getElementById('slot-screen').style.display = 'none';
    if (gameData && gameData.boardSlots && gameData.boardSlots.length > 0) {
      showSetupScreen(null, true);
    } else {
      showSetupScreen(null, false);
    }
  });

  document.getElementById('btn-start-game').addEventListener('click', () => {
    document.getElementById('setup-screen').classList.remove('open');
    startGame();
  });

  document.getElementById('btn-team-confirm').addEventListener('click', confirmTeams);

  document.getElementById('btn-team-back').addEventListener('click', () => {
    document.getElementById('team-select-screen').style.display = 'none';
    showSlotScreen();
  });

  document.getElementById('btn-show-answer').addEventListener('click', showAnswerForOpen);
  document.getElementById('btn-weiss-nicht').addEventListener('click', weissNicht);

  document.getElementById('btn-correct').addEventListener('click', () => {
    if (stealPhase && stealCurrentTeamId !== null) resolveStealAnswer(true);
    else if (!modalResolved) resolveQuestion(true);
  });

  document.getElementById('btn-wrong').addEventListener('click', () => {
    if (stealPhase && stealCurrentTeamId !== null) resolveStealAnswer(false);
    else if (!modalResolved) resolveQuestion(false);
  });

  document.getElementById('btn-steal-skip').addEventListener('click', () => {
    if (stealPhase && stealCurrentTeamId === null) endStealPhase();
  });

  document.getElementById('btn-modal-close').addEventListener('click', closeModal);

  document.getElementById('btn-menu').addEventListener('click', openMenu);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.getElementById('menu-backdrop').addEventListener('click', closeMenu);
  document.getElementById('menu-fullscreen').addEventListener('click', () => { toggleFullscreen(); closeMenu(); });
  document.getElementById('menu-save').addEventListener('click', async () => {
    closeMenu();
    await StorageManager.saveGameState(gameData);
    alert('Spielstand gespeichert.');
  });
  document.getElementById('menu-correct-scores').addEventListener('click', openCorrectionModal);
  document.getElementById('menu-admin').addEventListener('click', () => {
    const code = StorageManager.getGameCode() || gameData?.meta?.gameCode || '';
    window.location.href = code ? 'admin.html?code=' + code : 'admin.html';
  });
  document.getElementById('menu-home').addEventListener('click', () => window.location.href = '../spiele.html');
  document.getElementById('menu-reset').addEventListener('click', () => { closeMenu(); resetGame(); });

  document.getElementById('btn-correction-cancel').addEventListener('click', () =>
    document.getElementById('correction-modal').classList.remove('open')
  );
  document.getElementById('btn-correction-save').addEventListener('click', saveCorrectionModal);

  document.getElementById('btn-end-replay').addEventListener('click', replayGame);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      document.getElementById('correction-modal').classList.remove('open');
    }
    if (e.key === 'Enter' && document.getElementById('question-modal').classList.contains('open')) {
      if (modalResolved) closeModal();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    document.getElementById('btn-fullscreen').textContent =
      document.fullscreenElement ? '✕' : '⛶';
  });
}

// ── Start ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  init();
});
