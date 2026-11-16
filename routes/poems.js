
const express = require('express');
const path = require('path');

const router = express.Router();

const { isConnected } = require('../config/database');
const { supabase } = require('../config/supabase');
const Poem = require('../models/Poem');
const site = require('../config/site');

const POEM_BUCKET = 'poems';

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

  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp|pdf)$/i.test(safeName)
  ) {
    return null;
  }

  return safeName;
}

async function sendPoemAttachment(res, filename, mimeType, originalName, kind) {
  const safeName = getSafeStoredName(filename);

  if (!safeName || !mimeType) {
    return res.status(404).send('Attachment not found.');
  }

  const { data, error } = await supabase.storage
    .from(POEM_BUCKET)
    .download(safeName);

  if (error || !data) {
    if (error) {
      console.error('Public poem attachment download error:', error.message);
    }

    return res.status(404).send('Attachment not found.');
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', buffer.length);

  if (kind === 'image') {
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=3600');
  } else {
    const safeOriginalName = path.basename(
      originalName || 'poem.pdf'
    ).replace(/["\\\r\n]/g, '_');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(safeOriginalName)}`
    );

    res.setHeader('Cache-Control', 'private, no-store');
  }

  return res.send(buffer);
}

// --------------------------------------------------
// Poetry Library
// --------------------------------------------------

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

// --------------------------------------------------
// Secure Public Attachment Delivery
// Only published poems can be accessed
// --------------------------------------------------

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

    return await sendPoemAttachment(
      res,
      filename,
      mimeType,
      originalName,
      req.params.kind
    );

  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// Single Published Poem
// --------------------------------------------------

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

// --------------------------------------------------
// Public routes cannot modify poems
// --------------------------------------------------

router.post('/', denyWrites);
router.put('/:slug', denyWrites);
router.patch('/:slug/publish', denyWrites);
router.patch('/:slug/unpublish', denyWrites);
router.delete('/:slug', denyWrites);

module.exports = router;
