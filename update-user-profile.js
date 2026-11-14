
require('dotenv').config();

const { pool } = require('./config/database');

async function updateUserProfile() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS bio TEXT,
            ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(255),
            ADD COLUMN IF NOT EXISTS profile_slug VARCHAR(150)
        `);

        await client.query(`
            UPDATE users
            SET profile_slug =
                COALESCE(
                    NULLIF(
                        TRIM(BOTH '-' FROM
                            REGEXP_REPLACE(
                                LOWER(TRIM(name)),
                                '[^a-z0-9]+',
                                '-',
                                'g'
                            )
                        ),
                        ''
                    ),
                    'writer'
                ) || '-' || user_id
            WHERE profile_slug IS NULL
        `);

        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS users_profile_slug_unique
            ON users(profile_slug)
        `);

        await client.query('COMMIT');

        console.log('Writer profile database updated successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Database update failed:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

updateUserProfile();
