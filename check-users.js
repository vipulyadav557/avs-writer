require('dotenv').config();

const { pool } = require('./config/database');

async function checkUsers() {
    try {
        console.log(
            'DATABASE_URL loaded:',
            Boolean(process.env.DATABASE_URL)
        );

        const result = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'users'
            ORDER BY ordinal_position
        `);

        console.table(result.rows);
    } catch (error) {
        console.error(error.message);
    } finally {
        await pool.end();
    }
}

checkUsers();