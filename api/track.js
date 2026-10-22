import { getDbConnection } from './dbcheck.js';
import { loadDatabase, saveDatabase } from './db.js';
import { notifyLinkClick } from './telegram.js';

function parseJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const body = await parseJsonBody(req);
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim();
  const ref = body.referrer || req.headers['referer'] || '';
  const landing = body.landing_page || req.url || '/';
  let source = body.campaign_source || body.source || body.ref || '';

  if (!source) {
    if (ref.includes('google.')) source = 'google';
    else if (ref.includes('t.co') || ref.includes('twitter.com') || ref.includes('x.com')) source = 'twitter';
    else if (ref.includes('whatsapp') || ref.includes('wa.me')) source = 'whatsapp';
    else if (ref.includes('telegram') || ref.includes('t.me')) source = 'telegram';
    else if (ref.includes('instagram.com')) source = 'instagram';
    else if (ref) source = 'referral';
    else source = 'direct';
  }

  const device = body.device_type || (/Mobi|Android|iPhone/i.test(req.headers['user-agent'] || '') ? 'mobile' : 'desktop');

  // 1. MySQL database insertion if online
  try {
    const conn = await getDbConnection();
    await conn.query(
      'INSERT INTO analytics_clicks (ip_address, referrer, landing_page, campaign_source, device_type, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [ip.substring(0, 45), ref.substring(0, 500), landing.substring(0, 255), source.substring(0, 100), device.substring(0, 20), (req.headers['user-agent'] || '').substring(0, 500)]
    );
    await conn.end();
  } catch (e) {}

  // 2. Persistent file JSON store
  try {
    const db = loadDatabase();
    if (!db.clicks) db.clicks = [];
    db.clicks.unshift({
      id: Date.now(),
      ip_address: ip,
      referrer: ref,
      landing_page: landing,
      campaign_source: source,
      device_type: device,
      created_at: new Date().toISOString()
    });
    if (db.clicks.length > 500) db.clicks = db.clicks.slice(0, 500);
    saveDatabase();
  } catch (e) {}

  // 3. Dispatch optional Telegram alert for marketing traffic
  notifyLinkClick({
    campaign_source: source,
    landing_page: landing,
    device_type: device,
    referrer: ref,
    ip_address: ip
  }).catch(() => {});

  return res.status(200).json({ success: true });
}
