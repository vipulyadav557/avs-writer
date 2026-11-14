
const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const { pool } = require('../config/database');
const { requireAuth, requireWriter } = require('../middleware/auth');
const Poem = require('../models/Poem');
const User = require('../models/User');
const { uploadProfilePhoto, profileUploadDirectory } = require('../config/profileUpload');
const { uploadPoemFiles, uploadDirectory } = require('../config/poemUpload');

router.use(requireAuth);
router.use(requireWriter);

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function getUserId(req) {
  return req.session.user.id || req.session.user.userId;
}

function parseTags(value) {
  if (!value) return [];

  return [...new Set(
    String(value)
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
  )].slice(0, 20);
}

function getUploadedFile(req, fieldName) {
  return req.files && req.files[fieldName]
    ? req.files[fieldName][0]
    : null;
}

function removeFile(filename) {
  if (!filename) return;

  const safeName = path.basename(filename);
  const filePath = path.join(uploadDirectory, safeName);

  fs.unlink(filePath, error => {
    if (error && error.code !== 'ENOENT') {
      console.error('File cleanup error:', error.message);
    }
  });
}

function cleanupUploadedFiles(req) {
  const image = getUploadedFile(req, 'coverImage');
  const pdf = getUploadedFile(req, 'poemPdf');

  if (image) removeFile(image.filename);
  if (pdf) removeFile(pdf.filename);
}

function validatePoem(body) {
  const errors = [];

  if (!body.title || !body.title.trim()) {
    errors.push({ msg: 'Poem title is required.' });
  } else if (body.title.trim().length > 200) {
    errors.push({ msg: 'Title cannot exceed 200 characters.' });
  }

  if (!body.body || !body.body.trim()) {
    errors.push({ msg: 'Poem content is required.' });
  }

  if (!Poem.categories.includes(body.category)) {
    errors.push({ msg: 'Please select a valid category.' });
  }

  if (!Poem.languages.includes(body.language)) {
    errors.push({ msg: 'Please select a valid language.' });
  }

  if (body.mood && body.mood.length > 50) {
    errors.push({ msg: 'Mood cannot exceed 50 characters.' });
  }

  if (body.author && body.author.length > 100) {
    errors.push({ msg: 'Author name cannot exceed 100 characters.' });
  }

  if (
    body.status &&
    !['draft', 'pending'].includes(body.status)
  ) {
    errors.push({ msg: 'Invalid submission status.' });
  }

  return errors;
}

function renderWritePage(res, options = {}) {
  return res.render('pages/write', {
    title: options.title || 'Writing Studio',
    user: options.user || null,
    poem: options.poem || null,
    errors: options.errors || [],
    dbAvailable: true,
    categories: Poem.categories,
    languages: Poem.languages,
    formAction: options.formAction || '/writer/new',
    isEdit: Boolean(options.isEdit)
  });
}

function getSafeStoredName(filename) {
  if (!filename || typeof filename !== 'string') return null;

  const safeName = path.basename(filename);

  if (safeName !== filename) return null;

  return safeName;
}


// --------------------------------------------------
// Writer Profile Settings
// --------------------------------------------------

router.get('/profile', async (req, res, next) => {
  try {
    const user = await User.findById(getUserId(req));

    if (!user) {
      return res.status(404).render('pages/404', {
        title: 'User Not Found'
      });
    }

    res.render('pages/edit-profile', {
      title: 'Edit Writer Profile',
      user,
      errors: []
    });
  } catch (error) {
    next(error);
  }
});

router.post('/profile', (req, res, next) => {
  uploadProfilePhoto(req, res, async error => {
    if (error) {
      return next(error);
    }

    let uploadedPhoto = req.file ? req.file.filename : null;

    try {
      const name = (req.body.name || '').trim();
      const bio = (req.body.bio || '').trim();

      const errors = [];

      if (!name) {
        errors.push({ msg: 'Writer name is required.' });
      } else if (name.length > 100) {
        errors.push({ msg: 'Name cannot exceed 100 characters.' });
      }

      if (bio.length > 1000) {
        errors.push({ msg: 'Bio cannot exceed 1000 characters.' });
      }

      const user = await User.findById(getUserId(req));

      if (!user) {
        if (uploadedPhoto) {
          fs.unlink(path.join(profileUploadDirectory, uploadedPhoto), () => {});
        }

        return res.status(404).render('pages/404', {
          title: 'User Not Found'
        });
      }

      if (errors.length) {
        if (uploadedPhoto) {
          fs.unlink(path.join(profileUploadDirectory, uploadedPhoto), () => {});
        }

        return res.status(400).render('pages/edit-profile', {
          title: 'Edit Writer Profile',
          user: { ...user, name, bio },
          errors
        });
      }

      const updatedUser = await User.updateProfile(getUserId(req), {
        name,
        bio,
        profile_photo: uploadedPhoto
      });

      if (uploadedPhoto && user.profile_photo) {
        const oldPhoto = path.basename(user.profile_photo);
        const oldPhotoPath = path.join(profileUploadDirectory, oldPhoto);

        fs.unlink(oldPhotoPath, cleanupError => {
          if (cleanupError && cleanupError.code !== 'ENOENT') {
            console.error('Old profile photo cleanup error:', cleanupError.message);
          }
        });
      }

      if (req.session.user) {
        req.session.user.name = updatedUser.name;
      }

      return res.redirect('/writer/profile');
    } catch (error) {
      if (uploadedPhoto) {
        fs.unlink(path.join(profileUploadDirectory, uploadedPhoto), () => {});
      }

      next(error);
    }
  });
});

// --------------------------------------------------
// Writer Dashboard
// --------------------------------------------------

router.get('/', async (req, res, next) => {
  try {
    const userId = getUserId(req);

    const [poemsResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT
           poem_id AS "_id",
           title,
           slug,
           category,
           language,
           status,
           image_mime_type AS "imageMimeType",
           document_mime_type AS "documentMimeType",
           created_at AS "createdAt"
         FROM poems
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      ),

      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'published')::int AS published,
           COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
         FROM poems
         WHERE user_id = $1`,
        [userId]
      )
    ]);

    res.render('pages/writer-dashboard', {
      title: 'Writer Dashboard',
      user: req.session.user,
      poems: poemsResult.rows,
      stats: statsResult.rows[0],
      dbAvailable: true
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// Open New Poem Form
// --------------------------------------------------

router.get('/new', (req, res) => {
  renderWritePage(res, {
    user: req.session.user,
    formAction: '/writer/new'
  });
});

// Old /write URL compatibility
router.get('/write', (req, res) => {
  res.redirect('/writer/new');
});

// --------------------------------------------------
// Create New Poem
// --------------------------------------------------

router.post('/new', (req, res, next) => {
  uploadPoemFiles(req, res, async error => {
    if (error) {
      return next(error);
    }

    try {
      const errors = validatePoem(req.body);

      if (errors.length) {
        cleanupUploadedFiles(req);

        return renderWritePage(res, {
          user: req.session.user,
          errors,
          formAction: '/writer/new'
        });
      }

      const image = getUploadedFile(req, 'coverImage');
      const pdf = getUploadedFile(req, 'poemPdf');

      const status = req.body.status === 'pending'
        ? 'pending'
        : 'draft';

      const poem = await Poem.create({
        userId: getUserId(req),
        title: req.body.title.trim(),
        body: req.body.body.trim(),
        category: req.body.category,
        language: req.body.language,
        mood: (req.body.mood || '').trim(),
        tags: parseTags(req.body.tags),
        author: (req.body.author || req.session.user.name || 'Anonymous').trim(),
        status,

        imageUrl: image ? image.filename : '',
        imageOriginalName: image ? image.originalname : null,
        imageMimeType: image ? image.mimetype : null,
        imageSize: image ? image.size : null,

        documentUrl: pdf ? pdf.filename : null,
        documentOriginalName: pdf ? pdf.originalname : null,
        documentMimeType: pdf ? pdf.mimetype : null,
        documentSize: pdf ? pdf.size : null
      });

      return res.redirect('/writer');
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  });
});

// --------------------------------------------------
// Open Edit Form
// --------------------------------------------------

router.get('/:id/edit', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid poem ID.');
    }

    const poem = await Poem.findById(req.params.id);

    if (!poem || String(poem.userId) !== String(getUserId(req))) {
      return res.status(404).render('pages/404', {
        title: 'Poem Not Found'
      });
    }

    renderWritePage(res, {
      title: 'Edit Poem',
      user: req.session.user,
      poem,
      isEdit: true,
      formAction: `/writer/${poem._id}/edit`
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// Update Existing Poem
// --------------------------------------------------

router.post('/:id/edit', (req, res, next) => {
  uploadPoemFiles(req, res, async error => {
    if (error) {
      return next(error);
    }

    try {
      if (!/^\d+$/.test(req.params.id)) {
        cleanupUploadedFiles(req);
        return res.status(400).send('Invalid poem ID.');
      }

      const poem = await Poem.findById(req.params.id);

      if (!poem || String(poem.userId) !== String(getUserId(req))) {
        cleanupUploadedFiles(req);

        return res.status(404).render('pages/404', {
          title: 'Poem Not Found'
        });
      }

      const errors = validatePoem(req.body);

      if (errors.length) {
        cleanupUploadedFiles(req);

        return renderWritePage(res, {
          title: 'Edit Poem',
          user: req.session.user,
          poem,
          isEdit: true,
          errors,
          formAction: `/writer/${poem._id}/edit`
        });
      }

      const image = getUploadedFile(req, 'coverImage');
      const pdf = getUploadedFile(req, 'poemPdf');

      const removeImage = req.body.removeImage === 'on';
      const removePdf = req.body.removePdf === 'on';

      const updateData = {
        title: req.body.title.trim(),
        body: req.body.body.trim(),
        category: req.body.category,
        language: req.body.language,
        mood: (req.body.mood || '').trim(),
        tags: parseTags(req.body.tags),
        author: (req.body.author || req.session.user.name || 'Anonymous').trim()
      };

      // Preserve existing image unless replaced or removed
      if (image) {
        updateData.imageUrl = image.filename;
        updateData.imageOriginalName = image.originalname;
        updateData.imageMimeType = image.mimetype;
        updateData.imageSize = image.size;
      } else if (removeImage) {
        updateData.imageUrl = '';
        updateData.imageOriginalName = null;
        updateData.imageMimeType = null;
        updateData.imageSize = null;
      }

      // Preserve existing PDF unless replaced or removed
      if (pdf) {
        updateData.documentUrl = pdf.filename;
        updateData.documentOriginalName = pdf.originalname;
        updateData.documentMimeType = pdf.mimetype;
        updateData.documentSize = pdf.size;
      } else if (removePdf) {
        updateData.documentUrl = null;
        updateData.documentOriginalName = null;
        updateData.documentMimeType = null;
        updateData.documentSize = null;
      }

      const requestedStatus = req.body.status === 'pending'
        ? 'pending'
        : 'draft';

      // Published poems edited by their writer must be reviewed again
      if (poem.status === 'published' && requestedStatus === 'pending') {
        updateData.status = 'pending';
      } else {
        updateData.status = requestedStatus;
      }

      const updatedPoem = await Poem.update(req.params.id, updateData);

      if (!updatedPoem) {
        cleanupUploadedFiles(req);
        return res.status(404).send('Poem not found.');
      }

      // Remove replaced/removed old files only after database update
      if (image || removeImage) {
        if (poem.imageMimeType) {
          removeFile(poem.imageUrl);
        }
      }

      if (pdf || removePdf) {
        removeFile(poem.documentUrl);
      }

      return res.redirect('/writer');
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  });
});

// --------------------------------------------------
// Secure Writer Attachment Access
// --------------------------------------------------

router.get('/:id/attachment/:kind', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid poem ID.');
    }

    const poem = await Poem.findById(req.params.id);

    if (!poem || String(poem.userId) !== String(getUserId(req))) {
      return res.status(404).send('Attachment not found.');
    }

    let filename;
    let mimeType;
    let originalName;

    if (req.params.kind === 'image') {
      filename = poem.imageMimeType ? poem.imageUrl : null;
      mimeType = poem.imageMimeType;
      originalName = poem.imageOriginalName;
    } else if (req.params.kind === 'pdf') {
      filename = poem.documentUrl;
      mimeType = poem.documentMimeType;
      originalName = poem.documentOriginalName;
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
    } else {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(originalName || 'poem.pdf')}"`
      );
    }

    res.sendFile(filePath, error => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// Delete Writer's Own Poem
// --------------------------------------------------

router.post('/:id/delete', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid poem ID.');
    }

    const poem = await Poem.findById(req.params.id);

    if (!poem || String(poem.userId) !== String(getUserId(req))) {
      return res.status(404).render('pages/404', {
        title: 'Poem Not Found'
      });
    }

    const deletedPoem = await Poem.deleteById(req.params.id);

    if (deletedPoem) {
      if (poem.imageMimeType) {
        removeFile(poem.imageUrl);
      }

      removeFile(poem.documentUrl);
    }

    res.redirect('/writer');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
