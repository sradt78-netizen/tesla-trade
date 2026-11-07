import crypto from 'crypto';
import { getDbConnection } from './dbcheck.js';
import { sendSupportMessageEmail } from '../notifications.js';

const clean = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const hashToken = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const makeId = () => crypto.randomUUID();

export async function ensureSupportTables(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS support_threads (
      id VARCHAR(36) PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      user_name VARCHAR(160) NOT NULL DEFAULT 'Investor',
      subject VARCHAR(200) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      token_hash CHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_support_email (user_email),
      INDEX idx_support_status (status),
      INDEX idx_support_updated (updated_at)
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS support_thread_tokens (
      id VARCHAR(36) PRIMARY KEY,
      thread_id VARCHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_support_token (token_hash),
      INDEX idx_support_token_thread (thread_id),
      CONSTRAINT fk_support_tokens_thread FOREIGN KEY (thread_id)
        REFERENCES support_threads(id) ON DELETE CASCADE
    )
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id VARCHAR(36) PRIMARY KEY,
      thread_id VARCHAR(36) NOT NULL,
      sender_role VARCHAR(16) NOT NULL,
      sender_name VARCHAR(160) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_support_thread (thread_id, created_at),
      CONSTRAINT fk_support_messages_thread FOREIGN KEY (thread_id)
        REFERENCES support_threads(id) ON DELETE CASCADE
    )
  `);
}

function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 20000) raw = raw.slice(0, 20000); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const body = req.method === 'POST' ? await jsonBody(req) : {};
  const url = new URL(req.url, `https://${req.headers.host || 'teslawealths.org'}`);
  const action = clean(body.action || url.searchParams.get('action') || 'view', 24);
  const ticketId = clean(body.ticketId || url.searchParams.get('ticket'), 36);
  const token = clean(body.token || url.searchParams.get('token'), 128);

  let conn;
  try {
    conn = await getDbConnection();
    await ensureSupportTables(conn);

    if (req.method === 'POST' && action === 'create') {
      const email = clean(body.email, 254).toLowerCase();
      const name = clean(body.name || 'Investor', 160);
      const subject = clean(body.subject, 200);
      const message = clean(body.message, 5000);
      if (!email.includes('@') || !subject || message.length < 5) {
        await conn.end();
        return res.status(400).json({ success: false, error: 'Enter a valid email, subject, and message.' });
      }
      const [recent] = await conn.query(
        'SELECT COUNT(*) AS total FROM support_threads WHERE LOWER(user_email)=? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)',
        [email]
      );
      if (Number(recent[0]?.total || 0) >= 5) {
        await conn.end();
        return res.status(429).json({ success: false, error: 'Please wait before opening another support conversation.' });
      }
      const id = makeId();
      const accessToken = crypto.randomBytes(32).toString('hex');
      await conn.beginTransaction();
      await conn.query(
        'INSERT INTO support_threads (id,user_email,user_name,subject,status,token_hash) VALUES (?,?,?,?,?,?)',
        [id, email, name, subject, 'open', hashToken(accessToken)]
      );
      await conn.query(
        'INSERT INTO support_messages (id,thread_id,sender_role,sender_name,message) VALUES (?,?,?,?,?)',
        [makeId(), id, 'investor', name, message]
      );
      await conn.query('INSERT INTO support_thread_tokens (id,thread_id,token_hash) VALUES (?,?,?)', [makeId(), id, hashToken(accessToken)]);
      await conn.commit();
      await conn.end();
      const ticketUrl = 'https://teslawealths.org/support?ticket=' + encodeURIComponent(id) + '&token=' + encodeURIComponent(accessToken);
      const [telegramAlert, adminMail, userMail] = await Promise.allSettled([
        import('../telegram.js').then(({ notifyInvestorMessage }) => notifyInvestorMessage({ name, email, subject, message, kind: 'new' })),
        sendSupportMessageEmail({ toAdmin: true, userEmail: email, userName: name, subject, message, ticketUrl }),
        sendSupportMessageEmail({ to: email, userName: name, subject: 'We received your support request: ' + subject, message: 'Your message has been received. You can view replies and respond securely using your private support link.', ticketUrl })
      ]);
      if (telegramAlert.status === 'rejected' || telegramAlert.value?.ok === false) console.error('[support] Telegram alert failed:', telegramAlert.reason?.message || telegramAlert.value?.error || 'not delivered');
      return res.status(201).json({
        success: true, ticketId: id, token: accessToken, ticketUrl,
        emailStatus: { admin: adminMail.status === 'fulfilled' && adminMail.value?.ok, investor: userMail.status === 'fulfilled' && userMail.value?.ok }
      });
    }

    if (req.method === 'GET' || (req.method === 'POST' && action === 'view')) {
      if (!ticketId || !token) { await conn.end(); return res.status(400).json({ success: false, error: 'A support ticket link is required.' }); }
      const [threads] = await conn.query('SELECT id,user_name,subject,status,created_at,updated_at FROM support_threads WHERE id=? LIMIT 1', [ticketId]);
      const thread = threads[0];
      const [accessRows] = await conn.query('SELECT id FROM support_thread_tokens WHERE thread_id=? AND token_hash=? LIMIT 1', [ticketId, hashToken(token)]);
      if (!thread || !accessRows.length) { await conn.end(); return res.status(404).json({ success: false, error: 'Support conversation not found. Check your private ticket link.' }); }
      const [messages] = await conn.query('SELECT sender_role,sender_name,message,created_at FROM support_messages WHERE thread_id=? ORDER BY created_at ASC', [ticketId]);
      await conn.end();
      return res.status(200).json({ success: true, thread: { id: thread.id, name: thread.user_name, subject: thread.subject, status: thread.status }, messages });
    }

    if (req.method === 'POST' && action === 'reply') {
      const message = clean(body.message, 5000);
      if (!ticketId || !token || message.length < 2) { await conn.end(); return res.status(400).json({ success: false, error: 'A valid ticket, private link, and reply are required.' }); }
      const [threads] = await conn.query('SELECT id,user_email,user_name,subject FROM support_threads WHERE id=? LIMIT 1', [ticketId]);
      const thread = threads[0];
      const [accessRows] = await conn.query('SELECT id FROM support_thread_tokens WHERE thread_id=? AND token_hash=? LIMIT 1', [ticketId, hashToken(token)]);
      if (!thread || !accessRows.length) { await conn.end(); return res.status(404).json({ success: false, error: 'Support conversation not found.' }); }
      await conn.beginTransaction();
      await conn.query('INSERT INTO support_messages (id,thread_id,sender_role,sender_name,message) VALUES (?,?,?,?,?)', [makeId(), ticketId, 'investor', thread.user_name, message]);
      await conn.query('UPDATE support_threads SET status="open",updated_at=NOW() WHERE id=?', [ticketId]);
      await conn.commit();
      await conn.end();
      const [{ adminEmail }, telegramResult] = await Promise.all([
        (await import('../mailer.js')).getMailerConfig(),
        import('../telegram.js').then(({ notifyInvestorMessage }) => notifyInvestorMessage({ name: thread.user_name, email: thread.user_email, subject: thread.subject, message, kind: 'reply' }))
      ]);
      const mail = await sendSupportMessageEmail({ to: adminEmail, toAdmin: true, userEmail: thread.user_email, userName: thread.user_name, subject: 'Investor replied: ' + thread.subject, message, ticketUrl: 'https://teslawealths.org/admin' });
      if (telegramResult?.ok === false) console.error('[support] Telegram reply alert failed:', telegramResult.error);
      return res.status(200).json({ success: true, emailSent: !!mail?.ok, telegramSent: !!telegramResult?.ok });
    }

    if (conn) await conn.end();
    return res.status(405).json({ success: false, error: 'Unsupported support action.' });
  } catch (error) {
    if (conn) { try { await conn.rollback(); } catch {} try { await conn.end(); } catch {} }
    console.error('[support] request failed:', error.message);
    return res.status(503).json({ success: false, error: 'Support is temporarily unavailable. Please try again.' });
  }
}
