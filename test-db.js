
require('dotenv').config();

const {
    pool,
    connectDatabase
} = require('./config/database');

async function testConnection() {
    try {
        console.log('Connecting to PostgreSQL...');

        await connectDatabase();

        const result = await pool.query(`
            SELECT
                current_database() AS database,
                current_user AS username,
                NOW() AS server_time
        `);

        console.log('Database connected successfully!');
        console.table(result.rows);

        const tables = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);

        console.log('Available Tables:');
        console.table(tables.rows);

    } catch (error) {
        console.error('Database connection error:', error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

testConnection();
