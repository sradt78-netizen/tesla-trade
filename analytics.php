<?php
require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/db.php';
tt_start_session();

// If accessed as PHP, output analytics.html directly
$htmlPath = __DIR__ . '/analytics.html';
if (file_exists($htmlPath)) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($htmlPath);
    exit;
}
?>
