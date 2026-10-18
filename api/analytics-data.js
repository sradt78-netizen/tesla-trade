import mysql from 'mysql2/promise';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const host = process.env.DB_HOST || process.env.TT_DB_HOST || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com';
  const port = parseInt(process.env.DB_PORT || process.env.TT_DB_PORT || '28487', 10);
  const user = process.env.DB_USER || process.env.TT_DB_USER || 'avnadmin';
  const password = process.env.DB_PASSWORD || process.env.TT_DB_PASS || 'AVNS_eN3hQrUWcOL7PRQXP_i';
  const database = process.env.DB_NAME || process.env.TT_DB_NAME || 'defaultdb';
  const adminPass = process.env.ADMIN_PASSWORD || process.env.TT_ADMIN_PASSWORD || 'Heartofwisdom101@$';

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pass = url.searchParams.get('password') || req.headers['x-admin-password'] || '';
  const isAuthed = pass === adminPass;

  try {
    const conn = await mysql.createConnection({ host, port, user, password, database, ssl: { rejectUnauthorized: false } });

    const [[{ total_clicks }]] = await conn.query('SELECT COUNT(*) as total_clicks FROM analytics_clicks');
    const [[{ unique_visitors }]] = await conn.query('SELECT COUNT(DISTINCT ip_address) as unique_visitors FROM analytics_clicks');
    const [[{ clicks_today }]] = await conn.query('SELECT COUNT(*) as clicks_today FROM analytics_clicks WHERE created_at >= CURDATE()');

    const [[{ total_signups }]] = await conn.query('SELECT COUNT(*) as total_signups FROM investor_accounts');
    const [[{ signups_today }]] = await conn.query('SELECT COUNT(*) as signups_today FROM investor_accounts WHERE registered_at >= CURDATE()');

    const [[{ total_investments, investment_volume }]] = await conn.query('SELECT COUNT(*) as total_investments, COALESCE(SUM(total), 0) as investment_volume FROM investments');
    const [[{ total_orders }]] = await conn.query('SELECT COUNT(*) as total_orders FROM ev_orders');

    const [sources] = await conn.query('SELECT campaign_source, COUNT(*) as count FROM analytics_clicks GROUP BY campaign_source ORDER BY count DESC LIMIT 10');
    const [devices] = await conn.query('SELECT device_type, COUNT(*) as count FROM analytics_clicks GROUP BY device_type ORDER BY count DESC');
    const [recent_clicks] = await conn.query('SELECT id, ip_address, referrer, landing_page, campaign_source, device_type, created_at FROM analytics_clicks ORDER BY id DESC LIMIT 50');

    let [recent_signups] = await conn.query('SELECT email, name, phone, onboarding_status, registered_at FROM investor_accounts ORDER BY registered_at DESC LIMIT 20');
    if (!isAuthed) {
      recent_signups = recent_signups.map(r => {
        const parts = (r.email || '').split('@');
        return {
          ...r,
          email: parts[0] ? parts[0].substring(0, 3) + '***@' + (parts[1] || '') : '—'
        };
      });
    }

    await conn.end();

    return res.status(200).json({
      authenticated: isAuthed,
      summary: {
        total_clicks,
        unique_visitors,
        clicks_today,
        total_signups,
        signups_today,
        conversion_rate: total_clicks > 0 ? parseFloat(((total_signups / total_clicks) * 100).toFixed(2)) : 0,
        total_investments,
        investment_volume: parseFloat(investment_volume),
        total_orders
      },
      sources,
      devices,
      recent_clicks,
      recent_signups
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
