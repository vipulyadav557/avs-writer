
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { pool } = require('../config/database');
const { supabase } = require('../config/supabase');

const profileDirectory = path.join(
    __dirname,
    '..',
    'storage',
    'profiles'
);

const bucketName = 'profiles';

const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};

async function migrateProfilePhotos() {
    try {
        console.log('Starting profile photo migration...');

        const result = await pool.query(`
            SELECT user_id, profile_photo
            FROM users
            WHERE profile_photo IS NOT NULL
              AND profile_photo <> ''
            ORDER BY user_id
        `);

        if (result.rows.length === 0) {
            console.log('No profile photos found in database.');
            return;
        }

        for (const user of result.rows) {
            const filename = user.profile_photo;

            if (
                typeof filename !== 'string' ||
                !/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(filename)
            ) {
                throw new Error(
                    `Invalid profile filename for user ${user.user_id}`
                );
            }

            const filePath = path.join(profileDirectory, filename);

            if (!fs.existsSync(filePath)) {
                throw new Error(
                    `Local photo not found: ${filename}`
                );
            }

            const extension = path.extname(filename).toLowerCase();
            const contentType = mimeTypes[extension];

            const fileBuffer = fs.readFileSync(filePath);

            const { error } = await supabase.storage
                .from(bucketName)
                .upload(filename, fileBuffer, {
                    contentType,
                    upsert: true
                });

            if (error) {
                throw new Error(
                    `Supabase upload failed for ${filename}: ${error.message}`
                );
            }

            console.log(
                `Uploaded: ${filename} | User ID: ${user.user_id}`
            );
        }

        console.log('PROFILE PHOTO MIGRATION SUCCESS');

    } catch (error) {
        console.error('PROFILE PHOTO MIGRATION FAILED:', error.message);
        process.exitCode = 1;

    } finally {
        await pool.end();
    }
}

migrateProfilePhotos();
