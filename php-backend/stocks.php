<?php
// ── GET /api/stocks ───────────────────────────────────────────
// Standalone endpoint: no DB or auth credentials required.
// Works even if the database is not yet configured.

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Cache-Control: no-store, no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'GET')     { http_response_code(405); echo json_encode(['error'=>'GET required']); exit; }

// ── HTTP fetch helper (cURL first, stream fallback) ───────────
function stocks_fetch(string $url, int $timeoutSec = 7): ?string {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeoutSec,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; TeslaTradeInc/1.0)',
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        ]);
        $body   = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body !== false && $status >= 200 && $status < 300 && strlen((string)$body) > 20) {
            return (string)$body;
        }
    }
    $ctx  = stream_context_create(['http' => [
        'timeout'       => $timeoutSec,
        'ignore_errors' => false,
        'header'        => "User-Agent: Mozilla/5.0 (compatible; TeslaTradeInc/1.0)\r\nAccept: application/json\r\n",
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    return ($body !== false && strlen((string)$body) > 20) ? (string)$body : null;
}

// ── Try live Yahoo Finance TSLA quote ─────────────────────────
$tslaSharesOutstanding = 3215000000.0;
$tsla = null;

$raw = stocks_fetch('https://query1.finance.yahoo.com/v8/finance/chart/TSLA?interval=1d&range=2d');
if (!$raw) {
    $raw = stocks_fetch('https://query2.finance.yahoo.com/v8/finance/chart/TSLA?interval=1d&range=2d');
}
if ($raw) {
    $yf   = json_decode($raw, true);
    $meta = $yf['chart']['result'][0]['meta'] ?? null;
    if ($meta) {
        $price   = (float)($meta['regularMarketPrice']                                      ?? 0);
        $prev    = (float)($meta['chartPreviousClose'] ?? $meta['regularMarketPreviousClose'] ?? $price);
        $high    = (float)($meta['regularMarketDayHigh']  ?? $price);
        $low     = (float)($meta['regularMarketDayLow']   ?? $price);
        $open    = (float)($meta['regularMarketOpen']     ?? $prev);
        $change  = round($price - $prev, 2);
        $chgPct  = $prev > 0 ? round($change / $prev * 100, 2) : 0;
        $quoteAt = !empty($meta['regularMarketTime'])
            ? gmdate('c', (int)$meta['regularMarketTime'])
            : date('c');
        if ($price > 0) $tsla = [
            'symbol'            => 'TSLA',
            'name'              => 'Tesla, Inc.',
            'exchange'          => 'NASDAQ',
            'price'             => round($price, 2),
            'change'            => $change,
            'changePct'         => $chgPct,
            'high'              => round($high, 2),
            'low'               => round($low, 2),
            'open'              => round($open, 2),
            'prevClose'         => round($prev, 2),
            'live'              => true,
            'private'           => false,
            'marketCap'         => round($price * $tslaSharesOutstanding, 2),
            'sharesOutstanding' => $tslaSharesOutstanding,
            'marketCapLive'     => true,
            'marketCapSource'   => 'Live NASDAQ price × latest reported shares outstanding',
            'marketCapAsOf'     => $quoteAt,
        ];
    }
}

// ── Simulated fallback (no network dependency) ────────────────
if (!$tsla) {
    $slot  = (int)(time() / 300);
    mt_srand($slot * 7);
    $base  = 248.50;
    $price = round($base + (mt_rand(-800, 800) / 100), 2);
    mt_srand($slot * 7 - 1);
    $prev  = round($base + (mt_rand(-600, 600) / 100), 2);
    $chg   = round($price - $prev, 2);
    $tsla  = [
        'symbol'            => 'TSLA',
        'name'              => 'Tesla, Inc.',
        'exchange'          => 'NASDAQ',
        'price'             => $price,
        'change'            => $chg,
        'changePct'         => $prev > 0 ? round($chg / $prev * 100, 2) : 0,
        'high'              => round($price + mt_rand(30, 150) / 100, 2),
        'low'               => round($price - mt_rand(30, 150) / 100, 2),
        'open'              => $prev,
        'prevClose'         => $prev,
        'live'              => false,
        'private'           => false,
        'marketCap'         => round($price * $tslaSharesOutstanding, 2),
        'sharesOutstanding' => $tslaSharesOutstanding,
        'marketCapLive'     => false,
        'marketCapSource'   => 'Estimated price × latest reported shares outstanding',
        'marketCapAsOf'     => date('c'),
    ];
}

// ── Simulated private-company watchlist stocks ─────────────────
function sim_stock(string $sym, string $name, float $base, int $salt): array {
    $slot  = (int)(time() / 300);
    mt_srand($slot * 13 + $salt);
    $noise = $base * 0.018;
    $price = round($base + (mt_rand((int)(-$noise * 100), (int)($noise * 100)) / 100), 2);
    mt_srand(($slot - 1) * 13 + $salt);
    $prev  = round($base + (mt_rand((int)(-$noise * 100), (int)($noise * 100)) / 100), 2);
    $chg   = round($price - $prev, 2);
    mt_srand($slot * 13 + $salt + 99);
    $spread = max(0.05, round($base * 0.008, 2));
    return [
        'symbol'    => $sym,
        'name'      => $name,
        'exchange'  => 'Private',
        'price'     => $price,
        'change'    => $chg,
        'changePct' => $prev > 0 ? round($chg / $prev * 100, 2) : 0,
        'high'      => round($price + $spread + mt_rand(0, (int)($spread * 100)) / 100, 2),
        'low'       => round($price - $spread, 2),
        'open'      => $prev,
        'prevClose' => $prev,
        'live'      => false,
        'private'   => true,
    ];
}

echo json_encode([
    'stocks' => [
        $tsla,
        sim_stock('SPACEX', 'Space Exploration Technologies Corp.', 185.40, 11),
        sim_stock('X',      'X Corp.',                              54.20,  22),
        sim_stock('XAI',    'xAI Corp. (Grok)',                     48.75,  33),
        sim_stock('NEURA',  'Neuralink Corporation',                22.10,  44),
        sim_stock('TBC',    'The Boring Company',                   12.80,  55),
    ],
    'updatedAt'  => date('c'),
    'nextUpdate' => (int)(ceil(time() / 300) * 300 - time()),
]);
