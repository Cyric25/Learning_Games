<?php
// codenames/api.php — Codenames Game API
// Actions: create_game, join_game, select_role, get_state, update_settings,
//          start_game, submit_clue, guess_card, end_turn, heartbeat, reset_game,
//          get_wordlists, get_wordlist, save_wordlist, delete_wordlist

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Cache-Control: no-store, no-cache');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$action   = trim($_GET['action'] ?? '');
$gamesDir = __DIR__ . '/../data/games/codenames';
$wlDir    = __DIR__ . '/../data/codenames';

foreach ([$gamesDir, $wlDir] as $d) {
    if (!is_dir($d)) @mkdir($d, 0755, true);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function jsonBody(): array {
    static $cached = null;
    if ($cached !== null) return $cached;
    $raw = file_get_contents('php://input');
    $dec = json_decode($raw, true);
    $cached = is_array($dec) ? $dec : [];
    return $cached;
}

function san(string $s, int $max = 100): string {
    return mb_substr(trim($s), 0, $max);
}

function generatePin(): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $out = '';
    for ($i = 0; $i < 4; $i++) $out .= $chars[random_int(0, strlen($chars) - 1)];
    return $out;
}

function generateId(int $len = 10): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    $out = '';
    for ($i = 0; $i < $len; $i++) $out .= $chars[random_int(0, strlen($chars) - 1)];
    return $out;
}

function loadGame(string $pin, string $dir): ?array {
    $path = $dir . '/' . strtoupper($pin) . '.json';
    if (!file_exists($path)) return null;
    $d = @json_decode(file_get_contents($path), true);
    return is_array($d) ? $d : null;
}

function saveGame(array &$game, string $dir): bool {
    $pin = strtoupper($game['pin'] ?? '');
    if (!$pin) return false;
    $game['updated_at'] = time();
    $json = json_encode($game, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $path = $dir . '/' . $pin . '.json';
    if (file_put_contents($path, $json, LOCK_EX) === false) return false;

    // Update registry
    $regPath = $dir . '/index.json';
    $fp = @fopen($regPath, 'c+');
    if ($fp && flock($fp, LOCK_EX)) {
        $reg = @json_decode(stream_get_contents($fp), true);
        if (!is_array($reg)) $reg = [];
        $reg[$pin] = [
            'status'     => $game['status'] ?? 'lobby',
            'language'   => $game['language'] ?? 'de',
            'created_at' => $game['created_at'] ?? $game['updated_at'],
            'updated_at' => $game['updated_at'],
        ];
        ftruncate($fp, 0); rewind($fp);
        fwrite($fp, json_encode($reg, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fp); flock($fp, LOCK_UN); fclose($fp);
    }
    return true;
}

function cleanupGames(string $dir): void {
    $regPath = $dir . '/index.json';
    if (!file_exists($regPath)) return;
    $fp = @fopen($regPath, 'c+');
    if (!$fp || !flock($fp, LOCK_EX)) { if ($fp) fclose($fp); return; }
    $reg = @json_decode(stream_get_contents($fp), true);
    if (!is_array($reg)) { flock($fp, LOCK_UN); fclose($fp); return; }
    $changed = false;
    foreach ($reg as $pin => $info) {
        $age = time() - ($info['updated_at'] ?? $info['created_at'] ?? 0);
        if ($age > 86400) {
            @unlink($dir . '/' . $pin . '.json');
            unset($reg[$pin]);
            $changed = true;
        }
    }
    if ($changed) {
        ftruncate($fp, 0); rewind($fp);
        fwrite($fp, json_encode($reg, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fp);
    }
    flock($fp, LOCK_UN); fclose($fp);
}

// Filter game state: non-spymasters don't see unrevealed card teams
function filterState(array $game, string $playerId): array {
    $isSpy = false;
    foreach (['red', 'blue'] as $t) {
        if (($game['spymasters'][$t] ?? null) === $playerId) { $isSpy = true; break; }
    }
    if (!$isSpy) {
        $game['cards'] = array_map(function ($c) {
            if (!($c['revealed'] ?? false)) $c['team'] = null;
            return $c;
        }, $game['cards'] ?? []);
    }
    // Strip last_guess_time from players (internal field)
    $game['players'] = array_map(function ($p) {
        unset($p['last_guess_time']);
        return $p;
    }, $game['players'] ?? []);
    return $game;
}

function findPlayerIdx(array $game, string $playerId): int {
    foreach ($game['players'] as $i => $p) {
        if (($p['id'] ?? '') === $playerId) return $i;
    }
    return -1;
}

function isHost(array $game, string $playerId): bool {
    $i = findPlayerIdx($game, $playerId);
    return $i >= 0 && ($game['players'][$i]['is_host'] ?? false);
}

function switchTurn(array &$game): void {
    $game['current_turn'] = $game['current_turn'] === 'red' ? 'blue' : 'red';
    $game['current_clue'] = null;
}

// Returns true if game is now finished
function checkWin(array &$game): bool {
    foreach (['red', 'blue'] as $t) {
        if (($game['teams'][$t]['remaining'] ?? 1) <= 0) {
            $game['status']     = 'finished';
            $game['winner']     = $t;
            $game['win_reason'] = 'all_found';
            return true;
        }
    }
    return false;
}

function err(string $msg, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

function ok(array $extra = []): never {
    echo json_encode(array_merge(['ok' => true], $extra));
    exit;
}

// ── Routing ───────────────────────────────────────────────────────────────

switch ($action) {

// ── create_game ──────────────────────────────────────────────────────────
case 'create_game': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b = jsonBody();

    $language = in_array($b['language'] ?? '', ['de','en','it','es','ru','fr'])
        ? $b['language'] : 'de';
    $playerName = san($b['player_name'] ?? 'Host', 30);
    $teamRed    = san($b['team_red']  ?? ($language === 'de' ? 'Rot'  : 'Red'),  30);
    $teamBlue   = san($b['team_blue'] ?? ($language === 'de' ? 'Blau' : 'Blue'), 30);
    $wordlistId = san($b['wordlist_id'] ?? '', 30);

    cleanupGames($gamesDir);

    // Unique PIN
    $pin = generatePin();
    for ($i = 0; $i < 50 && file_exists($gamesDir . '/' . $pin . '.json'); $i++) $pin = generatePin();

    $playerId  = generateId(10);
    $firstTeam = rand(0, 1) ? 'red' : 'blue';
    $now       = time();

    $game = [
        'pin'          => $pin,
        'status'       => 'lobby',
        'language'     => $language,
        'wordlist_id'  => $wordlistId,
        'custom_words' => [],
        'teams' => [
            'red'  => ['name' => $teamRed,  'remaining' => 0],
            'blue' => ['name' => $teamBlue, 'remaining' => 0],
        ],
        'first_team'    => $firstTeam,
        'current_turn'  => $firstTeam,
        'cards'         => [],
        'players'       => [[
            'id'       => $playerId,
            'name'     => $playerName,
            'team'     => null,
            'role'     => null,
            'last_seen'=> $now,
            'is_host'  => true,
        ]],
        'spymasters'    => ['red' => null, 'blue' => null],
        'clues'         => [],
        'current_clue'  => null,
        'winner'        => null,
        'win_reason'    => null,
        'created_at'    => $now,
        'updated_at'    => $now,
    ];

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok(['pin' => $pin, 'player_id' => $playerId]);
}

// ── join_game ─────────────────────────────────────────────────────────────
case 'join_game': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b = jsonBody();
    $pin        = strtoupper(san($b['pin'] ?? '', 6));
    $playerName = san($b['player_name'] ?? 'Spieler', 30);
    $existId    = san($b['player_id'] ?? '', 15);

    if (!$pin) err('pin_required');
    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    if ($game['status'] === 'finished') err('game_finished');

    $now = time();

    // Reconnect existing player
    if ($existId) {
        $i = findPlayerIdx($game, $existId);
        if ($i >= 0) {
            $game['players'][$i]['last_seen'] = $now;
            $game['players'][$i]['name']      = $playerName;
            saveGame($game, $gamesDir);
            ok([
                'player_id' => $existId,
                'status'    => $game['status'],
                'language'  => $game['language'],
                'is_host'   => $game['players'][$i]['is_host'] ?? false,
            ]);
        }
    }

    if (count($game['players']) >= 12) err('game_full');

    $playerId = generateId(10);
    $game['players'][] = [
        'id'       => $playerId,
        'name'     => $playerName,
        'team'     => null,
        'role'     => null,
        'last_seen'=> $now,
        'is_host'  => false,
    ];

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok([
        'player_id' => $playerId,
        'status'    => $game['status'],
        'language'  => $game['language'],
        'is_host'   => false,
    ]);
}

// ── select_role ───────────────────────────────────────────────────────────
case 'select_role': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b        = jsonBody();
    $pin      = strtoupper(san($b['pin'] ?? '', 6));
    $playerId = san($b['player_id'] ?? '', 15);
    $team     = in_array($b['team'] ?? '', ['red', 'blue']) ? $b['team'] : null;
    $role     = in_array($b['role'] ?? '', ['spymaster', 'operative', 'spectator']) ? $b['role'] : null;

    if (!$pin || !$playerId) err('params_required');
    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    if ($game['status'] !== 'lobby') err('game_already_started');

    $i = findPlayerIdx($game, $playerId);
    if ($i < 0) err('player_not_found', 404);

    $now = time();

    // Release spymaster slot if previously held by this player
    foreach (['red', 'blue'] as $t) {
        if (($game['spymasters'][$t] ?? null) === $playerId) $game['spymasters'][$t] = null;
    }

    if ($role === 'spectator') {
        $game['players'][$i]['team']      = null;
        $game['players'][$i]['role']      = 'spectator';
        $game['players'][$i]['last_seen'] = $now;
        saveGame($game, $gamesDir);
        ok();
    }

    if (!$team || !$role) err('params_required');

    // Check spymaster slot availability
    if ($role === 'spymaster') {
        $currentSpy = $game['spymasters'][$team] ?? null;
        if ($currentSpy && $currentSpy !== $playerId) {
            // Check heartbeat timeout (60s)
            $j = findPlayerIdx($game, $currentSpy);
            if ($j >= 0 && ($now - ($game['players'][$j]['last_seen'] ?? 0)) < 60) {
                err('spymaster_taken');
            }
            // Timed out — allow takeover
        }
        $game['spymasters'][$team] = $playerId;
    }

    $game['players'][$i]['team']      = $team;
    $game['players'][$i]['role']      = $role;
    $game['players'][$i]['last_seen'] = $now;

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok();
}

// ── get_state ─────────────────────────────────────────────────────────────
case 'get_state': {
    $pin      = strtoupper(san($_GET['pin'] ?? '', 6));
    $playerId = san($_GET['player_id'] ?? '', 15);
    if (!$pin) err('pin_required');
    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    echo json_encode(filterState($game, $playerId));
    exit;
}

// ── update_settings ───────────────────────────────────────────────────────
case 'update_settings': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b        = jsonBody();
    $pin      = strtoupper(san($b['pin'] ?? '', 6));
    $playerId = san($b['player_id'] ?? '', 15);
    if (!$pin || !$playerId) err('params_required');
    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    if ($game['status'] !== 'lobby') err('game_already_started');
    if (!isHost($game, $playerId)) err('not_host');

    if (isset($b['team_red']))    $game['teams']['red']['name']  = san($b['team_red'], 30);
    if (isset($b['team_blue']))   $game['teams']['blue']['name'] = san($b['team_blue'], 30);
    if (isset($b['wordlist_id'])) $game['wordlist_id']           = san($b['wordlist_id'], 30);
    if (isset($b['custom_words']) && is_array($b['custom_words'])) {
        $game['custom_words'] = array_values(array_filter(
            array_map(fn($w) => san((string)$w, 60), $b['custom_words']),
            fn($w) => $w !== ''
        ));
    }

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok();
}

// ── start_game ────────────────────────────────────────────────────────────
case 'start_game': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b        = jsonBody();
    $pin      = strtoupper(san($b['pin'] ?? '', 6));
    $playerId = san($b['player_id'] ?? '', 15);
    if (!$pin || !$playerId) err('params_required');
    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    if ($game['status'] !== 'lobby') err('game_already_started');
    if (!isHost($game, $playerId)) err('not_host');

    // Resolve 25 words
    $words = [];
    if (count($game['custom_words'] ?? []) === 25) {
        $words = $game['custom_words'];
    } elseif (!empty($game['wordlist_id'])) {
        $wlPath = $GLOBALS['wlDir'] . '/' . $game['wordlist_id'] . '.json';
        if (file_exists($wlPath)) {
            $wl    = @json_decode(file_get_contents($wlPath), true);
            $words = is_array($wl['words'] ?? null) ? $wl['words'] : [];
        }
    }
    if (count($words) !== 25) err('words_required');

    // Shuffle words + assign teams
    shuffle($words);
    $ft = $game['first_team'];
    $st = $ft === 'red' ? 'blue' : 'red';
    $assignments = array_merge(
        array_fill(0, 9, $ft),
        array_fill(0, 8, $st),
        array_fill(0, 7, 'neutral'),
        ['assassin']
    );
    shuffle($assignments);

    $cards = [];
    for ($i = 0; $i < 25; $i++) {
        $cards[] = ['word' => $words[$i], 'team' => $assignments[$i], 'revealed' => false];
    }

    $game['cards']                    = $cards;
    $game['teams']['red']['remaining']  = $ft === 'red' ? 9 : 8;
    $game['teams']['blue']['remaining'] = $ft === 'blue' ? 9 : 8;
    $game['status']                   = 'active';
    $game['current_turn']             = $ft;
    $game['clues']                    = [];
    $game['current_clue']             = null;
    $game['winner']                   = null;
    $game['win_reason']               = null;

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok(['first_team' => $ft]);
}

// ── submit_clue ───────────────────────────────────────────────────────────
case 'submit_clue': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b        = jsonBody();
    $pin      = strtoupper(san($b['pin'] ?? '', 6));
    $playerId = san($b['player_id'] ?? '', 15);
    $word     = san($b['word'] ?? '', 50);
    $number   = max(0, min(9, (int)($b['number'] ?? 0)));
    if (!$pin || !$playerId || !$word) err('params_required');

    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    if ($game['status'] !== 'active') err('game_not_active');
    if ($game['current_clue'] !== null) err('clue_already_given');

    // Only active spymaster may give clue
    $activeSpy = $game['spymasters'][$game['current_turn']] ?? null;
    if ($activeSpy !== $playerId) err('not_your_turn');

    $now = time();
    // number=0 means unlimited (∞): allow up to 25 guesses
    $guessesLeft = $number === 0 ? 25 : $number + 1;

    $game['current_clue'] = [
        'word'        => $word,
        'number'      => $number,
        'guesses_left'=> $guessesLeft,
        'team'        => $game['current_turn'],
        'ts'          => $now,
    ];
    $game['clues'][] = [
        'team'        => $game['current_turn'],
        'word'        => $word,
        'number'      => $number,
        'guesses_made'=> 0,
        'ts'          => $now,
    ];

    $i = findPlayerIdx($game, $playerId);
    if ($i >= 0) $game['players'][$i]['last_seen'] = $now;

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok();
}

// ── guess_card ────────────────────────────────────────────────────────────
case 'guess_card': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b         = jsonBody();
    $pin       = strtoupper(san($b['pin'] ?? '', 6));
    $playerId  = san($b['player_id'] ?? '', 15);
    $cardIndex = (int)($b['card_index'] ?? -1);
    if (!$pin || !$playerId || $cardIndex < 0 || $cardIndex > 24) err('params_required');

    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    if ($game['status'] !== 'active') err('game_not_active');
    if ($game['current_clue'] === null) err('no_clue_yet');
    if ($game['cards'][$cardIndex]['revealed'] ?? false) err('already_revealed');

    $i = findPlayerIdx($game, $playerId);
    if ($i < 0) err('player_not_found', 404);
    $player = $game['players'][$i];

    // Only active team's operatives may guess
    if (($player['team'] ?? '') !== $game['current_turn'] || ($player['role'] ?? '') !== 'operative') {
        err('not_your_turn');
    }

    // Rate limit: 1 guess/second per player
    $now = time();
    if ($now - ($player['last_guess_time'] ?? 0) < 1) err('rate_limit');
    $game['players'][$i]['last_guess_time'] = $now;
    $game['players'][$i]['last_seen']       = $now;

    // Reveal card
    $game['cards'][$cardIndex]['revealed'] = true;
    $cardTeam    = $game['cards'][$cardIndex]['team'];
    $currentTeam = $game['current_turn'];
    $otherTeam   = $currentTeam === 'red' ? 'blue' : 'red';
    $endTurn     = false;
    $finished    = false;

    // Decrement remaining for the revealed team
    if ($cardTeam === 'red' || $cardTeam === 'blue') {
        $game['teams'][$cardTeam]['remaining'] = max(0,
            ($game['teams'][$cardTeam]['remaining'] ?? 0) - 1
        );
    }

    // Update clue guesses_made
    $cIdx = count($game['clues']) - 1;
    if ($cIdx >= 0) $game['clues'][$cIdx]['guesses_made']++;

    if ($cardTeam === 'assassin') {
        $game['status']     = 'finished';
        $game['winner']     = $otherTeam;
        $game['win_reason'] = 'assassin';
        $finished = true;
    } elseif (checkWin($game)) {
        $finished = true;
    } else {
        if ($cardTeam !== $currentTeam) {
            // Wrong card — end turn
            $endTurn = true;
        } else {
            // Hit — consume a guess
            $game['current_clue']['guesses_left']--;
            if ($game['current_clue']['guesses_left'] <= 0) $endTurn = true;
        }
        if ($endTurn) switchTurn($game);
    }

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok([
        'card_team'   => $cardTeam,
        'end_turn'    => $endTurn,
        'finished'    => $finished,
        'winner'      => $game['winner'],
        'status'      => $game['status'],
        'guesses_left'=> $game['current_clue']['guesses_left'] ?? 0,
    ]);
}

// ── end_turn ──────────────────────────────────────────────────────────────
case 'end_turn': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b        = jsonBody();
    $pin      = strtoupper(san($b['pin'] ?? '', 6));
    $playerId = san($b['player_id'] ?? '', 15);
    if (!$pin || !$playerId) err('params_required');

    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    if ($game['status'] !== 'active') err('game_not_active');

    $i = findPlayerIdx($game, $playerId);
    if ($i < 0) err('player_not_found', 404);
    $p = $game['players'][$i];

    $canEnd = (($p['team'] ?? '') === $game['current_turn'] && ($p['role'] ?? '') === 'operative')
           || ($p['is_host'] ?? false);
    if (!$canEnd) err('not_your_turn');

    $game['players'][$i]['last_seen'] = time();
    switchTurn($game);

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok(['current_turn' => $game['current_turn']]);
}

// ── heartbeat ─────────────────────────────────────────────────────────────
case 'heartbeat': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b        = jsonBody();
    $pin      = strtoupper(san($b['pin'] ?? '', 6));
    $playerId = san($b['player_id'] ?? '', 15);
    if (!$pin || !$playerId) err('params_required');

    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);

    $i = findPlayerIdx($game, $playerId);
    if ($i >= 0) {
        $game['players'][$i]['last_seen'] = time();
        saveGame($game, $gamesDir);
    }
    ok(['status' => $game['status']]);
}

// ── reset_game ────────────────────────────────────────────────────────────
case 'reset_game': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b        = jsonBody();
    $pin      = strtoupper(san($b['pin'] ?? '', 6));
    $playerId = san($b['player_id'] ?? '', 15);
    if (!$pin || !$playerId) err('params_required');

    $game = loadGame($pin, $gamesDir);
    if (!$game) err('game_not_found', 404);
    if (!isHost($game, $playerId)) err('not_host');

    $firstTeam = rand(0, 1) ? 'red' : 'blue';
    $game['status']       = 'lobby';
    $game['first_team']   = $firstTeam;
    $game['current_turn'] = $firstTeam;
    $game['cards']        = [];
    $game['clues']        = [];
    $game['current_clue'] = null;
    $game['winner']       = null;
    $game['win_reason']   = null;
    $game['spymasters']   = ['red' => null, 'blue' => null];
    foreach ($game['players'] as &$p) { $p['team'] = null; $p['role'] = null; }
    unset($p);

    if (!saveGame($game, $gamesDir)) err('save_failed', 500);
    ok();
}

// ── get_wordlists ─────────────────────────────────────────────────────────
case 'get_wordlists': {
    $regPath = $wlDir . '/index.json';
    if (!file_exists($regPath)) { echo json_encode(['lists' => []]); exit; }
    $data  = @json_decode(file_get_contents($regPath), true);
    $lists = is_array($data['lists'] ?? null) ? $data['lists'] : [];
    // Optional filter
    if (!empty($_GET['language'])) {
        $fl    = $_GET['language'];
        $lists = array_values(array_filter($lists, fn($l) => ($l['language'] ?? '') === $fl));
    }
    if (!empty($_GET['subject'])) {
        $fs    = strtolower($_GET['subject']);
        $lists = array_values(array_filter($lists, fn($l) => strtolower($l['subject'] ?? '') === $fs));
    }
    echo json_encode(['lists' => $lists]);
    exit;
}

// ── get_wordlist ──────────────────────────────────────────────────────────
case 'get_wordlist': {
    $id   = san($_GET['id'] ?? '', 40);
    if (!$id) err('id_required');
    // Sanitize: only allow safe chars
    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) err('invalid_id');
    $path = $wlDir . '/' . $id . '.json';
    if (!file_exists($path)) err('not_found', 404);
    echo file_get_contents($path);
    exit;
}

// ── save_wordlist ─────────────────────────────────────────────────────────
case 'save_wordlist': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b       = jsonBody();
    $name    = san($b['name'] ?? '', 80);
    $lang    = in_array($b['language'] ?? '', ['de','en','it','es','ru','fr']) ? $b['language'] : 'de';
    $subject = san($b['subject'] ?? '', 50);
    $words   = is_array($b['words'] ?? null)
        ? array_map(fn($w) => san((string)$w, 60), $b['words'])
        : [];

    if (!$name)               err('name_required');
    if (count($words) !== 25) err('words_must_be_25');

    // ID: reuse existing or generate new
    $id = san($b['id'] ?? '', 40);
    if (!$id || !preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) $id = 'list_' . generateId(8);

    $now      = time();
    $existing = null;
    $ePath    = $wlDir . '/' . $id . '.json';
    if (file_exists($ePath)) $existing = @json_decode(file_get_contents($ePath), true);

    $wl = [
        'id'         => $id,
        'name'       => $name,
        'language'   => $lang,
        'subject'    => $subject,
        'words'      => array_values($words),
        'created_at' => $existing['created_at'] ?? $now,
        'updated_at' => $now,
    ];

    if (file_put_contents($ePath, json_encode($wl, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX) === false)
        err('save_failed', 500);

    // Update registry
    $regPath = $wlDir . '/index.json';
    $fp = @fopen($regPath, 'c+');
    if ($fp && flock($fp, LOCK_EX)) {
        $reg   = @json_decode(stream_get_contents($fp), true);
        $lists = is_array($reg['lists'] ?? null) ? $reg['lists'] : [];
        // Update or append
        $found = false;
        foreach ($lists as &$entry) {
            if (($entry['id'] ?? '') === $id) {
                $entry = ['id'=>$id,'name'=>$name,'language'=>$lang,'subject'=>$subject,'word_count'=>25,'created_at'=>$wl['created_at'],'updated_at'=>$now];
                $found = true;
                break;
            }
        }
        unset($entry);
        if (!$found) $lists[] = ['id'=>$id,'name'=>$name,'language'=>$lang,'subject'=>$subject,'word_count'=>25,'created_at'=>$wl['created_at'],'updated_at'=>$now];
        // Sort by updated_at desc
        usort($lists, fn($a,$b) => ($b['updated_at']??0) <=> ($a['updated_at']??0));
        ftruncate($fp, 0); rewind($fp);
        fwrite($fp, json_encode(['lists' => $lists], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fp); flock($fp, LOCK_UN); fclose($fp);
    }

    ok(['id' => $id]);
}

// ── delete_wordlist ───────────────────────────────────────────────────────
case 'delete_wordlist': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('POST required');
    $b         = jsonBody();
    $id        = san($b['id'] ?? '', 40);
    $confirmId = san($b['confirm_id'] ?? '', 40);
    if (!$id || $id !== $confirmId) err('confirm_mismatch');
    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) err('invalid_id');

    @unlink($wlDir . '/' . $id . '.json');

    $regPath = $wlDir . '/index.json';
    if (file_exists($regPath)) {
        $fp = @fopen($regPath, 'c+');
        if ($fp && flock($fp, LOCK_EX)) {
            $reg   = @json_decode(stream_get_contents($fp), true);
            $lists = is_array($reg['lists'] ?? null) ? $reg['lists'] : [];
            $lists = array_values(array_filter($lists, fn($l) => ($l['id'] ?? '') !== $id));
            ftruncate($fp, 0); rewind($fp);
            fwrite($fp, json_encode(['lists' => $lists], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            fflush($fp); flock($fp, LOCK_UN); fclose($fp);
        }
    }
    ok();
}

default:
    err('unknown_action');
}
