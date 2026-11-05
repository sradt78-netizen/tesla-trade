import crypto from 'crypto';

const COOKIE_NAME = 'tt_investor_session';
const SESSION_SECONDS = 12 * 60 * 60;

function getSecret() {
  return String(
    process.env.SESSION_TOKEN_SECRET ||
    process.env.TT_SESSION_TOKEN_SECRET ||
    process.env.OTP_TOKEN_SECRET ||
    process.env.TT_OTP_TOKEN_SECRET ||
    ''
  ).trim();
}

function signature(payloadPart, secret) {
  return crypto.createHmac('sha256', secret).update(payloadPart).digest();
}

export function createInvestorSessionCookie(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('A valid investor email is required to create a session.');
  const secret = getSecret();
  if (secret.length < 32) throw new Error('Investor session security is not configured. Set SESSION_TOKEN_SECRET to a random secret of at least 32 characters.');
  const payloadPart = Buffer.from(JSON.stringify({
    email: cleanEmail,
    exp: Date.now() + SESSION_SECONDS * 1000
  })).toString('base64url');
  const token = payloadPart + '.' + signature(payloadPart, secret).toString('hex');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearInvestorSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function getInvestorSession(req) {
  const secret = getSecret();
  if (secret.length < 32) return null;
  const cookieHeader = String(req?.headers?.cookie || '');
  const tokenPair = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE_NAME + '='));
  if (!tokenPair) return null;
  const token = tokenPair.slice(COOKIE_NAME.length + 1);
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;
  const payloadPart = token.slice(0, separator);
  const suppliedHex = token.slice(separator + 1);
  let supplied;
  try { supplied = Buffer.from(suppliedHex, 'hex'); } catch (e) { return null; }
  const expected = signature(payloadPart, secret);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email.includes('@') || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    return { email, expiresAt: payload.exp };
  } catch (e) {
    return null;
  }
}
