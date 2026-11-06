import { getDbConnection } from './dbcheck.js';

function cleanString(value) {
  return value == null ? '' : String(value).trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const settings = {
    usdt: cleanString(process.env.WALLET_USDT || process.env.TT_WALLET_USDT || process.env.USDT_WALLET || process.env.WALLET_ADDRESS_USDT || process.env.USDT_ADDRESS),
    eth: cleanString(process.env.WALLET_ETH || process.env.TT_WALLET_ETH || process.env.ETH_WALLET || process.env.WALLET_ADDRESS_ETH || process.env.ETH_ADDRESS),
    btc: cleanString(process.env.WALLET_BTC || process.env.TT_WALLET_BTC || process.env.BTC_WALLET || process.env.WALLET_ADDRESS_BTC || process.env.BTC_ADDRESS),
    bankName: cleanString(process.env.BANK_NAME || process.env.TT_BANK_NAME),
    bankAccount: cleanString(process.env.BANK_ACCOUNT || process.env.TT_BANK_ACCOUNT || process.env.BANK_NUMBER),
    bankRouting: cleanString(process.env.BANK_ROUTING || process.env.TT_BANK_ROUTING || process.env.ROUTING_NUMBER),
    bankSwift: cleanString(process.env.BANK_SWIFT || process.env.TT_BANK_SWIFT || process.env.SWIFT_CODE)
  };

  let dbAvailable = false;
  try {
    const conn = await getDbConnection();
    const [rows] = await conn.query("SELECT `key`, `value` FROM app_settings WHERE `key` IN ('wallet_usdt','wallet_eth','wallet_btc','bank_name','bank_account','bank_routing','bank_swift')");
    await conn.end();
    dbAvailable = true;
    for (const row of rows) {
      const map = { wallet_usdt: 'usdt', wallet_eth: 'eth', wallet_btc: 'btc', bank_name: 'bankName', bank_account: 'bankAccount', bank_routing: 'bankRouting', bank_swift: 'bankSwift' };
      const key = map[row.key];
      if (key && !settings[key]) settings[key] = cleanString(row.value);
    }
  } catch (error) {
    // Environment configuration remains readable if the optional settings table is unavailable.
  }

  return res.status(200).json({
    usdt: { network: 'TRC-20', address: settings.usdt, label: 'Tether (USDT TRC-20)', enabled: !!settings.usdt },
    eth: { network: 'ERC-20', address: settings.eth, label: 'Ethereum (ETH)', enabled: !!settings.eth },
    btc: { network: 'Bitcoin', address: settings.btc, label: 'Bitcoin (BTC)', enabled: !!settings.btc },
    bank: { name: settings.bankName, account: settings.bankAccount, routing: settings.bankRouting, swift: settings.bankSwift, label: 'Bank Transfer', enabled: !!(settings.bankName && settings.bankAccount) },
    allowedMethods: ['crypto', 'usdt', 'eth', 'btc', 'bank', 'bank_transfer'],
    dbSettingsAvailable: dbAvailable
  });
}
