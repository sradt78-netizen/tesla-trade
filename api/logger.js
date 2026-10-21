import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to extract client IP address
export function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

// Helper to extract device / user agent
export function getClientUserAgent(req) {
  if (!req || !req.headers) return 'Unknown Client';
  return req.headers['user-agent'] || 'Unknown Client';
}

/**
 * Detailed User Action Logging System
 * Records every critical user and admin interaction:
 * - Registration, Login, Password setup
 * - OTP requests and verifications
 * - Deposit payment submissions (with receipts and transaction IDs)
 * - Admin approvals and rejections of deposits
 * - Admin balance credits
 * - Email dispatches and delivery statuses
 * - Profile and settings updates
 */
export async function logUserAction(reqOrDetails, maybeDetails) {
  let req = null;
  let details = {};

  if (reqOrDetails && (reqOrDetails.headers || reqOrDetails.url || reqOrDetails.method)) {
    req = reqOrDetails;
    details = maybeDetails || {};
  } else {
    details = reqOrDetails || {};
  }

  const timestamp = new Date().toISOString();
  const id = 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  const user_email = String(details.user_email || details.email || 'system').toLowerCase().trim();
  const action_type = String(details.action_type || details.action || 'general.action').trim();
  const description = String(details.description || details.message || action_type).trim();
  const status = details.status || 'success'; // 'success' | 'warning' | 'error' | 'pending'
  const ip_address = details.ip_address || getClientIp(req);
  const user_agent = details.user_agent || getClientUserAgent(req);
  const actionDetails = details.details || details.data || {};

  const logEntry = {
    id,
    timestamp,
    user_email,
    action_type,
    description,
    status,
    ip_address,
    user_agent,
    details: typeof actionDetails === 'object' ? actionDetails : { note: String(actionDetails) }
  };

  // Persist to unified storage
  try {
    const { addActionLog } = await import('./db.js');
    await addActionLog(logEntry);
  } catch (err) {
    console.warn('[Logger] Storage write warning:', err.message);
  }

  // Server console output for instant dev visibility
  const icon = status === 'error' ? '❌' : (status === 'warning' ? '⚠️' : '✅');
  console.log(`[ACTION LOG] ${icon} [${timestamp}] [${action_type}] [${user_email}]: ${description}`);

  return logEntry;
}

export default {
  logUserAction,
  getClientIp,
  getClientUserAgent
};
