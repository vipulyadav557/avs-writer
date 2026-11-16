const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let connected = false;

const sslConfig = process.env.PGSSL === 'true'
  ? {
      ca: fs.readFileSync(
        path.join(__dirname, 'prod-ca-2021.crt'),
        'utf8'
      ),
      rejectUnauthorized: true
    }
  : undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
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
    throw new Error('DATABASE_URL is missing from environment variables.');
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
