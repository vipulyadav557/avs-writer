
const express = require('express');
const router = express.Router();

const { isConnected } = require('../config/database');
const Book = require('../models/Book');

router.get('/', async (req, res) => {
    const q = (req.query.q || '').trim();
    const category = req.query.category || '';
    const language = req.query.language || '';

    if (!isConnected()) {
        return res.render('pages/books', {
            title: 'Books',
            books: [],
            query: q,
            category,
            language,
            categories: Book.categories,
            languages: Book.languages,
            dbAvailable: false,
            error: 'Database not configured.'
        });
    }

    try {
        const result = await Book.findPublished({
            q,
            category,
            language,
            page: req.query.page
        });

        res.render('pages/books', {
            title: 'Books',
            books: result.books,
            query: q,
            category,
            language,
            categories: Book.categories,
            languages: Book.languages,
            dbAvailable: true,
            page: result.page,
            total: result.total,
            limit: result.limit,
            error: null
        });
    } catch (error) {
        console.error('Books route error:', error);

        res.status(500).render('pages/500', {
            title: 'Server Error'
        });
    }
});

router.get('/:slug', async (req, res) => {
    if (!isConnected()) {
        return res.status(503).render('pages/500', {
            title: 'Server Error'
        });
    }

    try {
        const book = await Book.findOnePublished(req.params.slug);

        if (!book) {
            return res.status(404).render('pages/404', {
                title: 'Not Found'
            });
        }

        await Book.incrementViews(book.book_id);

        res.render('pages/book', {
            title: book.title,
            book
        });
    } catch (error) {
        console.error('Book detail error:', error);

        res.status(500).render('pages/500', {
            title: 'Server Error'
        });
    }
});

module.exports = router;
