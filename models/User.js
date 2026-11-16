
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

async function findByEmail(email) {
    const result = await pool.query(
        `SELECT
            user_id,
            name,
            email,
            password_hash,
            role,
            is_active,
            last_login
         FROM users
         WHERE email = $1
         LIMIT 1`,
        [email.toLowerCase().trim()]
    );

    return result.rows[0] || null;
}

async function findById(id) {
    const result = await pool.query(
        `SELECT
            user_id,
            name,
            email,
            role,
            is_active,
            last_login,
            bio,
            profile_photo,
            profile_slug
         FROM users
         WHERE user_id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

async function findAllWriters() {
    const result = await pool.query(
        `SELECT
            user_id,
            name,
            email,
            role,
            is_active,
            last_login,
            created_at
         FROM users
         WHERE role = 'writer'
         ORDER BY created_at DESC, user_id DESC`
    );

    return result.rows;
}

async function updateWriterStatus(id, isActive) {
    const result = await pool.query(
        `UPDATE users
         SET is_active = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2
           AND role = 'writer'
         RETURNING
            user_id,
            name,
            email,
            role,
            is_active,
            last_login`,
        [isActive, id]
    );

    return result.rows[0] || null;
}

async function findPublicProfile(slug) {
    const result = await pool.query(
        `SELECT
            user_id,
            name,
            bio,
            profile_photo,
            profile_slug,
            created_at
         FROM users
         WHERE profile_slug = $1
           AND role = 'writer'
           AND is_active = TRUE
         LIMIT 1`,
        [slug]
    );

    return result.rows[0] || null;
}

async function updateProfile(id, { name, bio, profile_photo }) {
    const result = await pool.query(
        `UPDATE users
         SET name = $1,
             bio = $2,
             profile_photo = COALESCE($3, profile_photo),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4
         RETURNING
            user_id,
            name,
            email,
            role,
            bio,
            profile_photo,
            profile_slug`,
        [name, bio, profile_photo || null, id]
    );

    return result.rows[0] || null;
}

async function verifyPassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}

async function updateLastLogin(id) {
    await pool.query(
        `UPDATE users
         SET last_login = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [id]
    );
}

async function createUser({ name, email, password, role = 'writer' }) {
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO users
                (name, email, password_hash, role)
             VALUES ($1, $2, $3, $4)
             RETURNING user_id, name, email, role`,
            [name, email.toLowerCase().trim(), passwordHash, role]
        );

        const user = result.rows[0];

        const baseSlug = user.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'writer';

        const profileSlug = `${baseSlug}-${user.user_id}`;

        const updatedResult = await client.query(
            `UPDATE users
             SET profile_slug = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $2
             RETURNING user_id, name, email, role, profile_slug`,
            [profileSlug, user.user_id]
        );

        await client.query('COMMIT');

        return updatedResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    findByEmail,
    findById,
    findAllWriters,
    updateWriterStatus,
    findPublicProfile,
    updateProfile,
    verifyPassword,
    updateLastLogin,
    createUser
};
