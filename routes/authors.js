
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const User = require('../models/User');
const { pool } = require('../config/database');
const { profileUploadDirectory } = require('../config/profileUpload');

// Secure public profile photo
router.get('/photo/:filename', (req, res, next) => {
    try {
        const filename = req.params.filename;

        if (
            path.basename(filename) !== filename ||
            !/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(filename)
        ) {
            return res.status(404).end();
        }

        const filePath = path.join(profileUploadDirectory, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).end();
        }

        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(filePath, error => {
            if (error && !res.headersSent) {
                next(error);
            }
        });
    } catch (error) {
        next(error);
    }
});

// Public Author Profile
router.get('/:slug', async (req, res, next) => {
    try {
        const author = await User.findPublicProfile(req.params.slug);

        if (!author) {
            return res.status(404).render('pages/404', {
                title: 'Author Not Found'
            });
        }

        const result = await pool.query(
            `SELECT
                poem_id AS "_id",
                title,
                slug,
                category,
                language,
                body,
                image_url AS "imageUrl",
                image_mime_type AS "imageMimeType",
                created_at AS "createdAt"
             FROM poems
             WHERE user_id = $1
               AND status = 'published'
             ORDER BY created_at DESC`,
            [author.user_id]
        );

        res.render('pages/author', {
            title: `${author.name} - AVS Writer`,
            author,
            poems: result.rows
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
