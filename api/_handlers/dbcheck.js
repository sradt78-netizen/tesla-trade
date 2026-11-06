import { getDbConnection, checkMySqlHealth, resolveDatabaseConfig } from '../db.js';

// api/index.js imports this compatibility export for invitation validation.
export { getDbConnection, resolveDatabaseConfig };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed.' });
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Use the exact same resolver and health probe used by authentication and
  // every other API handler. Never default a failed connection to "connected".
  const cfg = resolveDatabaseConfig();
  let health;
  try {
    health = await checkMySqlHealth(true);
  } catch (error) {
    console.error('[dbcheck] health probe failed:', error?.message || error);
    health = { available: false, error: error?.message || 'Health probe failed.' };
  }

  const present = (names) => names.some((name) => Boolean(process.env[name]));
  const env = {
    has_database_url: present(['DATABASE_URL', 'MYSQL_URL', 'DB_URL']),
    has_host: present(['DB_HOST', 'MYSQL_HOST', 'MYSQLHOST', 'TT_DB_HOST', 'AIVEN_HOST', 'VITE_DB_HOST']),
    has_port: present(['DB_PORT', 'MYSQL_PORT', 'MYSQLPORT', 'TT_DB_PORT', 'AIVEN_PORT', 'VITE_DB_PORT']),
    has_user: present(['DB_USER', 'MYSQL_USER', 'MYSQLUSER', 'TT_DB_USER', 'AIVEN_USER', 'VITE_DB_USER']),
    has_password: present(['DB_PASSWORD', 'DB_PASS', 'MYSQL_PASSWORD', 'MYSQLPASSWORD', 'TT_DB_PASS', 'TT_DB_PASSWORD', 'AIVEN_PASSWORD', 'VITE_DB_PASSWORD']),
    has_database_name: present(['DB_NAME', 'DB_DATABASE', 'MYSQL_DATABASE', 'MYSQLDATABASE', 'MYSQL_DB', 'TT_DB_NAME', 'AIVEN_DATABASE', 'VITE_DB_NAME']),
    has_admin_password: present(['ADMIN_PASSWORD', 'ADMIN_PASS', 'TT_ADMIN_PASSWORD']),
    has_resend_key: present(['RESEND_API_KEY', 'TT_RESEND_API_KEY']),
    has_telegram_token: present(['TELEGRAM_BOT_TOKEN', 'TT_TELEGRAM_BOT_TOKEN'])
  };

  const connected = health?.available === true;
  const rawError = health?.error || null;
  const errorCode = rawError && typeof rawError === 'object' ? rawError.code || null : null;

  // Optional, read-only schema check for the social registration queries.
  // Invoke with /api/dbcheck?check=auth; this checks table/column availability
  // without creating test users or changing investor data.
  let authentication_schema = null;
  if (connected && requestUrl.searchParams.get('check') === 'auth') {
    let conn = null;
    try {
      conn = await getDbConnection();
      const inspectColumns = async (table) => {
        const [rows] = await conn.query('SHOW COLUMNS FROM `' + table + '`');
        return rows.map((row) => String(row.Field || '').toLowerCase()).filter(Boolean);
      };
      const accountColumns = await inspectColumns('investor_accounts');
      const investmentColumns = await inspectColumns('investments');
      const accountRequired = ['email', 'name', 'onboarding_status'];
      const investmentRequired = ['user_email', 'status'];
      const accountMissing = accountRequired.filter((column) => !accountColumns.includes(column));
      const investmentMissing = investmentRequired.filter((column) => !investmentColumns.includes(column));
      authentication_schema = {
        ok: accountMissing.length === 0 && investmentMissing.length === 0,
        investor_accounts: { present: true, missing_required_columns: accountMissing },
        investments: { present: true, missing_required_columns: investmentMissing }
      };
    } catch (error) {
      const code = String(error?.code || error?.errno || 'DB_ERROR')
        .replace(/[^A-Z0-9_]/gi, '')
        .slice(0, 40);
      authentication_schema = { ok: false, error_code: code };
      console.error('[dbcheck] authentication schema inspection failed:', code, error?.message || error);
    } finally {
      if (conn) {
        try { await conn.end(); } catch (closeError) {}
      }
    }
  }

  return res.status(200).json({
    status: connected ? 'ok' : 'degraded',
    ...(authentication_schema ? { authentication_schema } : {}),
    database: {
      connected,
      tables_count: connected ? Number(health.tablesCount || 0) : null,
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      source: cfg.source,
      error_code: errorCode,
      error: connected ? null : (typeof rawError === 'string' ? rawError : 'Database health check failed.')
    },
    environment_variables: env
  });
}
