
const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const { isConnected } = require('../config/database');
const Poem = require('../models/Poem');
const { uploadDirectory } = require('../config/poemUpload');
const site = require('../config/site');

function denyWrites(req, res) {
  return res.status(403).send(
    'Public poem publishing is disabled. Please use your Writer account.'
  );
}

function getSafeStoredName(filename) {
  if (!filename || typeof filename !== 'string') {
    return null;
  }

  const safeName = path.basename(filename);

  if (safeName !== filename) {
    return null;
  }

  return safeName;
}

// Poetry Library
router.get('/', async (req, res) => {
  if (!isConnected()) {
    return res.render('pages/poetry', {
      title: 'Poetry Library',
      poems: [],
      query: req.query.q || '',
      dbAvailable: false,
      errors: [],
      bannerUrl: site.poetryBannerUrl
    });
  }

  try {
    const q = (req.query.q || '').trim();
    const category = req.query.category || '';
    const language = req.query.language || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const result = await Poem.findPublished({
      q,
      category,
      language,
      page
    });

    res.render('pages/poetry', {
      title: 'Poetry Library',
      poems: result.poems,
      query: q,
      dbAvailable: true,
      errors: [],
      page: result.page,
      total: result.total,
      limit: result.limit,
      bannerUrl: site.poetryBannerUrl
    });

  } catch (error) {
    console.error('POETRY LIST ERROR:', error);

    res.status(500).render('pages/500', {
      title: 'Server Error'
    });
  }
});

// Secure public attachment delivery.
// Only published poems can be accessed here.
router.get('/:slug/attachment/:kind', async (req, res, next) => {
  try {
    const poem = await Poem.findOnePublished(req.params.slug);

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

    if (!safeName || !mimeType) {
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
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else {
      const safeOriginalName = path.basename(
        originalName || 'poem.pdf'
      ).replace(/["\\\r\n]/g, '_');

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeOriginalName}"`
      );

      res.setHeader('Cache-Control', 'private, no-store');
    }

    res.sendFile(filePath, error => {
      if (error && !res.headersSent) {
        next(error);
      }
    });

  } catch (error) {
    next(error);
  }
});

// Single published poem
router.get('/:slug', async (req, res) => {
  if (!isConnected()) {
    return res.status(503).render('pages/500', {
      title: 'Server Error'
    });
  }

  try {
    const poem = await Poem.findOnePublished(req.params.slug);

    if (!poem) {
      return res.status(404).render('pages/404', {
        title: 'Not Found'
      });
    }

    res.render('pages/poem', {
      title: poem.title,
      poem
    });

  } catch (error) {
    console.error('SINGLE POEM ERROR:', error);

    res.status(500).render('pages/500', {
      title: 'Server Error'
    });
  }
});

// Public routes cannot create, edit, publish or delete poems.
router.post('/', denyWrites);
router.put('/:slug', denyWrites);
router.patch('/:slug/publish', denyWrites);
router.patch('/:slug/unpublish', denyWrites);
router.delete('/:slug', denyWrites);

module.exports = router;
