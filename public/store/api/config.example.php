<?php
declare(strict_types=1);

/*
 * Copy this file to config.php on your cPanel host and replace the values.
 * Keep config.php outside the public web root when your host allows it.
 * Never commit real database credentials.
 */

return [
    'dsn' => 'mysql:host=localhost;dbname=YOUR_DATABASE;charset=utf8mb4',
    'username' => 'YOUR_DATABASE_USER',
    'password' => 'YOUR_DATABASE_PASSWORD',
    'admin_email' => 'orders@example.com',
];