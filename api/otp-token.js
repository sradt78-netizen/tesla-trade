import crypto from 'crypto';
import { getMailerConfig } from './mailer.js';

/**
 * Resolve the OTP token signing key.
 *
 * Keep an explicitly configured OTP secret authoritative. For deployments
 * that already have Resend configured but do not have the separate OTP secret,
 * derive a purpose-specific signing key from the server-side Resend API key.
 * The raw Resend key is never returned to the browser or logged.
 */
export async function getOtpTokenSecret() {
  const configured = String(
    process.env.OTP_TOKEN_SECRET || process.env.TT_OTP_TOKEN_SECRET || ''
  ).trim();
  if (configured) return configured;

  try {
    const { apiKey } = await getMailerConfig();
    if (!apiKey) return '';
    return crypto
      .createHash('sha256')
      .update('tesla-trade:otp-verification-token:v1:')
      .update(String(apiKey))
      .digest();
  } catch (error) {
    console.error('[otp] Could not resolve the configured email signing key:', error?.message || error);
    return '';
  }
}
