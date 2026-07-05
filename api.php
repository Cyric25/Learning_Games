<?php
// api.php – JSON-Storage für Risiko-Quiz auf PHP-Webhostings (z.B. All-Inkl.com)
// Aufruf: api.php?f=questions  oder  api.php?f=gamestate
//         api.php?f=games          (Registry aller Spiele)
//         api.php?f=game&code=XXXX (Spielstand pro Spiel)
//         api.php?f=sse&code=XXXX  (Server-Sent Events Stream)
// Weitere Spiele nutzen dieselben Endpunkte mit Prefix (ls-, bs-, qp-, labyrinth-).

$key = trim($_GET['f'] ?? '', '/');

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
            $sig = @filemtime($path) . ':' . @filesize($path) . ':' . @md5_file($path);
            if ($sig !== $lastSig) {
                $lastSig = $sig;
                $data = @file_get_contents($path);
                if ($data !== false && $data !== '') {
                    echo "data: " . $data . "\n\n";
                    @flush();
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

// ── Cleanup: Spiele älter als 24h löschen ─────────────────────────
function cleanupExpiredGames($gamesDir) {
    $registryPath = $gamesDir . '/index.json';
    if (!file_exists($registryPath)) return;

    $fp = fopen($registryPath, 'c+');
    if (!$fp || !flock($fp, LOCK_EX)) { if ($fp) fclose($fp); return; }

    $content = stream_get_contents($fp);
    $registry = json_decode($content, true) ?: [];
    $changed = false;
    $now = time();
    $maxAge = 24 * 60 * 60; // 24 Stunden

    foreach ($registry as $code => $info) {
        $timestamp = $info['updatedAt'] ?? $info['createdAt'] ?? null;
        if (!$timestamp) continue;
        $age = $now - strtotime($timestamp);
        if ($age > $maxAge) {
            $gamePath = $gamesDir . '/' . $code . '.json';
            if (file_exists($gamePath)) @unlink($gamePath);
            @unlink($gamePath . '.lock'); // CAS-Lockdatei mit aufräumen
            unset($registry[$code]);
            $changed = true;
        }
    }

    if ($changed) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($registry, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fp);
    }
    flock($fp, LOCK_UN);
    fclose($fp);
}

function updateRegistryEntry($gamesDir, $code, $body, $defaultTitle) {
    $registryPath = $gamesDir . '/index.json';
    $retries = 3;
    while ($retries-- > 0) {
        $fp = fopen($registryPath, 'c+');
        if (!$fp) break;
        if (flock($fp, LOCK_EX)) {
            $registry = json_decode(stream_get_contents($fp), true) ?: [];
            $gameData = json_decode($body, true);
            $registry[$code] = [
                'title'     => $gameData['meta']['title'] ?? $defaultTitle,
                'status'    => $gameData['phase'] ?? 'setup',
                'createdAt' => $gameData['meta']['createdAt'] ?? date('c'),
                'updatedAt' => date('c'),
            ];
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($registry, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
            break;
        }
        fclose($fp);
        usleep(50000);
    }
}

function removeRegistryEntry($gamesDir, $code) {
    $registryPath = $gamesDir . '/index.json';
    if (!file_exists($registryPath)) return;
    $fp = fopen($registryPath, 'c+');
    if ($fp && flock($fp, LOCK_EX)) {
        $registry = json_decode(stream_get_contents($fp), true) ?: [];
        unset($registry[$code]);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($registry, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
    } elseif ($fp) {
        fclose($fp);
    }
}

// Registry-Endpunkt (?f=…-games): GET mit Cleanup, POST kompletter Snapshot
function registryEndpoint($gamesDir) {
    if (!is_dir($gamesDir)) mkdir($gamesDir, 0755, true);
    $registryPath = $gamesDir . '/index.json';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        cleanupExpiredGames($gamesDir);
        echo file_exists($registryPath) ? file_get_contents($registryPath) : '{}';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = readJsonBody();
        atomicWrite($registryPath, $body)
            ? print(json_encode(['ok' => true]))
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

        // Compare-and-Swap unter Lock: lesen → prüfen → schreiben ist atomar
        $lock = fopen($path . '.lock', 'c');
        if ($lock) flock($lock, LOCK_EX);

        $storedRev = 0;
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

        $incoming['_rev'] = $storedRev + 1;
        $out = json_encode($incoming, JSON_UNESCAPED_UNICODE);
        $ok = atomicWrite($path, $out);
        if ($lock) { flock($lock, LOCK_UN); fclose($lock); }

        if ($ok) updateRegistryEntry($gamesDir, $code, $out, $defaultTitle);
        $ok ? print(json_encode(['ok' => true, 'rev' => $incoming['_rev']]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
    } elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        if (file_exists($path)) @unlink($path);
        @unlink($path . '.lock');
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
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

// Statische Dateien (Legacy + Questions)
$files = [
    'questions'    => __DIR__ . '/data/questions.json',
    'gamestate'    => __DIR__ . '/data/risiko-gamestate.json',
    'memory-pairs'     => __DIR__ . '/data/memory/pairs.json',
    'settings'     => __DIR__ . '/data/settings.json',
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
        $body = readJsonBody();
        atomicWrite($path, $body)
            ? print(json_encode(['ok' => true]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
    } elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
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
    $body = readJsonBody();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    // Backup-Rotation vor Überschreiben (Schutz gegen versehentliches Leeren)
    if (file_exists($path) && @filesize($path) > 30) {
        @copy($path, $path . '.bak');
    }
    atomicWrite($path, $body)
        ? print(json_encode(['ok' => true]))
        : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
}
