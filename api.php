<?php
// api.php – JSON-Storage für Risiko-Quiz auf PHP-Webhostings (z.B. All-Inkl.com)
// Aufruf: api.php?f=questions  oder  api.php?f=gamestate
//         api.php?f=games          (Registry aller Spiele)
//         api.php?f=game&code=XXXX (Spielstand pro Spiel)
//         api.php?f=sse&code=XXXX  (Server-Sent Events Stream)

$key = trim($_GET['f'] ?? '', '/');

// ── SSE-Endpunkt (eigene Header, kein JSON) ──────────────────────
if ($key === 'sse') {
    $code = strtoupper(trim($_GET['code'] ?? ''));
    if (!preg_match('/^[A-Z0-9]{4,6}$/', $code)) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'invalid code']);
        exit;
    }
    $path = __DIR__ . '/risiko-quiz/data/games/' . $code . '.json';

    // SSE-Header
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('Access-Control-Allow-Origin: *');
    header('X-Accel-Buffering: no'); // nginx

    // Disable output buffering
    @ini_set('output_buffering', 'off');
    @ini_set('zlib.output_compression', false);
    while (ob_get_level()) ob_end_flush();

    $lastMtime = 0;
    $start = time();
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
            $mtime = filemtime($path);
            if ($mtime > $lastMtime) {
                $lastMtime = $mtime;
                $data = file_get_contents($path);
                echo "data: " . $data . "\n\n";
                @flush();
            }
        }

        usleep(300000); // 300ms
    }
    exit;
}

// ── Standard JSON-API ─────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$gamesDir = __DIR__ . '/risiko-quiz/data/games';

// Statische Dateien (Legacy + Questions)
$files = [
    'questions' => __DIR__ . '/risiko-quiz/data/questions.json',
    'gamestate' => __DIR__ . '/risiko-quiz/data/gamestate.json',
];

// ── Cleanup: Spiele älter als 24h löschen ───────────────────────────
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
            // Spieldatei löschen
            $gamePath = $gamesDir . '/' . $code . '.json';
            if (file_exists($gamePath)) @unlink($gamePath);
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

// ── Registry: ?f=games ────────────────────────────────────────────
if ($key === 'games') {
    if (!is_dir($gamesDir)) mkdir($gamesDir, 0755, true);
    $registryPath = $gamesDir . '/index.json';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // Cleanup abgelaufener Spiele bei jedem Registry-Abruf
        cleanupExpiredGames($gamesDir);
        echo file_exists($registryPath) ? file_get_contents($registryPath) : '{}';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = file_get_contents('php://input');
        if (json_decode($body) === null && json_last_error() !== JSON_ERROR_NONE) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid JSON']);
            exit;
        }
        file_put_contents($registryPath, $body, LOCK_EX) !== false
            ? print(json_encode(['ok' => true]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
    }
    exit;
}

// ── Per-Game: ?f=game&code=XXXX ───────────────────────────────────
if ($key === 'game') {
    $code = strtoupper(trim($_GET['code'] ?? ''));
    if (!preg_match('/^[A-Z0-9]{4,6}$/', $code)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid code']);
        exit;
    }
    if (!is_dir($gamesDir)) mkdir($gamesDir, 0755, true);
    $path = $gamesDir . '/' . $code . '.json';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo file_exists($path) ? file_get_contents($path) : '{}';

    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = file_get_contents('php://input');
        if (json_decode($body) === null && json_last_error() !== JSON_ERROR_NONE) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid JSON']);
            exit;
        }
        // Save game state
        $ok = file_put_contents($path, $body, LOCK_EX) !== false;

        // Update registry entry
        if ($ok) {
            $registryPath = $gamesDir . '/index.json';
            $retries = 3;
            while ($retries-- > 0) {
                $fp = fopen($registryPath, 'c+');
                if (!$fp) break;
                if (flock($fp, LOCK_EX)) {
                    $content = stream_get_contents($fp);
                    $registry = json_decode($content, true) ?: [];
                    $gameData = json_decode($body, true);
                    $registry[$code] = [
                        'title'     => $gameData['meta']['title'] ?? 'Spiel ' . $code,
                        'status'    => $gameData['status'] ?? 'setup',
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

        $ok ? print(json_encode(['ok' => true]))
            : (http_response_code(500) && print(json_encode(['error' => 'write error'])));

    } elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        // Delete game file
        if (file_exists($path)) @unlink($path);

        // Remove from registry
        $registryPath = $gamesDir . '/index.json';
        if (file_exists($registryPath)) {
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
            }
        }
        echo json_encode(['ok' => true]);
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
    $body = file_get_contents('php://input');
    if (json_decode($body) === null && json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid JSON']);
        exit;
    }
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($path, $body) !== false
        ? print(json_encode(['ok' => true]))
        : (http_response_code(500) && print(json_encode(['error' => 'write error'])));
}
