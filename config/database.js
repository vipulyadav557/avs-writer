
const { Pool } = require('pg');

let connected = false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('connect', () => {
  console.log('PostgreSQL client connected.');
});

pool.on('error', (err) => {
  connected = false;
  console.error('PostgreSQL pool error:', err.message);
});

async function connectDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not configured.');
    return false;
  }

  try {
    await pool.query('SELECT 1');
    connected = true;
    console.log('PostgreSQL database connected successfully.');
    return true;
  } catch (err) {
    connected = false;
    console.error('PostgreSQL connection failed:', err.message);
    throw err;
  }
}

function isConnected() {
  return connected;
}

module.exports = {
  pool,
  connectDatabase,
  isConnected
};
