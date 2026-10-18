import mysql from 'mysql2/promise';

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

  const host = process.env.DB_HOST || process.env.TT_DB_HOST || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com';
  const port = parseInt(process.env.DB_PORT || process.env.TT_DB_PORT || '28487', 10);
  const user = process.env.DB_USER || process.env.TT_DB_USER || 'avnadmin';
  const password = process.env.DB_PASSWORD || process.env.TT_DB_PASS || 'AVNS_eN3hQrUWcOL7PRQXP_i';
  const database = process.env.DB_NAME || process.env.TT_DB_NAME || 'defaultdb';

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

  try {
    const conn = await mysql.createConnection({ host, port, user, password, database, ssl: { rejectUnauthorized: false } });
    await conn.query(
      'INSERT INTO analytics_clicks (ip_address, referrer, landing_page, campaign_source, device_type, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [ip.substring(0, 45), ref.substring(0, 500), landing.substring(0, 255), source.substring(0, 100), device.substring(0, 20), (req.headers['user-agent'] || '').substring(0, 500)]
    );
    await conn.end();
  } catch (e) {}

  return res.status(200).json({ success: true });
}
