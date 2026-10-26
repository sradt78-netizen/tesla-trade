import { getDbConnection } from './dbcheck.js';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // 1. Read from Environment Variables first (supporting multiple aliases)
  let usdt = cleanString(
    process.env.WALLET_USDT || process.env.TT_WALLET_USDT ||
    process.env.USDT_WALLET || process.env.WALLET_ADDRESS_USDT ||
    process.env.USDT_ADDRESS || process.env.VITE_WALLET_USDT
  );
  let eth = cleanString(
    process.env.WALLET_ETH || process.env.TT_WALLET_ETH ||
    process.env.ETH_WALLET || process.env.WALLET_ADDRESS_ETH ||
    process.env.ETH_ADDRESS || process.env.VITE_WALLET_ETH
  );
  let btc = cleanString(
    process.env.WALLET_BTC || process.env.TT_WALLET_BTC ||
    process.env.BTC_WALLET || process.env.WALLET_ADDRESS_BTC ||
    process.env.BTC_ADDRESS || process.env.VITE_WALLET_BTC
  );
  let bankName = cleanString(
    process.env.BANK_NAME || process.env.TT_BANK_NAME ||
    process.env.VITE_BANK_NAME
  );
  let bankAccount = cleanString(
    process.env.BANK_ACCOUNT || process.env.TT_BANK_ACCOUNT ||
    process.env.BANK_NUMBER || process.env.VITE_BANK_ACCOUNT
  );
  let bankRouting = cleanString(
    process.env.BANK_ROUTING || process.env.TT_BANK_ROUTING ||
    process.env.ROUTING_NUMBER || process.env.VITE_BANK_ROUTING
  );
  let bankSwift = cleanString(
    process.env.BANK_SWIFT || process.env.TT_BANK_SWIFT ||
    process.env.SWIFT_CODE || process.env.VITE_BANK_SWIFT
  );

  // 2. Read database app_settings if configured in admin dashboard
  try {
    const conn = await getDbConnection();
    const [rows] = await conn.query('SELECT `key`, `value` FROM app_settings');
    await conn.end();
    for (const r of rows) {
      if (!usdt && r.key === 'wallet_usdt') usdt = r.value;
      if (!btc && r.key === 'wallet_btc') btc = r.value;
      if (!eth && r.key === 'wallet_eth') eth = r.value;
      if (!bankName && r.key === 'bank_name') bankName = r.value;
      if (!bankAccount && r.key === 'bank_account') bankAccount = r.value;
      if (!bankRouting && r.key === 'bank_routing') bankRouting = r.value;
      if (!bankSwift && r.key === 'bank_swift') bankSwift = r.value;
    }
  } catch (e) {}

  return res.status(200).json({
    usdt: {
      network: 'TRC-20',
      address: usdt || 'TVZpQ78y2s8N4x7a8n2b4k5L6m7j9w1Q2r',
      label: 'Tether (USDT TRC-20)'
    },
    eth: {
      network: 'ERC-20',
      address: eth || '0x71C8A9eD23B75aE033fDaC23e4d775F86d47Eb6C',
      label: 'Ethereum (ETH)'
    },
    btc: {
      network: 'Bitcoin',
      address: btc || 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      label: 'Bitcoin (BTC)'
    },
    bank: {
      name: bankName || 'JPMorgan Chase Bank, N.A.',
      account: bankAccount || '8839201948',
      routing: bankRouting || '021000021',
      swift: bankSwift || 'CHASUS33',
      label: 'Bank Wire Transfer'
    }
  });
}
