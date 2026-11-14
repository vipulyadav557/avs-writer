
require('dotenv').config();

const { pool } = require('./config/database');

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Synchronize the existing IDENTITY sequence
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('public.poems', 'poem_id'),
        COALESCE((SELECT MAX(poem_id) FROM poems), 1),
        EXISTS(SELECT 1 FROM poems)
      );
    `);

    // Optional image attachment information
    await client.query(`
      ALTER TABLE poems
      ADD COLUMN IF NOT EXISTS image_original_name TEXT,
      ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS image_size BIGINT;
    `);

    // Optional PDF attachment information
    await client.query(`
      ALTER TABLE poems
      ADD COLUMN IF NOT EXISTS document_url TEXT,
      ADD COLUMN IF NOT EXISTS document_original_name TEXT,
      ADD COLUMN IF NOT EXISTS document_mime_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS document_size BIGINT;
    `);

    // Enable writer submission and admin review statuses
    await client.query(`
      ALTER TABLE poems
      DROP CONSTRAINT IF EXISTS poems_status_check;
    `);

    await client.query(`
      ALTER TABLE poems
      ADD CONSTRAINT poems_status_check
      CHECK (status IN ('draft', 'pending', 'published', 'rejected'));
    `);

    await client.query('COMMIT');

    console.log('Poem submission database migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
