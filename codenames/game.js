/* ═══════════════════════════════════════════════════════════════
   Codenames — game.js
   Spiellogik, Übersetzungen, Polling (1.5 s), alle Screens
═══════════════════════════════════════════════════════════════ */

'use strict';

// ── Translations ─────────────────────────────────────────────────────────
const T = {
  de: {
    title:'Codenames', tagline:'Das Wortassoziationsspiel',
    name_label:'Dein Name', name_ph:'Name eingeben',
    pin_label:'Spiel-PIN eingeben', pin_ph:'z. B. A3K7',
    btn_join:'Beitreten', btn_create:'Neues Spiel',
    back:'← Zurück',

    create_title:'Spiel erstellen',
    team_red:'Team Rot', team_blue:'Team Blau',
    wl_label:'Wortliste', wl_select:'Gespeicherte Liste laden…',
    wl_none:'Keine Listen vorhanden', wl_filter:'Alle Sprachen',
    words_label:'Wörter (genau 25, ein Wort pro Zeile)',
    words_ph:'Wort 1\nWort 2\n…',
    words_count:'Wörter', words_need:'Benötigt: 25',
    save_list:'Liste speichern', list_name:'Listenname', list_subj:'Fach',
    btn_create_game:'Spiel erstellen',

    lobby_title:'Lobby', lobby_pin:'PIN',
    lobby_players:'Spieler', lobby_settings:'Einstellungen (Host)',
    role_title:'Meine Rolle wählen',
    role_spy:'Spymaster', role_op:'Operative', role_spec:'Zuschauer',
    spy_taken:'🔒 Belegt', team_red:'Rot', team_blue:'Blau',
    btn_start:'Spiel starten', btn_start_hint:'Du bist der Host',
    wait_host:'Warte auf den Host…', need_words:'Wortliste fehlt (25 Wörter nötig)',
    copy_pin:'PIN kopiert!',

    turn_red:'Rot ist dran', turn_blue:'Blau ist dran',
    remaining:'übrig',
    clue_label:'Hinweis', clue_word_ph:'Hinweiswort', clue_num_ph:'0–9',
    btn_give_clue:'Hinweis geben',
    guesses_left:'Versuche übrig',
    btn_end_turn:'Zug beenden / Passen',
    wait_clue:'Wartet auf Hinweis vom Spymaster…',
    wait_guess:'Wartet auf Raten…',
    clue_log_title:'Hinweise',
    unlimited:'∞',

    result_assassin:'☠️ Attentäter! Spiel vorbei.',
    result_wrong:'❌ Falsche Karte!',
    result_neutral:'○ Neutrale Karte',
    result_hit:'✓ Treffer!',

    end_title:'Spiel beendet',
    end_wins:'gewinnt!',
    end_reason_assassin:'Attentäter-Karte wurde aufgedeckt',
    end_reason_all_found:'Alle Karten gefunden',
    btn_play_again:'Nochmal spielen',
    btn_home:'Startseite',

    err_pin_not_found:'PIN nicht gefunden',
    err_game_full:'Spiel ist voll (max. 12)',
    err_game_finished:'Spiel bereits beendet',
    err_spy_taken:'Spymaster-Rolle bereits vergeben',
    err_not_turn:'Du bist gerade nicht dran',
    err_words_required:'Genau 25 Wörter werden benötigt',
    err_no_clue:'Warte auf den Hinweis',
    err_rate_limit:'Bitte warte einen Moment',
    err_unknown:'Fehler – bitte neu laden',
    connecting:'Verbinde…',
    spectator_link:'Beamer-Link',
  },
  en: {
    title:'Codenames', tagline:'The word association game',
    name_label:'Your name', name_ph:'Enter name',
    pin_label:'Enter Game PIN', pin_ph:'e.g. A3K7',
    btn_join:'Join', btn_create:'New Game',
    back:'← Back',

    create_title:'Create Game',
    team_red:'Red Team', team_blue:'Blue Team',
    wl_label:'Word List', wl_select:'Load saved list…',
    wl_none:'No lists found', wl_filter:'All languages',
    words_label:'Words (exactly 25, one per line)',
    words_ph:'Word 1\nWord 2\n…',
    words_count:'words', words_need:'Need: 25',
    save_list:'Save list', list_name:'List name', list_subj:'Subject',
    btn_create_game:'Create Game',

    lobby_title:'Lobby', lobby_pin:'PIN',
    lobby_players:'Players', lobby_settings:'Settings (Host)',
    role_title:'Choose my role',
    role_spy:'Spymaster', role_op:'Operative', role_spec:'Spectator',
    spy_taken:'🔒 Taken', team_red:'Red', team_blue:'Blue',
    btn_start:'Start Game', btn_start_hint:'You are the host',
    wait_host:'Waiting for host…', need_words:'Word list missing (25 words needed)',
    copy_pin:'PIN copied!',

    turn_red:'Red\'s turn', turn_blue:'Blue\'s turn',
    remaining:'remaining',
    clue_label:'Clue', clue_word_ph:'Clue word', clue_num_ph:'0–9',
    btn_give_clue:'Give Clue',
    guesses_left:'Guesses left',
    btn_end_turn:'End Turn / Pass',
    wait_clue:'Waiting for Spymaster\'s clue…',
    wait_guess:'Waiting for guesses…',
    clue_log_title:'Clue log',
    unlimited:'∞',

    result_assassin:'☠️ Assassin! Game over.',
    result_wrong:'❌ Wrong card!',
    result_neutral:'○ Neutral card',
    result_hit:'✓ Hit!',

    end_title:'Game Over',
    end_wins:'wins!',
    end_reason_assassin:'Assassin card was revealed',
    end_reason_all_found:'All cards found',
    btn_play_again:'Play Again',
    btn_home:'Home',

    err_pin_not_found:'PIN not found',
    err_game_full:'Game is full (max 12)',
    err_game_finished:'Game already finished',
    err_spy_taken:'Spymaster role already taken',
    err_not_turn:'Not your turn',
    err_words_required:'Exactly 25 words required',
    err_no_clue:'Waiting for clue',
    err_rate_limit:'Please wait a moment',
    err_unknown:'Error – please reload',
    connecting:'Connecting…',
    spectator_link:'Beamer link',
  },
  it: {
    title:'Codenames', tagline:'Il gioco di associazione di parole',
    name_label:'Il tuo nome', name_ph:'Inserisci nome',
    pin_label:'Inserisci PIN partita', pin_ph:'es. A3K7',
    btn_join:'Unisciti', btn_create:'Nuova partita',
    back:'← Indietro',

    create_title:'Crea partita',
    team_red:'Squadra Rossa', team_blue:'Squadra Blu',
    wl_label:'Lista parole', wl_select:'Carica lista salvata…',
    wl_none:'Nessuna lista trovata', wl_filter:'Tutte le lingue',
    words_label:'Parole (esattamente 25, una per riga)',
    words_ph:'Parola 1\nParola 2\n…',
    words_count:'parole', words_need:'Necessario: 25',
    save_list:'Salva lista', list_name:'Nome lista', list_subj:'Materia',
    btn_create_game:'Crea partita',

    lobby_title:'Lobby', lobby_pin:'PIN',
    lobby_players:'Giocatori', lobby_settings:'Impostazioni (Host)',
    role_title:'Scegli il mio ruolo',
    role_spy:'Spymaster', role_op:'Agente', role_spec:'Spettatore',
    spy_taken:'🔒 Occupato', team_red:'Rosso', team_blue:'Blu',
    btn_start:'Inizia partita', btn_start_hint:'Sei il host',
    wait_host:'Attesa host…', need_words:'Lista parole mancante (25 parole necessarie)',
    copy_pin:'PIN copiato!',

    turn_red:'Turno del Rosso', turn_blue:'Turno del Blu',
    remaining:'rimanenti',
    clue_label:'Indizio', clue_word_ph:'Parola indizio', clue_num_ph:'0–9',
    btn_give_clue:'Dai indizio',
    guesses_left:'Tentativi rimasti',
    btn_end_turn:'Fine turno / Passa',
    wait_clue:'In attesa indizio Spymaster…',
    wait_guess:'In attesa degli indovinelli…',
    clue_log_title:'Indizi',
    unlimited:'∞',

    result_assassin:'☠️ Assassino! Fine partita.',
    result_wrong:'❌ Carta sbagliata!',
    result_neutral:'○ Carta neutra',
    result_hit:'✓ Colpito!',

    end_title:'Fine partita',
    end_wins:'vince!',
    end_reason_assassin:'Carta assassino rivelata',
    end_reason_all_found:'Tutte le carte trovate',
    btn_play_again:'Rigioca',
    btn_home:'Home',

    err_pin_not_found:'PIN non trovato', err_game_full:'Partita piena (max 12)',
    err_game_finished:'Partita terminata', err_spy_taken:'Spymaster già occupato',
    err_not_turn:'Non è il tuo turno', err_words_required:'Servono esattamente 25 parole',
    err_no_clue:'Attesa indizio', err_rate_limit:'Aspetta un momento',
    err_unknown:'Errore – ricaricare', connecting:'Connessione…', spectator_link:'Link beamer',
  },
  es: {
    title:'Codenames', tagline:'El juego de asociación de palabras',
    name_label:'Tu nombre', name_ph:'Ingresa nombre',
    pin_label:'Ingresa PIN del juego', pin_ph:'ej. A3K7',
    btn_join:'Unirse', btn_create:'Nuevo juego',
    back:'← Atrás',

    create_title:'Crear juego',
    team_red:'Equipo Rojo', team_blue:'Equipo Azul',
    wl_label:'Lista de palabras', wl_select:'Cargar lista guardada…',
    wl_none:'Sin listas guardadas', wl_filter:'Todos los idiomas',
    words_label:'Palabras (exactamente 25, una por línea)',
    words_ph:'Palabra 1\nPalabra 2\n…',
    words_count:'palabras', words_need:'Necesario: 25',
    save_list:'Guardar lista', list_name:'Nombre', list_subj:'Asignatura',
    btn_create_game:'Crear juego',

    lobby_title:'Sala', lobby_pin:'PIN',
    lobby_players:'Jugadores', lobby_settings:'Ajustes (Anfitrión)',
    role_title:'Elige mi rol',
    role_spy:'Maestro Espía', role_op:'Agente', role_spec:'Espectador',
    spy_taken:'🔒 Ocupado', team_red:'Rojo', team_blue:'Azul',
    btn_start:'Iniciar juego', btn_start_hint:'Eres el anfitrión',
    wait_host:'Esperando al anfitrión…', need_words:'Falta lista (25 palabras necesarias)',
    copy_pin:'¡PIN copiado!',

    turn_red:'Turno del Rojo', turn_blue:'Turno del Azul',
    remaining:'restantes',
    clue_label:'Pista', clue_word_ph:'Palabra pista', clue_num_ph:'0–9',
    btn_give_clue:'Dar pista',
    guesses_left:'Intentos restantes',
    btn_end_turn:'Terminar turno',
    wait_clue:'Esperando pista del Maestro…',
    wait_guess:'Esperando respuestas…',
    clue_log_title:'Pistas',
    unlimited:'∞',

    result_assassin:'☠️ ¡Asesino! Fin del juego.',
    result_wrong:'❌ ¡Carta incorrecta!',
    result_neutral:'○ Carta neutral',
    result_hit:'✓ ¡Acierto!',

    end_title:'Fin del juego', end_wins:'¡gana!',
    end_reason_assassin:'Carta asesino revelada', end_reason_all_found:'Todas las cartas encontradas',
    btn_play_again:'Jugar de nuevo', btn_home:'Inicio',

    err_pin_not_found:'PIN no encontrado', err_game_full:'Juego lleno (máx. 12)',
    err_game_finished:'Juego ya terminado', err_spy_taken:'Maestro espía ya tomado',
    err_not_turn:'No es tu turno', err_words_required:'Se necesitan exactamente 25 palabras',
    err_no_clue:'Esperando pista', err_rate_limit:'Espera un momento',
    err_unknown:'Error – recargar', connecting:'Conectando…', spectator_link:'Enlace beamer',
  },
  ru: {
    title:'Кодовые имена', tagline:'Игра словесных ассоциаций',
    name_label:'Ваше имя', name_ph:'Введите имя',
    pin_label:'Введите PIN игры', pin_ph:'напр. A3K7',
    btn_join:'Войти', btn_create:'Новая игра',
    back:'← Назад',

    create_title:'Создать игру',
    team_red:'Красная команда', team_blue:'Синяя команда',
    wl_label:'Список слов', wl_select:'Загрузить сохранённый список…',
    wl_none:'Нет списков', wl_filter:'Все языки',
    words_label:'Слова (ровно 25, по одному на строку)',
    words_ph:'Слово 1\nСлово 2\n…',
    words_count:'слов', words_need:'Нужно: 25',
    save_list:'Сохранить список', list_name:'Название', list_subj:'Предмет',
    btn_create_game:'Создать игру',

    lobby_title:'Лобби', lobby_pin:'PIN',
    lobby_players:'Игроки', lobby_settings:'Настройки (Хост)',
    role_title:'Выбрать роль',
    role_spy:'Мастер шпион', role_op:'Агент', role_spec:'Зритель',
    spy_taken:'🔒 Занято', team_red:'Красные', team_blue:'Синие',
    btn_start:'Начать игру', btn_start_hint:'Вы хост',
    wait_host:'Ожидание хоста…', need_words:'Список слов отсутствует (нужно 25)',
    copy_pin:'PIN скопирован!',

    turn_red:'Ход красных', turn_blue:'Ход синих',
    remaining:'осталось',
    clue_label:'Подсказка', clue_word_ph:'Слово-подсказка', clue_num_ph:'0–9',
    btn_give_clue:'Дать подсказку',
    guesses_left:'Попыток осталось',
    btn_end_turn:'Закончить ход',
    wait_clue:'Ожидание подсказки Мастера…',
    wait_guess:'Ожидание ответов…',
    clue_log_title:'Подсказки',
    unlimited:'∞',

    result_assassin:'☠️ Убийца! Игра окончена.',
    result_wrong:'❌ Неверная карта!',
    result_neutral:'○ Нейтральная карта',
    result_hit:'✓ Попадание!',

    end_title:'Игра окончена', end_wins:'побеждает!',
    end_reason_assassin:'Карта убийцы раскрыта', end_reason_all_found:'Все карты найдены',
    btn_play_again:'Играть снова', btn_home:'Главная',

    err_pin_not_found:'PIN не найден', err_game_full:'Игра заполнена (макс. 12)',
    err_game_finished:'Игра уже завершена', err_spy_taken:'Роль мастера занята',
    err_not_turn:'Не ваш ход', err_words_required:'Нужно ровно 25 слов',
    err_no_clue:'Ожидание подсказки', err_rate_limit:'Подождите момент',
    err_unknown:'Ошибка – перезагрузите', connecting:'Подключение…', spectator_link:'Ссылка на экран',
  },
  fr: {
    title:'Codenames', tagline:'Le jeu d\'associations de mots',
    name_label:'Votre nom', name_ph:'Saisir un nom',
    pin_label:'Entrez le PIN du jeu', pin_ph:'ex. A3K7',
    btn_join:'Rejoindre', btn_create:'Nouvelle partie',
    back:'← Retour',

    create_title:'Créer une partie',
    team_red:'Équipe Rouge', team_blue:'Équipe Bleue',
    wl_label:'Liste de mots', wl_select:'Charger une liste…',
    wl_none:'Aucune liste', wl_filter:'Toutes les langues',
    words_label:'Mots (exactement 25, un par ligne)',
    words_ph:'Mot 1\nMot 2\n…',
    words_count:'mots', words_need:'Requis : 25',
    save_list:'Sauvegarder', list_name:'Nom de la liste', list_subj:'Matière',
    btn_create_game:'Créer la partie',

    lobby_title:'Salon', lobby_pin:'PIN',
    lobby_players:'Joueurs', lobby_settings:'Paramètres (Hôte)',
    role_title:'Choisir mon rôle',
    role_spy:'Maître Espion', role_op:'Agent', role_spec:'Spectateur',
    spy_taken:'🔒 Pris', team_red:'Rouge', team_blue:'Bleu',
    btn_start:'Démarrer', btn_start_hint:'Vous êtes l\'hôte',
    wait_host:'En attente de l\'hôte…', need_words:'Liste de mots manquante (25 mots requis)',
    copy_pin:'PIN copié !',

    turn_red:'Tour du Rouge', turn_blue:'Tour du Bleu',
    remaining:'restants',
    clue_label:'Indice', clue_word_ph:'Mot indice', clue_num_ph:'0–9',
    btn_give_clue:'Donner l\'indice',
    guesses_left:'Essais restants',
    btn_end_turn:'Fin de tour / Passer',
    wait_clue:'En attente de l\'indice…',
    wait_guess:'En attente des réponses…',
    clue_log_title:'Indices',
    unlimited:'∞',

    result_assassin:'☠️ Assassin ! Fin de partie.',
    result_wrong:'❌ Mauvaise carte !',
    result_neutral:'○ Carte neutre',
    result_hit:'✓ Bonne carte !',

    end_title:'Fin de partie', end_wins:'gagne !',
    end_reason_assassin:'Carte assassin révélée', end_reason_all_found:'Toutes les cartes trouvées',
    btn_play_again:'Rejouer', btn_home:'Accueil',

    err_pin_not_found:'PIN introuvable', err_game_full:'Partie complète (max 12)',
    err_game_finished:'Partie déjà terminée', err_spy_taken:'Maître espion déjà pris',
    err_not_turn:'Ce n\'est pas votre tour', err_words_required:'Exactement 25 mots requis',
    err_no_clue:'Attente d\'un indice', err_rate_limit:'Veuillez patienter',
    err_unknown:'Erreur – rechargez', connecting:'Connexion…', spectator_link:'Lien beamer',
  },
};

// ── State ─────────────────────────────────────────────────────────────────
let lang        = 'de';
let myPlayerId  = null;
let myPin       = null;
let myRole      = null;   // 'spymaster' | 'operative' | 'spectator' | null
let myTeam      = null;   // 'red' | 'blue' | null
let amHost      = false;
let pollTimer   = null;
let lastState   = null;
let currentScreen = 'screen-start';
let prevCards   = [];     // for reveal animation detection
let savedWordlists = [];  // cached word lists for selector

// ── Translation helper ────────────────────────────────────────────────────
function t(key) { return (T[lang] || T.de)[key] || key; }

// ── HTML escape ───────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Player ID ─────────────────────────────────────────────────────────────
function getOrCreatePlayerId() {
  let id = localStorage.getItem('cn_player_id');
  if (!id) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    id = Array.from({length:10}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    localStorage.setItem('cn_player_id', id);
  }
  return id;
}

// ── API ───────────────────────────────────────────────────────────────────
async function apiGet(action, params = {}) {
  const url = new URL('./api.php', location.href);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  try {
    const r = await fetch(url.toString(), {cache:'no-store'});
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function apiPost(action, data = {}) {
  const url = new URL('./api.php', location.href);
  url.searchParams.set('action', action);
  try {
    const r = await fetch(url.toString(), {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      return j || {error: 'http_' + r.status};
    }
    return await r.json();
  } catch { return {error: 'network'}; }
}

// ── Polling ───────────────────────────────────────────────────────────────
function startPolling() {
  stopPolling();
  doRefresh();
  pollTimer = setInterval(doRefresh, 1500);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function doRefresh() {
  if (!myPin) return;
  const gs = await apiGet('get_state', {pin: myPin, player_id: myPlayerId || ''});
  if (!gs || gs.error) return;

  // Sync my role/team from server state
  const me = (gs.players || []).find(p => p.id === myPlayerId);
  if (me) {
    myRole = me.role || null;
    myTeam = me.team || null;
    amHost = me.is_host || false;
  }

  handleStateUpdate(gs);
}

// ── Screen management ─────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  currentScreen = id;
}

// ── Toast ─────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast toast-' + type;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 2500);
}

// ── Translate all data-t elements ─────────────────────────────────────────
function applyTranslations() {
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-t-ph]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-t-ph'));
  });
}

// ── handleStateUpdate: route to correct screen ────────────────────────────
function handleStateUpdate(gs) {
  const prevStatus = lastState?.status;
  lastState = gs;

  if (gs.status === 'lobby') {
    if (currentScreen !== 'screen-lobby') showScreen('screen-lobby');
    renderLobby(gs);
  } else if (gs.status === 'active') {
    if (currentScreen !== 'screen-game') { showScreen('screen-game'); prevCards = []; }
    renderGame(gs);
  } else if (gs.status === 'finished') {
    if (currentScreen !== 'screen-end') { showScreen('screen-end'); renderEnd(gs); }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// START SCREEN
// ════════════════════════════════════════════════════════════════════════════
function renderStart() {
  applyTranslations();
  // Language buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

window.setLang = function(l) {
  lang = l;
  localStorage.setItem('cn_lang', l);
  renderStart();
};

window.doJoin = async function() {
  const nameEl = document.getElementById('start-name');
  const pinEl  = document.getElementById('start-pin');
  const errEl  = document.getElementById('start-error');
  errEl.textContent = '';

  const name = (nameEl?.value || '').trim();
  const pin  = (pinEl?.value  || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');

  if (!name) { errEl.textContent = t('name_label') + ' ?'; return; }
  if (pin.length < 4) { errEl.textContent = t('pin_label') + ' ?'; return; }

  localStorage.setItem('cn_player_name', name);

  const result = await apiPost('join_game', {pin, player_name: name, player_id: myPlayerId});
  if (!result || result.error) {
    const map = {game_not_found: 'err_pin_not_found', game_full: 'err_game_full', game_finished: 'err_game_finished'};
    errEl.textContent = t(map[result?.error] || 'err_unknown');
    return;
  }

  myPin      = pin;
  myPlayerId = result.player_id;
  amHost     = result.is_host;
  localStorage.setItem('cn_player_id', myPlayerId);
  lang = result.language || lang;

  // Update URL
  const url = new URL(location.href);
  url.searchParams.set('pin', pin);
  history.replaceState({}, '', url.toString());

  showScreen('screen-lobby');
  startPolling();
};

window.goToCreate = function() {
  const nameEl = document.getElementById('start-name');
  const name = (nameEl?.value || '').trim();
  if (name) localStorage.setItem('cn_player_name', name);
  showScreen('screen-create');
  loadWordlistsForSelector();
  renderCreateScreen();
};

// ════════════════════════════════════════════════════════════════════════════
// CREATE SCREEN
// ════════════════════════════════════════════════════════════════════════════
function renderCreateScreen() {
  applyTranslations();
  updateWordCounter();
}

async function loadWordlistsForSelector() {
  const sel = document.getElementById('wl-select');
  if (!sel) return;
  const data = await apiGet('get_wordlists');
  savedWordlists = data?.lists || [];
  sel.innerHTML = `<option value="">${t('wl_select')}</option>`
    + savedWordlists.map(l =>
        `<option value="${esc(l.id)}">[${esc(l.language.toUpperCase())}] ${esc(l.name)} – ${esc(l.subject)}</option>`
      ).join('');
}

window.onWordlistSelect = async function() {
  const sel = document.getElementById('wl-select');
  const id  = sel?.value;
  if (!id) return;
  const data = await apiGet('get_wordlist', {id});
  if (data?.words && Array.isArray(data.words)) {
    const ta = document.getElementById('words-textarea');
    if (ta) { ta.value = data.words.join('\n'); updateWordCounter(); }
  }
};

window.updateWordCounter = function() {
  const ta    = document.getElementById('words-textarea');
  const counter = document.getElementById('words-counter');
  if (!ta || !counter) return;
  const words = ta.value.split('\n').map(w => w.trim()).filter(w => w);
  const n = words.length;
  counter.textContent = `${n} / 25 ${t('words_count')}`;
  counter.className = 'words-counter ' + (n === 25 ? 'ok' : n > 25 ? 'error' : 'warn');
};

window.doSaveWordlist = async function() {
  const name  = document.getElementById('wl-name')?.value.trim();
  const subj  = document.getElementById('wl-subj')?.value.trim() || '';
  const ta    = document.getElementById('words-textarea');
  const words = (ta?.value || '').split('\n').map(w => w.trim()).filter(w => w);
  if (!name) { showToast('Name?', 'error'); return; }
  if (words.length !== 25) { showToast(t('err_words_required'), 'error'); return; }
  const res = await apiPost('save_wordlist', {name, subject: subj, language: lang, words});
  if (res?.ok) {
    showToast('✓ ' + t('save_list'), 'ok');
    await loadWordlistsForSelector();
    if (res.id) {
      const sel = document.getElementById('wl-select');
      if (sel) sel.value = res.id;
    }
  } else { showToast(t('err_unknown'), 'error'); }
};

window.doCreateGame = async function() {
  const nameEl = document.getElementById('start-name');
  const playerName = (nameEl?.value || localStorage.getItem('cn_player_name') || 'Host').trim();
  const teamRed  = document.getElementById('team-red-name')?.value.trim()  || (lang==='de'?'Rot':'Red');
  const teamBlue = document.getElementById('team-blue-name')?.value.trim() || (lang==='de'?'Blau':'Blue');
  const ta = document.getElementById('words-textarea');
  const words = (ta?.value || '').split('\n').map(w => w.trim()).filter(w => w);
  const wlId  = document.getElementById('wl-select')?.value || '';
  const errEl = document.getElementById('create-error');
  errEl.textContent = '';

  if (words.length !== 25 && !wlId) {
    errEl.textContent = t('err_words_required');
    return;
  }

  const payload = {player_name: playerName, language: lang, team_red: teamRed, team_blue: teamBlue};
  if (words.length === 25) payload.custom_words = words;
  if (wlId) payload.wordlist_id = wlId;

  const res = await apiPost('create_game', payload);
  if (!res?.pin) { errEl.textContent = t('err_unknown'); return; }

  // Immediately save settings with words if provided
  if (words.length === 25) {
    await apiPost('update_settings', {pin: res.pin, player_id: res.player_id, custom_words: words, wordlist_id: wlId});
  }

  myPin = res.pin;
  myPlayerId = res.player_id;
  amHost = true;
  localStorage.setItem('cn_player_id', myPlayerId);
  localStorage.setItem('cn_player_name', playerName);

  const url = new URL(location.href);
  url.searchParams.set('pin', myPin);
  history.replaceState({}, '', url.toString());

  showScreen('screen-lobby');
  startPolling();
};

window.goBackToStart = function() {
  showScreen('screen-start');
  renderStart();
};

// ════════════════════════════════════════════════════════════════════════════
// LOBBY SCREEN
// ════════════════════════════════════════════════════════════════════════════
function renderLobby(gs) {
  // PIN display
  const pinVal = document.getElementById('lobby-pin-value');
  if (pinVal) pinVal.textContent = gs.pin;

  // Spectator link
  const specLink = document.getElementById('spectator-link');
  if (specLink) {
    const url = new URL('spectator.html', location.href);
    url.searchParams.set('pin', gs.pin);
    specLink.href = url.toString();
    specLink.title = t('spectator_link');
  }

  // Role selector
  renderRoleSelector(gs);

  // Player list
  renderPlayerList(gs);

  // Settings (host only)
  const settingsSection = document.getElementById('lobby-settings');
  if (settingsSection) settingsSection.style.display = amHost ? '' : 'none';

  // Start button
  const startBtn = document.getElementById('btn-lobby-start');
  if (startBtn) {
    startBtn.style.display = amHost ? '' : 'none';
    const hasWords = (gs.custom_words?.length === 25) || !!gs.wordlist_id;
    startBtn.disabled = !hasWords;
    startBtn.title = hasWords ? t('btn_start_hint') : t('need_words');
  }

  const waitMsg = document.getElementById('lobby-wait-msg');
  if (waitMsg) waitMsg.style.display = amHost ? 'none' : '';
}

function renderRoleSelector(gs) {
  const container = document.getElementById('role-selector');
  if (!container) return;

  const spy = gs.spymasters || {};
  const redSpyId  = spy.red  || null;
  const blueSpyId = spy.blue || null;

  const redSpyTaken  = redSpyId  && redSpyId  !== myPlayerId;
  const blueSpyTaken = blueSpyId && blueSpyId !== myPlayerId;

  const isMe = (role, team) => myRole === role && myTeam === team;
  const isSpectator = myRole === 'spectator';

  container.innerHTML = `
    <div class="role-grid">
      <div class="role-team-col">
        <div class="role-team-header red">${esc(gs.teams?.red?.name || t('team_red'))}</div>
        <button class="role-btn ${isMe('spymaster','red')?'active-red':''} ${redSpyTaken?'taken':''}"
          onclick="selectRole('red','spymaster')" ${redSpyTaken?'disabled':''}>
          🕵️ ${t('role_spy')} ${redSpyTaken ? t('spy_taken') : ''}
        </button>
        <button class="role-btn ${isMe('operative','red')?'active-red':''}"
          onclick="selectRole('red','operative')">
          👤 ${t('role_op')}
        </button>
      </div>
      <div class="role-team-col">
        <div class="role-team-header blue">${esc(gs.teams?.blue?.name || t('team_blue'))}</div>
        <button class="role-btn ${isMe('spymaster','blue')?'active-blue':''} ${blueSpyTaken?'taken':''}"
          onclick="selectRole('blue','spymaster')" ${blueSpyTaken?'disabled':''}>
          🕵️ ${t('role_spy')} ${blueSpyTaken ? t('spy_taken') : ''}
        </button>
        <button class="role-btn ${isMe('operative','blue')?'active-blue':''}"
          onclick="selectRole('blue','operative')">
          👤 ${t('role_op')}
        </button>
      </div>
    </div>
    <button class="role-spectator-btn ${isSpectator?'active-spectator':''}" style="margin-top:0.6rem"
      onclick="selectRole(null,'spectator')">
      👁 ${t('role_spec')}
    </button>
  `;
}

function renderPlayerList(gs) {
  const ul = document.getElementById('player-list');
  if (!ul) return;
  const now = Date.now() / 1000;
  ul.innerHTML = (gs.players || []).map(p => {
    const online  = (now - (p.last_seen || 0)) < 15;
    const teamCls = p.team || '';
    const roleLabel = p.role
      ? (p.role === 'spymaster' ? '🕵️' : p.role === 'operative' ? '👤' : '👁')
      : '—';
    const hostBadge = p.is_host ? `<span class="player-badge host">Host</span>` : '';
    const teamBadge = p.team
      ? `<span class="player-badge ${p.team}">${esc(gs.teams?.[p.team]?.name || p.team)}</span>`
      : '';
    const meTag = p.id === myPlayerId ? ' (Du)' : '';
    return `<div class="player-row">
      <span class="player-dot ${online?'online':'offline'}"></span>
      <span class="player-name">${esc(p.name)}${meTag}</span>
      <span style="font-size:1rem">${roleLabel}</span>
      ${teamBadge}${hostBadge}
    </div>`;
  }).join('');
}

window.selectRole = async function(team, role) {
  if (!myPin || !myPlayerId) return;
  const res = await apiPost('select_role', {pin: myPin, player_id: myPlayerId, team, role});
  if (res?.error === 'spymaster_taken') { showToast(t('err_spy_taken'), 'error'); }
  else if (res?.ok) { myRole = role; myTeam = team; }
  await doRefresh();
};

window.copyPin = function() {
  const pin = document.getElementById('lobby-pin-value')?.textContent;
  if (!pin) return;
  navigator.clipboard?.writeText(pin).then(() => showToast(t('copy_pin'), 'ok'));
};

window.doStartGame = async function() {
  if (!myPin || !myPlayerId) return;
  const res = await apiPost('start_game', {pin: myPin, player_id: myPlayerId});
  if (res?.error === 'words_required') {
    showToast(t('err_words_required'), 'error');
  } else if (!res?.ok) {
    showToast(t('err_unknown'), 'error');
  }
  // polling will pick up the new state
};

window.doUpdateSettings = async function() {
  if (!myPin || !myPlayerId) return;
  const redName  = document.getElementById('ls-team-red')?.value.trim();
  const blueName = document.getElementById('ls-team-blue')?.value.trim();
  const ta = document.getElementById('ls-words-textarea');
  const words = ta ? ta.value.split('\n').map(w=>w.trim()).filter(w=>w) : null;
  const wlId = document.getElementById('ls-wl-select')?.value || '';
  const payload = {pin: myPin, player_id: myPlayerId};
  if (redName)  payload.team_red  = redName;
  if (blueName) payload.team_blue = blueName;
  if (wlId)     payload.wordlist_id = wlId;
  if (words?.length === 25) payload.custom_words = words;
  const res = await apiPost('update_settings', payload);
  if (res?.ok) showToast('✓', 'ok');
  else showToast(t('err_unknown'), 'error');
  await doRefresh();
};

// ════════════════════════════════════════════════════════════════════════════
// GAME SCREEN
// ════════════════════════════════════════════════════════════════════════════
function renderGame(gs) {
  renderScoreBar(gs);
  renderCardGrid(gs);
  renderClueArea(gs);
}

function renderScoreBar(gs) {
  const redName  = gs.teams?.red?.name  || t('team_red');
  const blueName = gs.teams?.blue?.name || t('team_blue');
  const redRem   = gs.teams?.red?.remaining  ?? '?';
  const blueRem  = gs.teams?.blue?.remaining ?? '?';
  const turn     = gs.current_turn;

  const el = document.getElementById('score-bar');
  if (!el) return;
  el.innerHTML = `
    <div class="score-team">
      <span class="score-dot red"></span>
      <span>${esc(redName)}</span>
      <span class="score-num red">${redRem}</span>
      <span style="font-size:0.75rem;color:var(--text-secondary)">${t('remaining')}</span>
    </div>
    <div class="turn-badge ${turn}">${turn === 'red' ? t('turn_red') : t('turn_blue')}</div>
    <div class="score-team">
      <span class="score-num blue">${blueRem}</span>
      <span style="font-size:0.75rem;color:var(--text-secondary)">${t('remaining')}</span>
      <span>${esc(blueName)}</span>
      <span class="score-dot blue"></span>
    </div>
  `;
}

function renderCardGrid(gs) {
  const grid = document.getElementById('card-grid');
  if (!grid) return;

  const isSpy  = myRole === 'spymaster';
  const canGuess = myRole === 'operative'
    && myTeam === gs.current_turn
    && gs.current_clue !== null
    && gs.status === 'active';

  // Detect newly revealed cards for animation
  const newlyRevealed = new Set();
  (gs.cards || []).forEach((c, i) => {
    if (c.revealed && !(prevCards[i]?.revealed)) newlyRevealed.add(i);
  });
  prevCards = JSON.parse(JSON.stringify(gs.cards || []));

  grid.innerHTML = '';
  (gs.cards || []).forEach((card, i) => {
    const div = document.createElement('div');
    div.className = 'cn-card';

    if (card.revealed) {
      div.className += ` revealed team-${card.team}`;
      if (newlyRevealed.has(i)) div.className += ' just-revealed';
    } else if (isSpy && card.team) {
      div.className += ` spy-${card.team}`;
    }

    if (canGuess && !card.revealed) {
      div.className += ' clickable';
      div.addEventListener('click', () => doGuessCard(i));
    }

    div.innerHTML = `<span class="cn-card-word">${esc(card.word)}</span>`;
    grid.appendChild(div);
  });
}

function renderClueArea(gs) {
  const area = document.getElementById('clue-area');
  if (!area) return;

  const isSpy  = myRole === 'spymaster';
  const isOp   = myRole === 'operative';
  const isSpec = myRole === 'spectator' || (!myRole);
  const myTurn = myTeam === gs.current_turn;
  const clue   = gs.current_clue;

  let html = '';

  // Current clue display (all roles)
  if (clue) {
    const numLabel = clue.number === 0 ? t('unlimited') : clue.number;
    html += `<div class="clue-current">
      <span class="clue-word-display ${clue.team}">${esc(clue.word)}</span>
      <span class="clue-num-display">${numLabel}</span>
    </div>`;
    if (isOp && myTurn) {
      html += `<div class="clue-guesses-left">${t('guesses_left')}: <strong>${clue.guesses_left}</strong></div>`;
      html += `<button class="end-turn-btn" onclick="doEndTurn()">${t('btn_end_turn')}</button>`;
    } else if (!myTurn || isSpec) {
      html += `<div class="clue-waiting">${t('wait_guess')}</div>`;
    }
  } else {
    // No clue yet
    if (isSpy && myTurn) {
      // Spymaster input
      html += `<div class="clue-input-row">
        <input id="clue-word-input" class="cn-input" type="text" placeholder="${esc(t('clue_word_ph'))}"
          maxlength="40" onkeydown="if(event.key==='Enter')doSubmitClue()">
        <input id="clue-num-input" class="clue-number-input" type="number" min="0" max="9"
          placeholder="${esc(t('clue_num_ph'))}" value="1">
        <button class="clue-submit-btn" onclick="doSubmitClue()">${t('btn_give_clue')}</button>
      </div>`;
    } else {
      html += `<div class="clue-waiting">${t('wait_clue')}</div>`;
    }
  }

  // Clue log
  if ((gs.clues || []).length > 0) {
    html += `<div style="margin-top:0.6rem;font-size:0.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em">${t('clue_log_title')}</div>`;
    html += `<div class="clue-log">`;
    html += [...gs.clues].reverse().map(c => {
      const n = c.number === 0 ? t('unlimited') : c.number;
      return `<span class="clue-log-entry ${c.team}">${esc(c.word)} · ${n}</span>`;
    }).join('');
    html += `</div>`;
  }

  area.innerHTML = html;
}

// ── Game actions ───────────────────────────────────────────────────────────
window.doSubmitClue = async function() {
  const word = document.getElementById('clue-word-input')?.value.trim();
  const num  = parseInt(document.getElementById('clue-num-input')?.value || '1', 10);
  if (!word) { showToast(t('clue_word_ph') + '?', 'error'); return; }
  const res = await apiPost('submit_clue', {pin: myPin, player_id: myPlayerId, word, number: isNaN(num) ? 1 : num});
  if (res?.error) showToast(t('err_not_turn'), 'error');
  await doRefresh();
};

async function doGuessCard(index) {
  const res = await apiPost('guess_card', {pin: myPin, player_id: myPlayerId, card_index: index});
  if (res?.error) {
    if (res.error === 'rate_limit') showToast(t('err_rate_limit'), 'error');
    else if (res.error === 'not_your_turn') showToast(t('err_not_turn'), 'error');
    else showToast(t('err_unknown'), 'error');
    return;
  }
  // Show result toast
  const team = res.card_team;
  if (team === 'assassin') showToast(t('result_assassin'), 'error');
  else if (team === myTeam) showToast(t('result_hit'), 'ok');
  else if (team === 'neutral') showToast(t('result_neutral'), 'info');
  else showToast(t('result_wrong'), 'error');
  await doRefresh();
}

window.doEndTurn = async function() {
  const res = await apiPost('end_turn', {pin: myPin, player_id: myPlayerId});
  if (res?.error) showToast(t('err_not_turn'), 'error');
  await doRefresh();
};

// ════════════════════════════════════════════════════════════════════════════
// END SCREEN
// ════════════════════════════════════════════════════════════════════════════
function renderEnd(gs) {
  const box = document.getElementById('end-box');
  if (!box || !gs) return;

  const winner = gs.winner || 'red';
  const winnerName = gs.teams?.[winner]?.name || (winner === 'red' ? t('team_red') : t('team_blue'));
  const reason = gs.win_reason === 'assassin' ? t('end_reason_assassin') : t('end_reason_all_found');

  // Mini board for end screen
  const boardHtml = (gs.cards || []).map(c =>
    `<div class="cn-card revealed team-${c.team}" style="min-height:44px">
      <span class="cn-card-word" style="font-size:0.7rem">${esc(c.word)}</span>
    </div>`
  ).join('');

  box.innerHTML = `
    <div class="end-winner-badge ${winner}">${esc(winnerName)} ${t('end_wins')}</div>
    <div class="end-reason">${reason}</div>
    <div class="end-board">
      <div class="card-grid" style="max-width:480px;margin:0 auto;gap:4px">${boardHtml}</div>
    </div>
    <div class="end-actions">
      ${amHost ? `<button class="cn-btn cn-btn-primary" onclick="doPlayAgain()">${t('btn_play_again')}</button>` : ''}
      <button class="cn-btn cn-btn-secondary" onclick="doGoHome()">${t('btn_home')}</button>
    </div>
  `;
}

window.doPlayAgain = async function() {
  const res = await apiPost('reset_game', {pin: myPin, player_id: myPlayerId});
  if (res?.ok) { prevCards = []; await doRefresh(); }
  else showToast(t('err_unknown'), 'error');
};

window.doGoHome = function() {
  stopPolling();
  myPin = null; myRole = null; myTeam = null; amHost = false; lastState = null;
  history.replaceState({}, '', location.pathname);
  showScreen('screen-start');
  renderStart();
};

// ════════════════════════════════════════════════════════════════════════════
// Theme toggle (Dark = Standard, body.light = Override)
// ════════════════════════════════════════════════════════════════════════════
(function() {
  const KEY = 'spiele_theme';
  function apply(light) {
    document.body.classList.toggle('light', light);
    document.querySelectorAll('#btn-theme').forEach(el => {
      el.textContent = light ? '🌙 Darkmode' : '☀️ Lightmode';
    });
  }
  window.toggleTheme = function() {
    const nowLight = !document.body.classList.contains('light');
    localStorage.setItem(KEY, nowLight ? 'light' : 'dark');
    apply(nowLight);
  };
  apply(localStorage.getItem(KEY) === 'light');
})();

// ════════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async function() {
  // Load language
  const urlParams  = new URLSearchParams(location.search);
  const urlLang    = urlParams.get('lang');
  lang = urlLang || localStorage.getItem('cn_lang') || 'de';
  if (!T[lang]) lang = 'de';

  myPlayerId = getOrCreatePlayerId();

  // Pre-fill name
  const savedName = localStorage.getItem('cn_player_name') || '';
  const nameEl = document.getElementById('start-name');
  if (nameEl && savedName) nameEl.value = savedName;

  // Auto-join from URL pin
  const urlPin = urlParams.get('pin');
  if (urlPin) {
    const pinEl = document.getElementById('start-pin');
    if (pinEl) pinEl.value = urlPin.toUpperCase();

    // Try to rejoin silently
    if (savedName) {
      const res = await apiPost('join_game', {
        pin: urlPin.toUpperCase(),
        player_name: savedName,
        player_id: myPlayerId,
      });
      if (res?.ok || res?.player_id) {
        myPin = urlPin.toUpperCase();
        if (res.player_id) {
          myPlayerId = res.player_id;
          localStorage.setItem('cn_player_id', myPlayerId);
        }
        amHost = res.is_host || false;
        lang   = res.language || lang;
        showScreen('screen-lobby');
        startPolling();
        return;
      }
    }
  }

  showScreen('screen-start');
  renderStart();
});
