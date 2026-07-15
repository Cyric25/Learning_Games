<?php
// api.php – JSON-Storage für Risiko-Quiz auf PHP-Webhostings (z.B. All-Inkl.com)
// Aufruf: api.php?f=questions  oder  api.php?f=gamestate
//         api.php?f=games          (Registry aller Spiele)
//         api.php?f=game&code=XXXX (Spielstand pro Spiel)
//         api.php?f=sse&code=XXXX  (Server-Sent Events Stream)
// Weitere Spiele nutzen dieselben Endpunkte mit Prefix (ls-, bs-, qp-, labyrinth-, jo-).

$key = trim($_GET['f'] ?? '', '/');

// ── Admin-Schutz ──────────────────────────────────────────────────
// Destruktive Endpunkte (Fragendatenbank überschreiben, Spiele löschen,
// Designer-Bibliotheken, Draft-Löschung) verlangen diesen Header. Das Token
// steht zwangsläufig im Quelltext der Lehrkraft-Seiten — es ist eine Hürde
// gegen Copy-Paste-Vandalismus, kein echtes Geheimnis.
define('ADMIN_KEY', 'LP-Spiele-2026');
function requireAdminKey() {
    $k = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
    if (!hash_equals(ADMIN_KEY, $k)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'forbidden']);
        exit;
    }
}

// ── Gemeinsame Helfer ─────────────────────────────────────────────

function requireValidCode() {
    $code = strtoupper(trim($_GET['code'] ?? ''));
    if (!preg_match('/^[A-Z0-9]{4,6}$/', $code)) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'invalid code']);
        exit;
    }
    return $code;
}

// Atomares Schreiben: erst Temp-Datei, dann rename().
// Leser sehen dadurch nie eine halb geschriebene Datei.
function atomicWrite($path, $data) {
    $tmp = $path . '.tmp.' . getmypid();
    if (file_put_contents($tmp, $data, LOCK_EX) === false) return false;
    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    return true;
}

function readJsonBody() {
    $body = file_get_contents('php://input');
    if (json_decode($body) === null && json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid JSON']);
        exit;
    }
    return $body;
}

// SSE-Stream für eine Spielstand-Datei.
// - Signatur (mtime+size+md5) statt nur mtime: erkennt auch mehrere Saves
//   innerhalb derselben Sekunde (filemtime hat 1s-Auflösung).
// - Keepalive-Kommentar alle 2s, damit connection_aborted() abgebrochene
//   Clients erkennt und den PHP-Worker freigibt (wichtig bei 25+ Geräten).
function sseStream($path) {
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('Access-Control-Allow-Origin: *');
    header('X-Accel-Buffering: no'); // nginx

    @ini_set('output_buffering', 'off');
    @ini_set('zlib.output_compression', false);
    while (ob_get_level()) ob_end_flush();

    $lastStat = '';
    $lastSig = '';
    $start = time();
    $lastPing = 0;
    $maxDuration = 30; // seconds

    while (true) {
        if (connection_aborted()) break;
        if ((time() - $start) >= $maxDuration) {
            echo "event: reconnect\ndata: {}\n\n";
            @flush();
            break;
        }

        if (file_exists($path)) {
            clearstatcache(true, $path);
            // Zweistufig: billiger mtime+size-Check pro Tick; md5 nur bei
            // Änderung (erkennt mehrere Saves in derselben Sekunde bei
            // gleicher Größe). Sonst rechnen 25 Streams ~83 Hashes/s.
            $stat = @filemtime($path) . ':' . @filesize($path);
            if ($stat !== $lastStat) {
                $lastStat = $stat;
                $sig = $stat . ':' . @md5_file($path);
                if ($sig !== $lastSig) {
                    $lastSig = $sig;
                    $data = @file_get_contents($path);
                    if ($data !== false && $data !== '') {
                        echo "data: " . $data . "\n\n";
                        @flush();
                    }
                }
            }
        }

        if ((time() - $lastPing) >= 2) {
            $lastPing = time();
            echo ":ka\n\n";
            @flush();
        }

        usleep(300000); // 300ms
    }
    exit;
}

// ── Registry-Zugriff ──────────────────────────────────────────────
// Alle Registry-Writes laufen über dieses eine Muster: exklusiver flock auf
// einer separaten .lock-Datei (serialisiert Schreiber untereinander) plus
// atomicWrite per tmp+rename (ungelockte LESER sehen nie halbe Dateien).
// Vorher existierten zwei inkompatible Schreibwege (in-place unter flock vs.
// rename), die sich gegenseitig Updates wegnehmen konnten.
function withRegistry($gamesDir, callable $fn) {
    $registryPath = $gamesDir . '/index.json';
    $lock = @fopen($registryPath . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) { if ($lock) fclose($lock); return false; }
    $registry = [];
    if (file_exists($registryPath)) {
        $registry = json_decode(@file_get_contents($registryPath), true) ?: [];
    }
    $result = $fn($registry);
    $ok = true;
    if (is_array($result)) { // null = keine Änderung
        $ok = atomicWrite($registryPath, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    return $ok;
}

// ── Cleanup: Spiele älter als 24h löschen ─────────────────────────
function cleanupExpiredGames($gamesDir) {
    if (!file_exists($gamesDir . '/index.json')) return;
    withRegistry($gamesDir, function ($registry) use ($gamesDir) {
        $changed = false;
        $now = time();
        $maxAge = 24 * 60 * 60; // 24 Stunden
        foreach ($registry as $code => $info) {
            $timestamp = $info['updatedAt'] ?? $info['createdAt'] ?? null;
            if (!$timestamp) continue;
            $ts = strtotime($timestamp);
            if ($ts === false) continue; // kaputter Timestamp → NICHT löschen
            if (($now - $ts) > $maxAge) {
                $gamePath = $gamesDir . '/' . $code . '.json';
                if (file_exists($gamePath)) @unlink($gamePath);
                // .lock-Dateien absichtlich NICHT löschen: unlink während ein
                // Prozess flock hält, ließe einen zweiten Prozess auf einer
                // neuen Inode "exklusiv" locken → CAS-Atomarität gebrochen.
                unset($registry[$code]);
                $changed = true;
            }
        }
        return $changed ? $registry : null;
    });
}

function updateRegistryEntry($gamesDir, $code, $body, $defaultTitle) {
    withRegistry($gamesDir, function ($registry) use ($code, $body, $defaultTitle) {
        $gameData = json_decode($body, true);
        $registry[$code] = [
            'title'     => $gameData['meta']['title'] ?? $defaultTitle,
            'status'    => $gameData['phase'] ?? 'setup',
            'createdAt' => $gameData['meta']['createdAt'] ?? date('c'),
            'updatedAt' => date('c'),
        ];
        return $registry;
    });
}

function removeRegistryEntry($gamesDir, $code) {
    if (!file_exists($gamesDir . '/index.json')) return;
    withRegistry($gamesDir, function ($registry) use ($code) {
        unset($registry[$code]);
        return $registry;
    });
}

// Registry-Endpunkt (?f=…-games): GET mit Cleanup, POST kompletter Snapshot
function registryEndpoint($gamesDir) {
    if (!is_dir($gamesDir)) mkdir($gamesDir, 0755, true);
    $registryPath = $gamesDir . '/index.json';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        cleanupExpiredGames($gamesDir);
        echo file_exists($registryPath) ? file_get_contents($registryPath) : '{}';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdminKey(); // kompletter Registry-Snapshot = Lehrkraft-Aktion
        $body = readJsonBody();
        $incoming = json_decode($body, true);
        // Snapshot-POST unter demselben Lock wie alle anderen Registry-Writes
        $ok = is_array($incoming) && withRegistry($gamesDir, fn($registry) => $incoming);
        $ok ? print(json_encode(['ok' => true]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
    }
    exit;
}

// Per-Game-Endpunkt (?f=…-game&code=XXXX): GET/POST/DELETE
//
// Optimistische Nebenläufigkeitskontrolle (Compare-and-Swap):
//   - Jeder gespeicherte Spielstand trägt ein server-verwaltetes `_rev`.
//   - Sendet der Client `_baseRev` (die Version, die er zuletzt gesehen hat),
//     prüft der Server unter flock, ob sie noch aktuell ist. Bei Abweichung →
//     HTTP 409 + aktueller Stand im Body, damit der Client neu mergen kann.
//   - Ohne `_baseRev` (autoritative Schreiber, Legacy-Clients) wird direkt
//     geschrieben — voll rückwärtskompatibel.
function gameEndpoint($gamesDir, $defaultTitle) {
    $code = requireValidCode();
    if (!is_dir($gamesDir)) mkdir($gamesDir, 0755, true);
    $path = $gamesDir . '/' . $code . '.json';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo file_exists($path) ? file_get_contents($path) : '{}';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = readJsonBody();
        $incoming = json_decode($body, true);
        if (!is_array($incoming)) { http_response_code(400); echo json_encode(['error' => 'invalid JSON']); exit; }
        $baseRev = array_key_exists('_baseRev', $incoming) ? (int)$incoming['_baseRev'] : null;
        unset($incoming['_baseRev']); // interne Feld, nicht persistieren

        // Compare-and-Swap unter Lock: lesen → prüfen → schreiben ist atomar.
        // Ohne Lock NICHT fortfahren — sonst liefe genau die Race, die CAS
        // verhindern soll (stilles Weiterlaufen wäre schlimmer als ein 500).
        $lock = @fopen($path . '.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX)) {
            if ($lock) fclose($lock);
            http_response_code(500);
            echo json_encode(['error' => 'lock error']);
            exit;
        }

        $storedRev = 0;
        $cur = null;
        if (file_exists($path)) {
            $cur = json_decode(@file_get_contents($path), true);
            if (is_array($cur)) $storedRev = (int)($cur['_rev'] ?? 0);
        }

        if ($baseRev !== null && $baseRev !== $storedRev) {
            // Konflikt: der Client baut auf einer veralteten Version auf
            if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
            http_response_code(409);
            header('X-Current-Rev: ' . $storedRev);
            echo file_exists($path) ? file_get_contents($path) : '{}';
            exit;
        }

        // takenTeams wird server-seitig gemerged: Plain-Saves (Spielzüge)
        // senden das Feld nicht mit — nur Beitritt/Kick (CAS-Saves) schreiben
        // es. So können veraltete Spielzug-Snapshots keine frisch
        // beigetretenen Teams "phantom-kicken".
        if (!array_key_exists('takenTeams', $incoming) &&
            is_array($cur) && array_key_exists('takenTeams', $cur)) {
            $incoming['takenTeams'] = $cur['takenTeams'];
        }

        $incoming['_rev'] = $storedRev + 1;
        $out = json_encode($incoming, JSON_UNESCAPED_UNICODE);
        $ok = atomicWrite($path, $out);
        if ($lock) { flock($lock, LOCK_UN); fclose($lock); }

        if ($ok) updateRegistryEntry($gamesDir, $code, $out, $defaultTitle);
        $ok ? print(json_encode(['ok' => true, 'rev' => $incoming['_rev']]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
    } elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        requireAdminKey(); // Spiel löschen = Lehrkraft-Aktion
        if (file_exists($path)) @unlink($path);
        // .lock absichtlich behalten (siehe cleanupExpiredGames)
        removeRegistryEntry($gamesDir, $code);
        echo json_encode(['ok' => true]);
    }
    exit;
}

// ── Verzeichnisse pro Spiel ───────────────────────────────────────
$gameDirs = [
    ''           => [__DIR__ . '/data/games/risiko-quiz',        'Spiel'],
    'ls-'        => [__DIR__ . '/data/games/leiterspiel',        'Spiel'],
    'bs-'        => [__DIR__ . '/schiffeversenken/data/games',   'Spiel'],
    'labyrinth-' => [__DIR__ . '/data/games/labyrinth',          'Labyrinth-Quiz'],
    'qp-'        => [__DIR__ . '/data/games/quizpfad',           'QuizPfad'],
    'jo-'        => [__DIR__ . '/data/games/just-one',           'Just One'],
];

// ── SSE-Endpunkte (eigene Header, kein JSON) ─────────────────────
foreach ($gameDirs as $prefix => [$dir, $title]) {
    if ($key === $prefix . 'sse') {
        $code = requireValidCode();
        sseStream($dir . '/' . $code . '.json');
    }
}

// ── Standard JSON-API ─────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Key');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

// Statische Dateien (Legacy + Questions)
$files = [
    'questions'    => __DIR__ . '/data/questions.json',
    'gamestate'    => __DIR__ . '/data/risiko-gamestate.json',
    'memory-pairs'     => __DIR__ . '/data/memory/pairs.json',
    'settings'     => __DIR__ . '/data/settings.json',
    'jo-words'     => __DIR__ . '/data/just-one/wordlists.json',
];

// Auto-Migration: alte questions.json → neuer Pfad
try {
    $newQ = $files['questions'];
    $oldQ = __DIR__ . '/risiko-quiz/data/questions.json';
    $needsMigration = !file_exists($newQ) || @filesize($newQ) < 30;
    if ($needsMigration && file_exists($oldQ) && @filesize($oldQ) > 30) {
        $dir = dirname($newQ);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        @copy($oldQ, $newQ);
    }
} catch (Exception $e) { /* Migration fehlgeschlagen – ignorieren */ }

// ── Registry- und Per-Game-Endpunkte für alle Spiele ─────────────
foreach ($gameDirs as $prefix => [$dir, $title]) {
    if ($key === $prefix . 'games') registryEndpoint($dir);
    if ($key === $prefix . 'game')  gameEndpoint($dir, $title === 'Spiel' ? 'Spiel ' . strtoupper(trim($_GET['code'] ?? '')) : $title);
}

// ── Escape Room Library: ?f=er-library ───────────────────────────
if ($key === 'er-library') {
    $erDir = __DIR__ . '/data/escape-room';
    if (!is_dir($erDir)) mkdir($erDir, 0755, true);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $games = [];
        foreach (glob($erDir . '/game_*.json') as $file) {
            $g = json_decode(file_get_contents($file), true);
            if ($g) $games[] = $g;
        }
        usort($games, fn($a,$b) => strcmp($a['id']??'', $b['id']??''));
        echo json_encode($games, JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// ── Escape Room Individual Game: ?f=er-game&id=game_XXXX ──────────
if ($key === 'er-game') {
    $id = trim($_GET['id'] ?? '');
    if (!preg_match('/^game_[0-9]+$/', $id)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid id']);
        exit;
    }
    $erDir = __DIR__ . '/data/escape-room';
    if (!is_dir($erDir)) mkdir($erDir, 0755, true);
    $path = $erDir . '/' . $id . '.json';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo file_exists($path) ? file_get_contents($path) : 'null';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdminKey(); // Escape-Room-Spiele schreibt nur der Editor
        $body = readJsonBody();
        atomicWrite($path, $body)
            ? print(json_encode(['ok' => true]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
    } elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        requireAdminKey();
        if (file_exists($path)) @unlink($path);
        echo json_encode(['ok' => true]);
    }
    exit;
}

// ── Leiterspiel Designer Board Library: ?f=ls-boards ────────────────
if ($key === 'ls-boards') {
    $dir = __DIR__ . '/data/leiterspiel-designer';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $libPath = $dir . '/boards.json';
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo file_exists($libPath) ? file_get_contents($libPath) : '[]';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdminKey(); // Designer-Bibliothek schreibt nur die Lehrkraft
        $body = readJsonBody();
        atomicWrite($libPath, $body)
            ? print(json_encode(['ok' => true]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
    }
    exit;
}

// ── Labyrinth Designer Maze Library: ?f=lab-mazes ────────────────
if ($key === 'lab-mazes') {
    $dir = __DIR__ . '/data/labyrinth-designer';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $libPath = $dir . '/mazes.json';
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo file_exists($libPath) ? file_get_contents($libPath) : '[]';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        requireAdminKey(); // Designer-Bibliothek schreibt nur die Lehrkraft
        $body = readJsonBody();
        atomicWrite($libPath, $body)
            ? print(json_encode(['ok' => true]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
    }
    exit;
}

// ── Drafts (Schüler-Vorschläge): ?f=drafts ───────────────────────
if ($key === 'drafts') {
    $draftsPath = __DIR__ . '/data/drafts.json';
    if (!is_dir(dirname($draftsPath))) @mkdir(dirname($draftsPath), 0755, true);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo file_exists($draftsPath) ? file_get_contents($draftsPath) : '[]';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = file_get_contents('php://input');
        // Flooding-Schutz: einzelner Vorschlag darf nicht riesig sein
        if (strlen($body) > 20000) {
            http_response_code(413); echo json_encode(['error' => 'too large']); exit;
        }
        $draft = json_decode($body, true);
        if (!is_array($draft)) {
            http_response_code(400); echo json_encode(['error' => 'invalid JSON']); exit;
        }
        // Whitelist + Normalisierung: nur bekannte Felder mit gültigen Typen übernehmen
        $str = fn($v, $max) => mb_substr(trim(is_string($v) ? $v : ''), 0, $max);
        $type = in_array($draft['type'] ?? '', ['mc', 'open'], true) ? $draft['type'] : 'open';
        $diff = (int)($draft['difficulty'] ?? 100);
        if (!in_array($diff, [100, 200, 300, 400, 500], true)) $diff = 100;
        $options = [];
        foreach (array_slice(is_array($draft['options'] ?? null) ? $draft['options'] : [], 0, 8) as $opt) {
            $options[] = $str($opt, 500);
        }
        $correctIndices = [];
        foreach (array_slice(is_array($draft['correctIndices'] ?? null) ? $draft['correctIndices'] : [], 0, 8) as $ci) {
            if (is_int($ci) || ctype_digit((string)$ci)) $correctIndices[] = (int)$ci;
        }
        $id = $str($draft['id'] ?? '', 64);
        if (!preg_match('/^[A-Za-z0-9_\-\.]{1,64}$/', $id)) $id = uniqid('draft-');
        $clean = [
            'id'                => $id,
            'submittedAt'       => date('c'),
            'submitter'         => $str($draft['submitter'] ?? '', 100) ?: null,
            'type'              => $type,
            'question'          => $str($draft['question'] ?? '', 2000),
            'answer'            => $str($draft['answer'] ?? '', 2000),
            'options'           => $options,
            'correctIndex'      => isset($draft['correctIndex']) && $draft['correctIndex'] !== null ? (int)$draft['correctIndex'] : null,
            'hint'              => $str($draft['hint'] ?? '', 1000),
            'suggestedCategory' => $str($draft['suggestedCategory'] ?? '', 200),
            'difficulty'        => $diff,
        ];
        if ($correctIndices) $clean['correctIndices'] = $correctIndices;

        $fp = fopen($draftsPath, 'c+');
        if (!$fp || !flock($fp, LOCK_EX)) {
            if ($fp) fclose($fp);
            http_response_code(500); echo json_encode(['error' => 'lock error']); exit;
        }
        $existing = json_decode(stream_get_contents($fp), true) ?: [];
        $existing[] = $clean;
        // Flooding-Schutz: maximal 500 Vorschläge, älteste fliegen raus
        if (count($existing) > 500) $existing = array_slice($existing, -500);
        ftruncate($fp, 0); rewind($fp);
        fwrite($fp, json_encode($existing, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fp); flock($fp, LOCK_UN); fclose($fp);
        echo json_encode(['ok' => true]);
    }
    exit;
}

// ── Single Draft: ?f=draft&id=X ──────────────────────────────────
if ($key === 'draft') {
    $draftsPath = __DIR__ . '/data/drafts.json';
    $draftId = trim($_GET['id'] ?? '');
    if ($_SERVER['REQUEST_METHOD'] === 'DELETE' && $draftId !== '') {
        requireAdminKey(); // Vorschläge löscht nur die Lehrkraft
        if (file_exists($draftsPath)) {
            $fp = fopen($draftsPath, 'c+');
            if ($fp && flock($fp, LOCK_EX)) {
                $drafts = json_decode(stream_get_contents($fp), true) ?: [];
                $drafts = array_values(array_filter($drafts, fn($d) => ($d['id'] ?? '') !== $draftId));
                ftruncate($fp, 0); rewind($fp);
                fwrite($fp, json_encode($drafts, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
                fflush($fp); flock($fp, LOCK_UN); fclose($fp);
            }
        }
        echo json_encode(['ok' => true]);
    } else {
        http_response_code(400); echo json_encode(['error' => 'invalid request']);
    }
    exit;
}

// ── Legacy-Endpunkte: ?f=questions / ?f=gamestate ─────────────────
if (!array_key_exists($key, $files)) {
    http_response_code(400);
    echo json_encode(['error' => 'unknown resource']);
    exit;
}

$path = $files[$key];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo file_exists($path) ? file_get_contents($path) : '{}';

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // questions/gamestate/jo-words schreibt nur die Lehrkraft. memory-pairs/
    // settings bleiben offen (Memory-Admin ist nicht Teil dieser Umbau-Runde).
    if ($key === 'questions' || $key === 'gamestate' || $key === 'jo-words') requireAdminKey();
    $body = readJsonBody();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    // Backup-Rotation vor Überschreiben, 3 Generationen — eine einzelne
    // .bak wäre nach zwei schlechten Saves ebenfalls überschrieben
    if (file_exists($path) && @filesize($path) > 30) {
        @copy($path . '.bak2', $path . '.bak3');
        @copy($path . '.bak',  $path . '.bak2');
        @copy($path, $path . '.bak');
    }
    atomicWrite($path, $body)
        ? print(json_encode(['ok' => true]))
        : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
}
