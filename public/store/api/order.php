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

function fail_request(string $message, int $status = 422): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

if (!is_array($payload)) {
    fail_request('Invalid JSON body.');
}

$customer = $payload['customer'] ?? null;
$items = $payload['items'] ?? null;
$payment = $payload['payment'] ?? null;
if (!is_array($customer) || !is_array($items) || count($items) < 1) {
    fail_request('Customer details and at least one item are required.');
}

$name = trim((string)($customer['name'] ?? ''));
$email = filter_var(trim((string)($customer['email'] ?? '')), FILTER_VALIDATE_EMAIL);
$phone = trim((string)($customer['phone'] ?? ''));
$location = trim((string)($customer['location'] ?? ''));
$note = trim((string)($customer['note'] ?? ''));
$consent = (bool)($customer['consent'] ?? false);
$paymentMethod = is_array($payment) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($payment['method'] ?? '')) : '';
$paymentLabel = is_array($payment) ? trim((string)($payment['label'] ?? '')) : '';

if ($name === '' || !$email || $phone === '' || $location === '' || !$consent) {
    fail_request('Please provide valid contact details, a delivery location, and adult consent.');
}
if (mb_strlen($name) > 120 || mb_strlen($phone) > 50 || mb_strlen($location) > 180 || mb_strlen($note) > 2000) {
    fail_request('One or more fields are too long.');
}
if ($paymentMethod === '' || $paymentLabel === '' || mb_strlen($paymentLabel) > 120) {
    fail_request('Please choose a payment method.');
}
$note = trim('[Payment method: ' . mb_substr($paymentLabel, 0, 120) . '] ' . $note);
$paymentUploadToken = bin2hex(random_bytes(32));

$cleanItems = [];
foreach ($items as $item) {
    if (!is_array($item)) {
        fail_request('Invalid order item.');
    }
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($item['id'] ?? ''));
    $itemName = trim((string)($item['name'] ?? ''));
    $quantity = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 99]]);
    if ($id === '' || $itemName === '' || $quantity === false) {
        fail_request('Invalid order item details.');
    }
    $cleanItems[] = [
        'id' => $id,
        'name' => mb_substr($itemName, 0, 180),
        'quantity' => $quantity,
        'price' => is_numeric($item['price'] ?? null) ? (float)$item['price'] : null,
        'currency' => mb_substr((string)($item['currency'] ?? ''), 0, 8),
    ];
}

try {
    $pdo = storefront_pdo();

    $pdo->beginTransaction();
    $statement = $pdo->prepare(
        'INSERT INTO ev_orders
         (customer_name, customer_email, customer_phone, delivery_location, customer_note,
          payment_method, payment_upload_token, consented_at, status, created_at)
         VALUES (:name, :email, :phone, :location, :note, :payment_method, :payment_upload_token,
                 UTC_TIMESTAMP(), :status, UTC_TIMESTAMP())'
    );
    $statement->execute([
        ':name' => $name,
        ':email' => $email,
        ':phone' => $phone,
        ':location' => $location,
        ':note' => $note,
        ':payment_method' => mb_substr($paymentLabel, 0, 100),
        ':payment_upload_token' => $paymentUploadToken,
        ':status' => 'new',
    ]);
    $orderId = (int)$pdo->lastInsertId();
    $itemStatement = $pdo->prepare(
        'INSERT INTO ev_order_items (order_id, product_id, product_name, quantity, listed_price, currency)
         VALUES (:order_id, :product_id, :product_name, :quantity, :listed_price, :currency)'
    );
    foreach ($cleanItems as $item) {
        $itemStatement->execute([
            ':order_id' => $orderId,
            ':product_id' => $item['id'],
            ':product_name' => $item['name'],
            ':quantity' => $item['quantity'],
            ':listed_price' => $item['price'],
            ':currency' => $item['currency'],
        ]);
    }
    $pdo->commit();
    echo json_encode([
        'ok' => true,
        'orderId' => $orderId,
        'paymentUploadToken' => $paymentUploadToken,
        'message' => 'Order request received. Upload your payment receipt on the next page.',
    ]);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('EV Explorer order error: ' . $error->getMessage());
    http_response_code($error instanceof RuntimeException ? 503 : 500);
    echo json_encode([
        'error' => $error instanceof RuntimeException
            ? $error->getMessage()
            : 'The order could not be saved. Check the database setup.'
    ]);
}