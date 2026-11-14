
const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const { requireAuth, requireAdmin } = require('../middleware/auth');
const { pool, isConnected } = require('../config/database');
const Contact = require('../models/Contact');
const Poem = require('../models/Poem');
const { uploadDirectory } = require('../config/poemUpload');

router.use(requireAuth);
router.use(requireAdmin);

function removeFile(filename) {
  if (!filename || typeof filename !== 'string') return;

  const safeName = path.basename(filename);

  if (safeName !== filename) return;

  const filePath = path.join(uploadDirectory, safeName);

  fs.unlink(filePath, error => {
    if (error && error.code !== 'ENOENT') {
      console.error('File cleanup error:', error.message);
    }
  });
}

function getSafeStoredName(filename) {
  if (!filename || typeof filename !== 'string') return null;

  const safeName = path.basename(filename);

  return safeName === filename ? safeName : null;
}

// Admin Dashboard
router.get('/', async (req, res) => {
  if (!isConnected()) {
    return res.render('pages/admin', {
      title: 'Admin Dashboard',
      user: req.session.user,
      dbAvailable: false,
      stats: {
        poems: 0,
        pending: 0,
        books: 0,
        contacts: 0,
        users: 0
      },
      poems: [],
      books: [],
      contacts: [],
      error: 'Database not configured.'
    });
  }

  try {
    const [
      poemsResult,
      booksResult,
      contactsResult,
      poemCount,
      pendingCount,
      bookCount,
      contactCount,
      userCount
    ] = await Promise.all([
      pool.query(`
        SELECT
          poem_id AS "poemId",
          user_id AS "userId",
          title,
          slug,
          category,
          language,
          author,
          status,
          is_featured AS "isFeatured",
          image_url AS "imageUrl",
          image_mime_type AS "imageMimeType",
          document_url AS "documentUrl",
          document_mime_type AS "documentMimeType",
          created_at AS "createdAt"
        FROM poems
        ORDER BY created_at DESC
        LIMIT 50
      `),

      pool.query(`
        SELECT *
        FROM books
        ORDER BY created_at DESC
        LIMIT 10
      `),

      pool.query(`
        SELECT *,
          message_id AS "messageId",
          is_read AS "isRead",
          created_at AS "createdAt"
        FROM contact_messages
        ORDER BY created_at DESC
        LIMIT 10
      `),

      pool.query('SELECT COUNT(*) FROM poems'),

      pool.query(`
        SELECT COUNT(*)
        FROM poems
        WHERE status = 'pending'
      `),

      pool.query('SELECT COUNT(*) FROM books'),
      pool.query('SELECT COUNT(*) FROM contact_messages'),
      pool.query('SELECT COUNT(*) FROM users')
    ]);

    res.render('pages/admin', {
      title: 'Admin Dashboard',
      user: req.session.user,
      dbAvailable: true,

      stats: {
        poems: Number(poemCount.rows[0].count),
        pending: Number(pendingCount.rows[0].count),
        books: Number(bookCount.rows[0].count),
        contacts: Number(contactCount.rows[0].count),
        users: Number(userCount.rows[0].count)
      },

      poems: poemsResult.rows,
      books: booksResult.rows,
      contacts: contactsResult.rows,
      error: null
    });

  } catch (error) {
    console.error('Admin error:', error);

    res.status(500).render('pages/500', {
      title: 'Server Error'
    });
  }
});

// Secure Admin attachment access
router.get('/poems/:id/attachment/:kind', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid poem ID.');
    }

    const poem = await Poem.findById(req.params.id);

    if (!poem) {
      return res.status(404).send('Attachment not found.');
    }

    let filename;
    let mimeType;
    let originalName;

    if (req.params.kind === 'image') {
      filename = poem.imageMimeType ? poem.imageUrl : null;
      mimeType = poem.imageMimeType;
      originalName = poem.imageOriginalName;

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        return res.status(404).send('Image not found.');
      }

    } else if (req.params.kind === 'pdf') {
      filename = poem.documentUrl;
      mimeType = poem.documentMimeType;
      originalName = poem.documentOriginalName;

      if (mimeType !== 'application/pdf') {
        return res.status(404).send('PDF not found.');
      }

    } else {
      return res.status(404).send('Attachment not found.');
    }

    const safeName = getSafeStoredName(filename);

    if (!safeName) {
      return res.status(404).send('Attachment not found.');
    }

    const filePath = path.join(uploadDirectory, safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found.');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', mimeType);

    if (req.params.kind === 'image') {
      res.setHeader('Content-Disposition', 'inline');
    } else {
      const safeOriginalName = path.basename(
        originalName || 'poem.pdf'
      ).replace(/["\\\r\n]/g, '_');

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeOriginalName}"`
      );
    }

    res.setHeader('Cache-Control', 'private, no-store');

    res.sendFile(filePath, error => {
      if (error && !res.headersSent) next(error);
    });

  } catch (error) {
    next(error);
  }
});

// Add new poem
router.post('/poems/add', async (req, res) => {
  try {
    const {
      title,
      body,
      category,
      language,
      mood,
      tags,
      author,
      imageUrl,
      status
    } = req.body;

    if (
      !title?.trim() ||
      !body?.trim() ||
      !Poem.categories.includes(category) ||
      !Poem.languages.includes(language)
    ) {
      return res.status(400).send('Please provide valid poem details.');
    }

    await Poem.create({
      userId: req.session.user.id || req.session.user.userId || null,
      title,
      body,
      category,
      language,
      mood,
      tags: tags
        ? tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 20)
        : [],
      author: author || 'AVS Writer',
      imageUrl: imageUrl || '',
      status: ['draft', 'pending', 'published'].includes(status)
        ? status
        : 'draft'
    });

    res.redirect('/admin');

  } catch (error) {
    console.error('Add poem error:', error);
    res.status(500).send('Unable to add poem.');
  }
});

// Edit existing poem
router.post('/poems/:id/edit', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid poem ID.');
    }

    const {
      title,
      body,
      category,
      language,
      mood,
      tags,
      author,
      imageUrl
    } = req.body;

    if (
      !title?.trim() ||
      !body?.trim() ||
      !Poem.categories.includes(category) ||
      !Poem.languages.includes(language)
    ) {
      return res.status(400).send('Please provide valid poem details.');
    }

    await Poem.update(req.params.id, {
      title,
      body,
      category,
      language,
      mood,
      tags: tags
        ? tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 20)
        : [],
      author,
      imageUrl: imageUrl || '',
      imageOriginalName: null,
      imageMimeType: null,
      imageSize: null
    });

    res.redirect('/admin');

  } catch (error) {
    console.error('Edit poem error:', error);
    res.status(500).send('Unable to edit poem.');
  }
});
// Feature or unfeature a published poem
router.post('/poems/:id/featured', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid poem ID.');
    }

    const featured = req.body.featured === 'true';

    const poem = await Poem.setFeatured(req.params.id, featured);

    if (!poem) {
      return res.status(404).send('Published poem not found.');
    }

    res.redirect('/admin');
  } catch (error) {
    console.error('Featured poem error:', error);
    res.status(400).send(error.message);
  }
});

// Approve, reject, publish or move to draft
router.post('/poems/:id/status', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid poem ID.');
    }

    const { status } = req.body;

    if (!['draft', 'pending', 'published', 'rejected'].includes(status)) {
      return res.status(400).send('Invalid poem status.');
    }

    await Poem.updateStatus(req.params.id, status);

    res.redirect('/admin');

  } catch (error) {
    console.error('Poem status update error:', error);
    res.status(500).send('Unable to update poem status.');
  }
});

// Delete poem
router.post('/poems/:id/delete', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid poem ID.');
    }

    const poem = await Poem.findById(req.params.id);

    if (!poem) {
      return res.redirect('/admin');
    }

    const deletedPoem = await Poem.deleteById(req.params.id);

    if (deletedPoem) {
      if (poem.imageMimeType) {
        removeFile(poem.imageUrl);
      }

      removeFile(poem.documentUrl);
    }

    res.redirect('/admin');

  } catch (error) {
    console.error('Delete poem error:', error);
    res.status(500).send('Unable to delete poem.');
  }
});

// Contact routes
router.post('/contacts/:id/read', async (req, res) => {
  try {
    await Contact.markAsRead(req.params.id);
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    res.status(500).send('Unable to update contact.');
  }
});

router.post('/contacts/:id/replied', async (req, res) => {
  try {
    await Contact.markAsReplied(req.params.id);
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    res.status(500).send('Unable to update contact.');
  }
});

router.post('/contacts/:id/delete', async (req, res) => {
  try {
    await Contact.deleteById(req.params.id);
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    res.status(500).send('Unable to delete contact.');
  }
});

module.exports = router;
