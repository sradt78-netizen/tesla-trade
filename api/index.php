<?php
// Route API requests to PHP backend if PHP runtime is used on Apache / cPanel
if (file_exists(__DIR__ . '/../php-backend/index.php')) {
    require_once __DIR__ . '/../php-backend/index.php';
} else {
    header('Content-Type: application/json');
    http_response_code(404);
    echo json_encode(['error' => 'API backend not found']);
}
