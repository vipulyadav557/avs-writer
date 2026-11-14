
require('dotenv').config();

const { pool } = require('./config/database');

async function inspectDatabase() {
  try {
    const result = await pool.query(`
      SELECT
        pg_get_serial_sequence('poems', 'poem_id') AS poem_sequence,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'poems'
        AND column_name = 'poem_id';
    `);

    console.log('POEM ID GENERATION:');
    console.table(result.rows);

    const triggers = await pool.query(`
      SELECT
        trigger_name,
        event_manipulation,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'poems';
    `);

    console.log('POEMS TABLE TRIGGERS:');
    console.table(triggers.rows);
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
}

inspectDatabase();
