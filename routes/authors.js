
const express = require('express');

const router = express.Router();

const User = require('../models/User');
const { pool } = require('../config/database');
const { supabase } = require('../config/supabase');

// Profile photo from private Supabase Storage
router.get('/photo/:filename', async (req, res, next) => {
    try {
        const filename = req.params.filename;

        if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
            return res.status(404).end();
        }

        const { data, error } = await supabase.storage
            .from('profiles')
            .download(filename);

        if (error || !data) {
            return res.status(404).end();
        }

        const extension = filename.split('.').pop().toLowerCase();

        const mimeTypes = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp'
        };

        const buffer = Buffer.from(await data.arrayBuffer());

        res.setHeader('Content-Type', mimeTypes[extension]);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=3600');

        return res.send(buffer);

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
