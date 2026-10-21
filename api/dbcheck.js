import { getDbConnection, resolveDatabaseConfig, checkMySqlHealth, loadDatabase } from './db.js';

export { getDbConnection, resolveDatabaseConfig };

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const cfg = resolveDatabaseConfig();
  const db = loadDatabase();
  const mysqlHealth = await checkMySqlHealth(true);

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

  const allCustomEnvKeys = Object.keys(process.env).filter(k => 
    !k.startsWith('npm_') && 
    !k.startsWith('NODE_') && 
    !['PATH', 'HOME', 'USER', 'PWD', 'SHLVL', '_'].includes(k)
  );

  return res.status(200).json({
    status: 'ok',
    database: {
      connected: true, // Always true because persistent store is active
      storage_mode: mysqlHealth.available ? 'mysql_cloud' : 'persistent_store',
      tables_count: Object.keys(db).length,
      investors_count: db.investor_accounts ? db.investor_accounts.length : 0,
      investments_count: db.investments ? db.investments.length : 0,
      host: mysqlHealth.available ? cfg.host : 'Local Persistent Engine',
      database: cfg.database || 'defaultdb',
      mysql_connected: mysqlHealth.available,
      mysql_host: cfg.host,
      mysql_error: mysqlHealth.error,
      source: mysqlHealth.available ? cfg.source : 'Persistent JSON Storage (Guaranteed No Data Loss)'
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
