require('dotenv').config();

const { pool } = require('../config/database');

async function createNotificationsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_notifications (
                notification_id BIGSERIAL PRIMARY KEY,
                event_type VARCHAR(50) NOT NULL,
                title VARCHAR(200) NOT NULL,
                message TEXT NOT NULL,
                target_url VARCHAR(500),
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
            ON admin_notifications (is_read, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_admin_notifications_created
            ON admin_notifications (created_at DESC);
        `);

        console.log('SUCCESS: admin_notifications table created.');

        const result = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'admin_notifications'
            ORDER BY ordinal_position
        `);

        console.table(result.rows);

    } catch (error) {
        console.error('NOTIFICATION TABLE ERROR:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

createNotificationsTable();
