import { getDbConnection } from './dbcheck.js';

function cleanString(value) {
  return value == null ? '' : String(value).trim();
}

function environmentSettings() {
  return {
    usdt: cleanString(process.env.WALLET_USDT || process.env.TT_WALLET_USDT || process.env.USDT_WALLET || process.env.WALLET_ADDRESS_USDT || process.env.USDT_ADDRESS),
    eth: cleanString(process.env.WALLET_ETH || process.env.TT_WALLET_ETH || process.env.ETH_WALLET || process.env.WALLET_ADDRESS_ETH || process.env.ETH_ADDRESS),
    btc: cleanString(process.env.WALLET_BTC || process.env.TT_WALLET_BTC || process.env.BTC_WALLET || process.env.WALLET_ADDRESS_BTC || process.env.BTC_ADDRESS),
    bankName: cleanString(process.env.BANK_NAME || process.env.TT_BANK_NAME),
    bankAccount: cleanString(process.env.BANK_ACCOUNT || process.env.TT_BANK_ACCOUNT || process.env.BANK_NUMBER),
    bankRouting: cleanString(process.env.BANK_ROUTING || process.env.TT_BANK_ROUTING || process.env.ROUTING_NUMBER),
    bankSwift: cleanString(process.env.BANK_SWIFT || process.env.TT_BANK_SWIFT || process.env.SWIFT_CODE)
  };
}

async function loadAdminPaymentSettings(strictDatabase) {
  const settings = environmentSettings();
  let dbSettingsAvailable = false;
  let conn = null;
  try {
    conn = await getDbConnection();
    const [columns] = await conn.query('SHOW COLUMNS FROM app_settings');
    const names = new Set((columns || []).map(row => String(row.Field || '').toLowerCase()));
    const keyColumn = names.has('key_name') ? 'key_name' : (names.has('key') ? 'key' : '');
    const valueColumn = names.has('value_data') ? 'value_data' : (names.has('value') ? 'value' : '');
    if (!keyColumn || !valueColumn) throw new Error('The app_settings key/value columns are unavailable.');

    const keys = ['wallet_usdt', 'wallet_eth', 'wallet_btc', 'bank_name', 'bank_account', 'bank_routing', 'bank_swift'];
    const sql = 'SELECT `' + keyColumn + '` AS setting_key, `' + valueColumn + '` AS setting_value FROM app_settings WHERE `' + keyColumn + '` IN (' + keys.map(() => '?').join(',') + ')';
    const [rows] = await conn.query(sql, keys);
    const saved = {};
    for (const row of rows || []) saved[String(row.setting_key || '')] = cleanString(row.setting_value);

    const map = {
      wallet_usdt: 'usdt',
      wallet_eth: 'eth',
      wallet_btc: 'btc',
      bank_name: 'bankName',
      bank_account: 'bankAccount',
      bank_routing: 'bankRouting',
      bank_swift: 'bankSwift'
    };
    for (const [savedKey, settingKey] of Object.entries(map)) {
      // A saved blank value is an intentional Admin disable and must override
      // any stale environment fallback for that payment method.
      if (Object.prototype.hasOwnProperty.call(saved, savedKey)) settings[settingKey] = saved[savedKey];
    }
    dbSettingsAvailable = true;
  } catch (error) {
    if (strictDatabase) throw error;
    console.error('[payment-settings] could not read Admin settings:', error?.code || error?.message || error);
  } finally {
    if (conn) { try { await conn.end(); } catch (closeError) {} }
  }
  return { settings, dbSettingsAvailable };
}

function buildPaymentMethods(settings) {
  return {
    usdt: { network: 'TRC-20', address: settings.usdt, label: 'USDT (TRC-20)', enabled: !!settings.usdt },
    btc: { network: 'Bitcoin', address: settings.btc, label: 'Bitcoin (BTC)', enabled: !!settings.btc },
    eth: { network: 'ERC-20', address: settings.eth, label: 'Ethereum (ETH)', enabled: !!settings.eth },
    bank: {
      name: settings.bankName,
      account: settings.bankAccount,
      routing: settings.bankRouting,
      swift: settings.bankSwift,
      label: 'Bank Transfer',
      enabled: !!(settings.bankName && settings.bankAccount)
    }
  };
}

export async function getActivePaymentMethodKeys() {
  const { settings } = await loadAdminPaymentSettings(true);
  const methods = buildPaymentMethods(settings);
  return Object.keys(methods).filter(key => methods[key].enabled);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { settings, dbSettingsAvailable } = await loadAdminPaymentSettings(false);
  const methods = buildPaymentMethods(settings);
  const allowedMethods = Object.keys(methods).filter(key => methods[key].enabled);

  return res.status(200).json({ ...methods, allowedMethods, dbSettingsAvailable });
}
