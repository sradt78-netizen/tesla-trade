<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST requests only']);
    exit;
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);

function fail_finance(string $message, int $status = 422): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

if (!is_array($payload)) {
    fail_finance('Invalid JSON body.');
}

$name = trim((string)($payload['name'] ?? ''));
$email = filter_var(trim((string)($payload['email'] ?? '')), FILTER_VALIDATE_EMAIL);
$phone = trim((string)($payload['phone'] ?? ''));
$model = trim((string)($payload['model'] ?? ''));
$vehiclePrice = is_numeric($payload['vehiclePrice'] ?? null) ? (float)$payload['vehiclePrice'] : 0;
$downPayment = is_numeric($payload['downPayment'] ?? null) ? (float)$payload['downPayment'] : 0;
$termMonths = filter_var($payload['termMonths'] ?? null, FILTER_VALIDATE_INT);
$apr = is_numeric($payload['apr'] ?? null) ? (float)$payload['apr'] : 0;
$estimatedMonthly = is_numeric($payload['estimatedMonthly'] ?? null) ? (float)$payload['estimatedMonthly'] : 0;
$consent = (bool)($payload['consent'] ?? false);

if ($name === '' || !$email || $phone === '' || $model === '' || !$consent) {
    fail_finance('Please provide valid contact details, a product, and adult consent.');
}
if ($vehiclePrice < 0 || $downPayment < 0 || $downPayment > $vehiclePrice || $termMonths < 12 || $termMonths > 84 || $apr < 0 || $apr > 100) {
    fail_finance('The finance inputs are outside the allowed range.');
}

try {
    $pdo = storefront_pdo();
    $statement = $pdo->prepare(
        'INSERT INTO ev_finance_inquiries
         (customer_name, customer_email, customer_phone, product_name, vehicle_price, down_payment, term_months, apr, estimated_monthly, consented_at, status, created_at)
         VALUES (:name, :email, :phone, :product, :price, :down, :term, :apr, :monthly, UTC_TIMESTAMP(), :status, UTC_TIMESTAMP())'
    );
    $statement->execute([
        ':name' => $name,
        ':email' => $email,
        ':phone' => $phone,
        ':product' => mb_substr($model, 0, 180),
        ':price' => $vehiclePrice,
        ':down' => $downPayment,
        ':term' => $termMonths,
        ':apr' => $apr,
        ':monthly' => $estimatedMonthly,
        ':status' => 'new',
    ]);
    echo json_encode(['ok' => true, 'message' => 'Finance inquiry received. Your distributor team will follow up with approved terms.']);
} catch (Throwable $error) {
    error_log('EV Explorer finance error: ' . $error->getMessage());
    http_response_code($error instanceof RuntimeException ? 503 : 500);
    echo json_encode([
        'error' => $error instanceof RuntimeException
            ? $error->getMessage()
            : 'The finance inquiry could not be saved. Check the database setup.'
    ]);
}