
const { pool } = require('../config/database');

class AdminNotification {
    static async create({
        eventType,
        title,
        message,
        targetUrl = null,
        metadata = {}
    }) {
        const query = `
            INSERT INTO admin_notifications
                (event_type, title, message, target_url, metadata)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            RETURNING *
        `;

        const values = [
            eventType,
            title,
            message,
            targetUrl,
            JSON.stringify(metadata || {})
        ];

        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async getRecent(limit = 20) {
        const safeLimit = Math.min(
            Math.max(parseInt(limit, 10) || 20, 1),
            100
        );

        const result = await pool.query(
            `SELECT *
             FROM admin_notifications
             ORDER BY created_at DESC
             LIMIT $1`,
            [safeLimit]
        );

        return result.rows;
    }

    static async getUnreadCount() {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS count
             FROM admin_notifications
             WHERE is_read = FALSE`
        );

        return result.rows[0].count;
    }

    static async markAsRead(notificationId) {
        const result = await pool.query(
            `UPDATE admin_notifications
             SET is_read = TRUE
             WHERE notification_id = $1
             RETURNING *`,
            [notificationId]
        );

        return result.rows[0] || null;
    }

    static async markAllAsRead() {
        const result = await pool.query(
            `UPDATE admin_notifications
             SET is_read = TRUE
             WHERE is_read = FALSE`
        );

        return result.rowCount;
    }

    static async deleteById(notificationId) {
        const result = await pool.query(
            `DELETE FROM admin_notifications
             WHERE notification_id = $1
             RETURNING notification_id`,
            [notificationId]
        );

        return result.rowCount;
    }

    static async deleteAll() {
        const result = await pool.query(
            `DELETE FROM admin_notifications`
        );

        return result.rowCount;
    }
}

module.exports = AdminNotification;
