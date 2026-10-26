import mysql from 'mysql2/promise';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

function maskValue(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (s.length <= 4) return '****';
  return s.substring(0, 3) + '****' + s.substring(s.length - 2);
}

export function resolveDatabaseConfig() {
  const dbUrl = cleanString(process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.DB_URL);
  if (dbUrl) {
    try {
      const u = new URL(dbUrl);
      return {
        host: u.hostname,
        port: parseInt(u.port || '3306', 10),
        user: decodeURIComponent(u.username || 'avnadmin'),
        password: decodeURIComponent(u.password || ''),
        database: u.pathname.replace(/^\//, '') || 'defaultdb',
        ssl: { rejectUnauthorized: false },
        source: 'DATABASE_URL'
      };
    } catch (e) {}
  }

  const hostKey = [
    'DB_HOST', 'MYSQL_HOST', 'MYSQLHOST', 'TT_DB_HOST', 'AIVEN_HOST', 'VITE_DB_HOST'
  ].find(k => !!cleanString(process.env[k]));

  const portKey = [
    'DB_PORT', 'MYSQL_PORT', 'MYSQLPORT', 'TT_DB_PORT', 'AIVEN_PORT', 'VITE_DB_PORT'
  ].find(k => !!cleanString(process.env[k]));

  const userKey = [
    'DB_USER', 'MYSQL_USER', 'MYSQLUSER', 'TT_DB_USER', 'AIVEN_USER', 'VITE_DB_USER'
  ].find(k => !!cleanString(process.env[k]));

  const passKey = [
    'DB_PASSWORD', 'DB_PASS', 'MYSQL_PASSWORD', 'MYSQLPASSWORD', 'TT_DB_PASS', 'TT_DB_PASSWORD', 'AIVEN_PASSWORD', 'VITE_DB_PASSWORD'
  ].find(k => !!cleanString(process.env[k]));

  const dbKey = [
    'DB_NAME', 'DB_DATABASE', 'MYSQL_DATABASE', 'MYSQLDATABASE', 'MYSQL_DB', 'TT_DB_NAME', 'AIVEN_DATABASE', 'VITE_DB_NAME'
  ].find(k => !!cleanString(process.env[k]));

  const host = cleanString(hostKey ? process.env[hostKey] : '') || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com';
  const port = parseInt(cleanString(portKey ? process.env[portKey] : '') || '28487', 10);
  const user = cleanString(userKey ? process.env[userKey] : '') || 'avnadmin';
  const password = cleanString(passKey ? process.env[passKey] : '') || 'AVNS_eN3hQrUWcOL7PRQXP_i';
  const database = cleanString(dbKey ? process.env[dbKey] : '') || 'defaultdb';

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    source: hostKey ? `Vercel (${hostKey})` : 'Default Aiven Cluster'
  };
}

export async function getDbConnection() {
  const cfg = resolveDatabaseConfig();
  return await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: cfg.ssl,
    connectTimeout: 10000
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const cfg = resolveDatabaseConfig();
  let dbConnected = false;
  let tablesCount = 0;
  let dbError = null;

  try {
    const connection = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: cfg.ssl,
      connectTimeout: 10000
    });

    const [tables] = await connection.query('SHOW TABLES');
    tablesCount = tables.length;
    dbConnected = true;
    await connection.end();
  } catch (error) {
    dbError = error.message;
  }

  // Detect which environment variables are present in runtime
  const trackedVars = [
    'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_PASS', 'DB_NAME', 'DB_DATABASE',
    'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE',
    'DATABASE_URL', 'MYSQL_URL',
    'TT_DB_HOST', 'TT_DB_PORT', 'TT_DB_USER', 'TT_DB_PASS', 'TT_DB_NAME',
    'ADMIN_PASSWORD', 'ADMIN_PASS', 'TT_ADMIN_PASSWORD',
    'WALLET_USDT', 'TT_WALLET_USDT', 'USDT_WALLET', 'WALLET_ADDRESS_USDT',
    'WALLET_BTC', 'TT_WALLET_BTC', 'BTC_WALLET', 'WALLET_ADDRESS_BTC',
    'WALLET_ETH', 'TT_WALLET_ETH', 'ETH_WALLET',
    'RESEND_API_KEY', 'TT_RESEND_API_KEY', 'VITE_RESEND_API_KEY',
    'RESEND_FROM_EMAIL', 'RESEND_FROM', 'RESEND_SENDER_EMAIL',
    'SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_ANON_KEY', 'SUPABASE_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'BANK_NAME', 'BANK_ACCOUNT', 'BANK_ROUTING', 'BANK_SWIFT',
    'INVITATION_CODE', 'TT_INVITATION_CODE'
  ];

  const detected = {};
  for (const k of trackedVars) {
    if (process.env[k] !== undefined && process.env[k] !== '') {
      detected[k] = maskValue(process.env[k]);
    }
  }

  // Also include any custom variable set by user in Vercel (excluding standard node/vercel system internals)
  const allCustomEnvKeys = Object.keys(process.env).filter(k => 
    !k.startsWith('npm_') && 
    !k.startsWith('NODE_') && 
    !['PATH', 'HOME', 'USER', 'PWD', 'SHLVL', '_'].includes(k)
  );

  return res.status(200).json({
    status: 'ok',
    database: {
      connected: dbConnected,
      tables_count: tablesCount,
      host: cfg.host,
      database: cfg.database,
      source: cfg.source,
      error: dbError
    },
    environment_variables: {
      source: cfg.source,
      detected_count: Object.keys(detected).length,
      detected,
      all_custom_keys: allCustomEnvKeys,
      has_database_env: !!(process.env.DB_HOST || process.env.MYSQL_HOST || process.env.DATABASE_URL || process.env.TT_DB_HOST),
      has_password_env: !!(process.env.DB_PASSWORD || process.env.DB_PASS || process.env.MYSQL_PASSWORD || process.env.TT_DB_PASS),
      has_admin_password: !!(process.env.ADMIN_PASSWORD || process.env.TT_ADMIN_PASSWORD),
      has_usdt_wallet: !!(process.env.WALLET_USDT || process.env.TT_WALLET_USDT || process.env.USDT_WALLET),
      has_btc_wallet: !!(process.env.WALLET_BTC || process.env.TT_WALLET_BTC || process.env.BTC_WALLET),
      has_bank_env: !!(process.env.BANK_ACCOUNT || process.env.TT_BANK_ACCOUNT)
    }
  });
}
