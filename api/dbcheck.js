import mysql from 'mysql2/promise';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const host = cleanString(process.env.DB_HOST || process.env.TT_DB_HOST) || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com';
  const port = parseInt(cleanString(process.env.DB_PORT || process.env.TT_DB_PORT) || '28487', 10);
  const user = cleanString(process.env.DB_USER || process.env.TT_DB_USER) || 'avnadmin';
  const password = cleanString(process.env.DB_PASSWORD || process.env.TT_DB_PASS) || 'AVNS_eN3hQrUWcOL7PRQXP_i';
  const database = cleanString(process.env.DB_NAME || process.env.TT_DB_NAME) || 'defaultdb';

  try {
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      ssl: { rejectUnauthorized: false }
    });

    const [tables] = await connection.query('SHOW TABLES');
    await connection.end();

    return res.status(200).json({
      status: 'ok',
      message: 'Successfully connected to Aiven MySQL database!',
      database: {
        connected: true,
        tables_count: tables.length,
        host: host,
        port: port,
        database: database
      },
      environment: {
        has_DB_HOST: !!process.env.DB_HOST,
        has_DB_PASSWORD: !!process.env.DB_PASSWORD,
        has_ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
        default_password_fallback: 'Heartofwisdom101@$'
      }
    });
  } catch (error) {
    return res.status(200).json({
      status: 'warning',
      message: 'Database check finished',
      database: {
        connected: false,
        error: error.message,
        host_attempted: host
      },
      environment: {
        has_DB_HOST: !!process.env.DB_HOST,
        has_DB_PASSWORD: !!process.env.DB_PASSWORD,
        has_ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD
      }
    });
  }
}
