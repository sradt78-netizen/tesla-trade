# Admin HTTP 500 fix

This delivery fixes the admin panel's PHP compatibility and makes database connection failures visible instead of returning a blank HTTP 500 response.

Use PHP 8.1 or newer in Hestia, with PDO MySQL and cURL enabled. Configure
TT_DB_HOST, TT_DB_NAME, TT_DB_USER, TT_DB_PASS, and TT_ADMIN_PASSWORD as
active `SetEnv` lines in the domain's `public_html/.htaccess` before signing
in. The admin page distinguishes missing `.htaccess` settings, a missing
PDO MySQL extension, and a MySQL credential/privilege rejection.
