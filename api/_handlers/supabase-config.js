import { getDbConnection } from './dbcheck.js';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

export async function resolveSupabaseCredentials() {
  let url = cleanString(
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL
  );

  let anonKey = cleanString(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_API_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );

  // Check database app_settings if not in environment
  if (!url || !anonKey) {
    try {
      const conn = await getDbConnection();
      const [rows] = await conn.query('SELECT `key`, `value` FROM app_settings WHERE `key` IN ("supabase_url", "supabase_anon_key", "supabase_publishable_key")');
      await conn.end();
      for (const r of rows) {
        if (!url && r.key === 'supabase_url') url = cleanString(r.value);
        if (!anonKey && (r.key === 'supabase_anon_key' || r.key === 'supabase_publishable_key')) anonKey = cleanString(r.value);
      }
    } catch (e) {}
  }

  return { url, anonKey };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const { url, anonKey } = await resolveSupabaseCredentials();

  if (!url || !anonKey) {
    return res.status(200).json({
      success: false,
      configured: false,
      error: 'Supabase is not configured on this server. Set SUPABASE_URL and SUPABASE_ANON_KEY in environment variables or Admin Settings.',
      url: '',
      anonKey: '',
      key: ''
    });
  }

  return res.status(200).json({
    success: true,
    configured: true,
    url,
    anonKey,
    key: anonKey
  });
}
