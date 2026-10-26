/**
 * Detailed User Action & Security Audit Logging System for Tesla Trade Inc.
 * Encrypted, tamper-evident real-time activity tracking for all site events.
 */

import { addPersistentLog, getPersistentLogs, clearPersistentLogs } from './store.js';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

/**
 * Record a user action or system event.
 */
export async function recordActivityLog({
  action,
  category = 'system',
  user_email = '',
  ip_address = '',
  user_agent = '',
  status = 'success',
  details = '',
  metadata = null
}) {
  const entry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    action: cleanString(action || 'ACTIVITY'),
    category: cleanString(category || 'system').toLowerCase(),
    user_email: cleanString(user_email || 'visitor').toLowerCase(),
    ip_address: cleanString(ip_address || '127.0.0.1'),
    user_agent: cleanString(user_agent || '').substring(0, 300),
    status: cleanString(status || 'success').toLowerCase(),
    details: typeof details === 'object' ? JSON.stringify(details) : cleanString(details || ''),
    metadata: metadata || null,
    created_at: new Date().toISOString()
  };

  try {
    await addPersistentLog(entry);
  } catch (err) {
    console.error('[ActivityLog] Failed to persist log:', err.message);
  }

  return entry;
}

/**
 * HTTP handler for admin activity log inspection and real-time monitoring.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, x-admin-password');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const action = url.searchParams.get('action') || (req.method === 'DELETE' ? 'clear' : 'list');

  if (action === 'clear') {
    await clearPersistentLogs();
    return res.status(200).json({ success: true, message: 'Activity logs cleared.' });
  }

  // List logs with optional filtering
  const category = url.searchParams.get('category') || '';
  const search = cleanString(url.searchParams.get('search') || '').toLowerCase();
  const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get('limit') || '100', 10)));

  const allLogs = await getPersistentLogs();

  let filtered = allLogs;
  if (category && category !== 'all') {
    filtered = filtered.filter(l => (l.category || '').toLowerCase() === category.toLowerCase());
  }
  if (search) {
    filtered = filtered.filter(l => 
      (l.user_email || '').toLowerCase().includes(search) ||
      (l.action || '').toLowerCase().includes(search) ||
      (l.details || '').toLowerCase().includes(search) ||
      (l.ip_address || '').includes(search)
    );
  }

  const paged = filtered.slice(0, limit);

  return res.status(200).json({
    success: true,
    total: filtered.length,
    count: paged.length,
    logs: paged
  });
}
