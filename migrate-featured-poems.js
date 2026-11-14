require('dotenv').config();

const { pool } = require('./config/database');

async function migrateFeaturedPoems() {
  try {
    await pool.query(`
      ALTER TABLE poems
      ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
    `);

    console.log('Featured poems migration completed successfully.');
  } catch (error) {
    console.error('Featured poems migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateFeaturedPoems();