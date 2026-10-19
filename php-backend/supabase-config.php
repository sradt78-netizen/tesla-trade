<?php
// Supabase's URL and anon key are public client configuration, but keeping
// them server-loaded avoids hard-coding environment-specific values in HTML.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$url = trim((string)(getenv('SUPABASE_URL') ?: ($_ENV['SUPABASE_URL'] ?? '')));
$anonKey = trim((string)(getenv('SUPABASE_ANON_KEY') ?: ($_ENV['SUPABASE_ANON_KEY'] ?? '')));

if ($url === '' || $anonKey === '') {
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'error' => 'Supabase is not configured on this server.'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'url' => $url,
    'anonKey' => $anonKey
]);