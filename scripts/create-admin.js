
require('dotenv').config();

const User = require('../models/User');
const { pool } = require('../config/database');

async function createAdmin() {
    try {
        const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

        if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
            throw new Error('Admin environment variables are missing.');
        }

        if (ADMIN_PASSWORD.length < 12) {
            throw new Error('Admin password must be at least 12 characters.');
        }

        await pool.query('SELECT 1');

        const existingUser = await User.findByEmail(ADMIN_EMAIL);

        if (existingUser) {
            throw new Error('This email already exists. No account created.');
        }

        const admin = await User.createUser({
            name: ADMIN_NAME,
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'admin'
        });

        console.log('Admin account created successfully!');
        console.log({
            id: admin.user_id,
            name: admin.name,
            email: admin.email,
            role: admin.role
        });

    } catch (error) {
        console.error('Admin creation failed:', error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

createAdmin();
