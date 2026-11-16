const express = require('express');
const path = require('path');

const router = express.Router();

const { isConnected } = require('../config/database');
const { supabase } = require('../config/supabase');
const Book = require('../models/Book');

const BOOK_BUCKET = 'books';

function getSafeBookStoredName(filename) {
  if (!filename || typeof filename !== 'string') return null;

  const safeName = path.basename(filename);
  if (safeName !== filename) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$/i.test(safeName)
    ? safeName
    : null;
}

async function sendBookFile(res, filename, kind, download = false) {
  const safeName = getSafeBookStoredName(filename);
  if (!safeName) return res.status(404).send('File not found.');

  const { data, error } = await supabase.storage
    .from(BOOK_BUCKET)
    .download(safeName);

  if (error || !data) {
    if (error) console.error('Public book file download error:', error.message);
    return res.status(404).send('File not found.');
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const extension = path.extname(safeName).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf'
  };

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', mimeTypes[extension]);
  res.setHeader('Content-Length', buffer.length);
  if (kind === 'pdf') {
    res.setHeader('Cache-Control', 'private, no-store');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  if (kind === 'pdf') {
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="book.pdf"`
    );
  } else {
    res.setHeader('Content-Disposition', 'inline');
  }

  return res.send(buffer);
}

// Public Books Listing
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

    return res.render('pages/books', {
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
    return res.status(500).render('pages/500', { title: 'Server Error' });
  }
});

// Public PDF Access - Published Books Only
router.get('/:slug/pdf', async (req, res) => {
  try {
    const book = await Book.findOnePublished(req.params.slug);
    if (!book) return res.status(404).send('Book not found.');

    const filename = book.pdfPath || book.pdfUrl;
    if (!filename) return res.status(404).send('PDF not available.');

    return await sendBookFile(res, filename, 'pdf', req.query.download === '1');
  } catch (error) {
    console.error('Public book PDF error:', error);
    return res.status(500).send('Unable to open book PDF.');
  }
});

// Public Cover Access - Published Books Only
router.get('/:slug/cover', async (req, res) => {
  try {
    const book = await Book.findOnePublished(req.params.slug);
    if (!book || !book.coverUrl) return res.status(404).send('Cover not found.');

    return await sendBookFile(res, book.coverUrl, 'cover');
  } catch (error) {
    console.error('Public book cover error:', error);
    return res.status(500).send('Unable to load book cover.');
  }
});

// Public Book Detail
router.get('/:slug', async (req, res) => {
  if (!isConnected()) {
    return res.status(503).render('pages/500', { title: 'Server Error' });
  }

  try {
    const book = await Book.findOnePublished(req.params.slug);
    if (!book) {
      return res.status(404).render('pages/404', { title: 'Not Found' });
    }

    await Book.incrementViews(book._id);
    return res.render('pages/book', { title: book.title, book });
  } catch (error) {
    console.error('Book detail error:', error);
    return res.status(500).render('pages/500', { title: 'Server Error' });
  }
});

module.exports = router;
