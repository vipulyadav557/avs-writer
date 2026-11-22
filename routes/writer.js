const express = require('express');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const { pool } = require('../config/database');
const { requireAuth, requireWriter } = require('../middleware/auth');
const Poem = require('../models/Poem');
const User = require('../models/User');
const { uploadProfilePhoto } = require('../config/profileUpload');
const { supabase } = require('../config/supabase');
const { uploadPoemFiles } = require('../config/poemUpload');
const { notifyAdmin } = require('../services/adminNotificationService');

const POEM_BUCKET = 'poems';
const PROFILE_BUCKET = 'profiles';

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

// Validate stored Supabase filenames
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

// Upload one file to private Supabase bucket
async function uploadPoemFile(file) {
  if (!file) return null;

  const extension = path.extname(file.originalname).toLowerCase();
  const filename = `${crypto.randomUUID()}${extension}`;

  const { error } = await supabase.storage
    .from(POEM_BUCKET)
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    throw new Error(`Poem file upload failed: ${error.message}`);
  }

  return {
    filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size
  };
}

// Upload selected poem files and clean up partial uploads on failure
async function uploadPoemAttachments(req) {
  const image = getUploadedFile(req, 'coverImage');
  const pdf = getUploadedFile(req, 'poemPdf');

  const uploaded = {
    image: null,
    pdf: null
  };

  try {
    if (image) {
      uploaded.image = await uploadPoemFile(image);
    }

    if (pdf) {
      uploaded.pdf = await uploadPoemFile(pdf);
    }

    return uploaded;
  } catch (error) {
    const filenames = [
      uploaded.image?.filename,
      uploaded.pdf?.filename
    ].filter(Boolean);

    if (filenames.length) {
      const { error: cleanupError } = await supabase.storage
        .from(POEM_BUCKET)
        .remove(filenames);

      if (cleanupError) {
        console.error(
          'Partial poem upload cleanup error:',
          cleanupError.message
        );
      }
    }

    throw error;
  }
}

// Remove files from private Supabase bucket
async function removePoemFiles(filenames) {
  const safeNames = filenames
    .map(getSafeStoredName)
    .filter(Boolean);

  if (!safeNames.length) return;

  const { error } = await supabase.storage
    .from(POEM_BUCKET)
    .remove([...new Set(safeNames)]);

  if (error) {
    console.error('Poem storage cleanup error:', error.message);
  }
}

// Download a private Supabase file and send it to the browser
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
      console.error('Poem download error:', error.message);
    }

    return res.status(404).send('Attachment not found.');
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store');

  if (kind === 'image') {
    res.setHeader('Content-Disposition', 'inline');
  } else {
    const safeOriginalName = path.basename(
      originalName || 'poem.pdf'
    ).replace(/["\\\r\n]/g, '_');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(safeOriginalName)}`
    );
  }

  return res.send(buffer);
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

    let uploadedPhoto = null;

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
        return res.status(404).render('pages/404', {
          title: 'User Not Found'
        });
      }

      if (errors.length) {
        return res.status(400).render('pages/edit-profile', {
          title: 'Edit Writer Profile',
          user: { ...user, name, bio },
          errors
        });
      }

      if (req.file) {
        const extension = path.extname(
          req.file.originalname
        ).toLowerCase();

        uploadedPhoto = `${crypto.randomUUID()}${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(PROFILE_BUCKET)
          .upload(uploadedPhoto, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
          });

        if (uploadError) {
          throw new Error(
            `Profile photo upload failed: ${uploadError.message}`
          );
        }
      }

      let updatedUser;

      try {
        updatedUser = await User.updateProfile(getUserId(req), {
          name,
          bio,
          profile_photo: uploadedPhoto
        });
      } catch (databaseError) {
        if (uploadedPhoto) {
          await supabase.storage
            .from(PROFILE_BUCKET)
            .remove([uploadedPhoto]);
          uploadedPhoto = null;
        }

        throw databaseError;
      }

      if (!updatedUser) {
        if (uploadedPhoto) {
          await supabase.storage
            .from(PROFILE_BUCKET)
            .remove([uploadedPhoto]);
          uploadedPhoto = null;
        }

        throw new Error('Unable to update writer profile.');
      }

      if (uploadedPhoto && user.profile_photo) {
        const oldPhoto = path.basename(user.profile_photo);

        if (
          /^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(oldPhoto) &&
          oldPhoto !== uploadedPhoto
        ) {
          const { error: deleteError } = await supabase.storage
            .from(PROFILE_BUCKET)
            .remove([oldPhoto]);

          if (deleteError) {
            console.error(
              'Old profile photo cleanup error:',
              deleteError.message
            );
          }
        }
      }

      uploadedPhoto = null;

      if (req.session.user) {
        req.session.user.name = updatedUser.name;
      }

      return res.redirect('/writer/profile');

    } catch (error) {
      console.error('Writer profile update error:', error);

      if (uploadedPhoto) {
        const { error: cleanupError } = await supabase.storage
          .from(PROFILE_BUCKET)
          .remove([uploadedPhoto]);

        if (cleanupError) {
          console.error(
            'Profile photo cleanup error:',
            cleanupError.message
          );
        }
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

    let uploaded = {
      image: null,
      pdf: null
    };

    try {
      const errors = validatePoem(req.body);

      if (errors.length) {
        return renderWritePage(res, {
          user: req.session.user,
          errors,
          formAction: '/writer/new'
        });
      }

      uploaded = await uploadPoemAttachments(req);

      const status = req.body.status === 'pending'
        ? 'pending'
        : 'draft';

      await Poem.create({
        userId: getUserId(req),
        title: req.body.title.trim(),
        body: req.body.body.trim(),
        category: req.body.category,
        language: req.body.language,
        mood: (req.body.mood || '').trim(),
        tags: parseTags(req.body.tags),
        author: (req.body.author || req.session.user.name || 'Anonymous').trim(),
        status,

        imageUrl: uploaded.image ? uploaded.image.filename : '',
        imageOriginalName: uploaded.image ? uploaded.image.originalName : null,
        imageMimeType: uploaded.image ? uploaded.image.mimeType : null,
        imageSize: uploaded.image ? uploaded.image.size : null,

        documentUrl: uploaded.pdf ? uploaded.pdf.filename : null,
        documentOriginalName: uploaded.pdf ? uploaded.pdf.originalName : null,
        documentMimeType: uploaded.pdf ? uploaded.pdf.mimeType : null,
        documentSize: uploaded.pdf ? uploaded.pdf.size : null
      });

      // Notify admin only when a poem is submitted for approval.
      if (status === 'pending') {
        void notifyAdmin({
          eventType: 'poem_submitted',
          title: 'New Poem Submitted for Approval',
          message: `${req.session.user.name} submitted "${req.body.title.trim()}" for approval.`,
          targetUrl: '/admin',
          metadata: {
            userId: getUserId(req),
            writerName: req.session.user.name,
            poemTitle: req.body.title.trim(),
            category: req.body.category,
            language: req.body.language
          }
        }).catch(notificationError => {
          console.error('POEM SUBMISSION NOTIFICATION ERROR:', notificationError);
        });
      }

      uploaded = { image: null, pdf: null };

      return res.redirect('/writer');
    } catch (error) {
      await removePoemFiles([
        uploaded.image?.filename,
        uploaded.pdf?.filename
      ]);

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

    let uploaded = {
      image: null,
      pdf: null
    };

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

      const errors = validatePoem(req.body);

      if (errors.length) {
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

      uploaded = await uploadPoemAttachments(req);

      const updateData = {
        title: req.body.title.trim(),
        body: req.body.body.trim(),
        category: req.body.category,
        language: req.body.language,
        mood: (req.body.mood || '').trim(),
        tags: parseTags(req.body.tags),
        author: (req.body.author || req.session.user.name || 'Anonymous').trim()
      };

      if (image) {
        updateData.imageUrl = uploaded.image.filename;
        updateData.imageOriginalName = uploaded.image.originalName;
        updateData.imageMimeType = uploaded.image.mimeType;
        updateData.imageSize = uploaded.image.size;
      } else if (removeImage) {
        updateData.imageUrl = '';
        updateData.imageOriginalName = null;
        updateData.imageMimeType = null;
        updateData.imageSize = null;
      }

      if (pdf) {
        updateData.documentUrl = uploaded.pdf.filename;
        updateData.documentOriginalName = uploaded.pdf.originalName;
        updateData.documentMimeType = uploaded.pdf.mimeType;
        updateData.documentSize = uploaded.pdf.size;
      } else if (removePdf) {
        updateData.documentUrl = null;
        updateData.documentOriginalName = null;
        updateData.documentMimeType = null;
        updateData.documentSize = null;
      }

      const requestedStatus = req.body.status === 'pending'
        ? 'pending'
        : 'draft';

      if (poem.status === 'published' && requestedStatus === 'pending') {
        updateData.status = 'pending';
      } else {
        updateData.status = requestedStatus;
      }

      const updatedPoem = await Poem.update(req.params.id, updateData);

      if (!updatedPoem) {
        throw new Error('Poem not found or could not be updated.');
      }

      const oldFilesToRemove = [];

      if (image || removeImage) {
        if (poem.imageUrl) {
          oldFilesToRemove.push(poem.imageUrl);
        }
      }

      if (pdf || removePdf) {
        if (poem.documentUrl) {
          oldFilesToRemove.push(poem.documentUrl);
        }
      }

      // Database update succeeded: old files can now be removed
      await removePoemFiles(oldFilesToRemove);

      uploaded = { image: null, pdf: null };

      return res.redirect('/writer');

    } catch (error) {
      await removePoemFiles([
        uploaded.image?.filename,
        uploaded.pdf?.filename
      ]);

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
      await removePoemFiles([
        poem.imageUrl,
        poem.documentUrl
      ]);
    }

    return res.redirect('/writer');

  } catch (error) {
    next(error);
  }
});

module.exports = router;