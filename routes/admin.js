

const express = require('express');

const path = require('path');

const crypto = require('crypto');



const router = express.Router();



const { requireAuth, requireAdmin } = require('../middleware/auth');

const { pool, isConnected } = require('../config/database');

const { supabase } = require('../config/supabase');

const Contact = require('../models/Contact');

const Poem = require('../models/Poem');

const Book = require('../models/Book');



const { upload: bookUpload } = require('../config/bookUpload');



const POEM_BUCKET = 'poems';



router.use(requireAuth);

router.use(requireAdmin);



// --------------------------------------------------

// Common file helpers

// --------------------------------------------------



function getSafeStoredName(filename) {

  if (!filename || typeof filename !== 'string') return null;



  const safeName = path.basename(filename);



  if (safeName !== filename) return null;



  return safeName;

}



// Validate UUID-based poem storage filenames

function getSafePoemStoredName(filename) {

  const safeName = getSafeStoredName(filename);



  if (

    !safeName ||

    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp|pdf)$/i.test(safeName)

  ) {

    return null;

  }



  return safeName;

}



// Remove poem attachments from private Supabase bucket

async function removePoemFiles(filenames) {

  const safeNames = filenames

    .map(getSafePoemStoredName)

    .filter(Boolean);



  if (!safeNames.length) return;



  const { error } = await supabase.storage

    .from(POEM_BUCKET)

    .remove([...new Set(safeNames)]);



  if (error) {

    console.error('Poem file cleanup error:', error.message);

  }

}



// Send private Supabase poem attachment

async function sendPoemAttachment(res, filename, mimeType, originalName, kind) {

  const safeName = getSafePoemStoredName(filename);



  if (!safeName || !mimeType) {

    return res.status(404).send('Attachment not found.');

  }



  const { data, error } = await supabase.storage

    .from(POEM_BUCKET)

    .download(safeName);



  if (error || !data) {

    if (error) {

      console.error('Admin poem attachment download error:', error.message);

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

// Book files are stored in the private Supabase bucket.
const BOOK_BUCKET = 'books';

function getSafeBookStoredName(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const safeName = path.basename(filename);
  if (safeName !== filename) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$/i.test(safeName)
    ? safeName
    : null;
}

function bookFileExtension(file, kind) {
  if (kind === 'cover') {
    return ({
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp'
    })[file.mimetype] || null;
  }
  return file.mimetype === 'application/pdf' ? '.pdf' : null;
}

async function uploadBookFile(file, kind) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new Error(`Invalid ${kind} upload.`);
  }
  const extension = bookFileExtension(file, kind);
  if (!extension) {
    throw new Error(kind === 'cover'
      ? 'Cover must be JPG, PNG or WebP.'
      : 'Book document must be a PDF.');
  }

  const filename = `${crypto.randomUUID()}${extension}`;
  const { error } = await supabase.storage.from(BOOK_BUCKET).upload(
    filename,
    file.buffer,
    { contentType: file.mimetype, upsert: false }
  );
  if (error) throw new Error(`Unable to upload book ${kind}: ${error.message}`);
  return filename;
}

async function removeBookFiles(filenames) {
  const safeNames = [...new Set(
    (filenames || []).map(getSafeBookStoredName).filter(Boolean)
  )];
  if (!safeNames.length) return;

  const { error } = await supabase.storage.from(BOOK_BUCKET).remove(safeNames);
  if (error) console.error('Book file cleanup error:', error.message);
}

async function sendBookFile(res, filename, kind, options = {}) {
  const safeName = getSafeBookStoredName(filename);
  if (!safeName) return res.status(404).send('Book file not found.');

  const { data, error } = await supabase.storage.from(BOOK_BUCKET).download(safeName);
  if (error || !data) {
    if (error) console.error('Book file download error:', error.message);
    return res.status(404).send('Book file not found.');
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
  res.setHeader('Cache-Control', options.private ? 'private, no-store' : 'public, max-age=3600');
  if (kind === 'pdf') {
    res.setHeader('Content-Disposition', `${options.download ? 'attachment' : 'inline'}; filename="book.pdf"`);
  } else {
    res.setHeader('Content-Disposition', 'inline');
  }
  return res.send(buffer);
}

function handleBookUpload(req, res, next) {
  bookUpload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'pdf', maxCount: 1 }
  ])(req, res, error => {
    if (error) return next(error);
    return next();
  });
}

function getBookCategories(value) {

  if (Array.isArray(value)) {

    return value.map(item => String(item).trim()).filter(Boolean);

  }



  if (!value) return [];



  return String(value)

    .split(/\r?\n|,/)

    .map(item => item.trim())

    .filter(Boolean);

}







// --------------------------------------------------

// Admin Dashboard

// --------------------------------------------------



router.get('/', async (req, res) => {

  const bookPage = Math.max(1, Number.parseInt(req.query.bookPage, 10) || 1);
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
      bookPagination: { page: 1, totalPages: 0, total: 0 },

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



      Book.findAllAdmin(bookPage),



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

      books: booksResult.books,
      bookPagination: {
        page: booksResult.page,
        totalPages: booksResult.totalPages,
        total: booksResult.total
      },

      contacts: contactsResult.rows,

      error: null

    });



  } catch (error) {

    console.error('Admin dashboard error:', error);



    res.status(500).render('pages/500', {

      title: 'Server Error'

    });

  }

});



// --------------------------------------------------

// Secure Admin poem attachment access

// --------------------------------------------------



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

// Add new poem

// --------------------------------------------------



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



// --------------------------------------------------

// Edit existing poem

// --------------------------------------------------



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



// --------------------------------------------------

// Feature or unfeature a published poem

// --------------------------------------------------



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



// --------------------------------------------------

// Update poem status

// --------------------------------------------------



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



// --------------------------------------------------

// Delete poem

// --------------------------------------------------



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

      await removePoemFiles([

        poem.imageUrl,

        poem.documentUrl

      ]);

    }



    res.redirect('/admin');



  } catch (error) {

    console.error('Delete poem error:', error);

    res.status(500).send('Unable to delete poem.');

  }

});



// --------------------------------------------------

// --------------------------------------------------
// BOOK MANAGEMENT - Supabase private storage
// --------------------------------------------------

// Add new book
router.post('/books/add', handleBookUpload, async (req, res) => {
  const uploadedNames = [];
  let databaseSaved = false;

  try {
    const {
      title, subtitle, author, description, language, categories,
      isbn, publisher, publishedDate, pages, price,
      tableOfContents, whatReadersLearn, authorIntro, status
    } = req.body;

    const uploadedCover = req.files?.cover?.[0];
    const uploadedPdf = req.files?.pdf?.[0];

    if (!title?.trim()) return res.status(400).send('Book title is required.');
    if (!Book.languages.includes(language)) {
      return res.status(400).send('Please select a valid book language.');
    }

    const selectedCategories = getBookCategories(categories);
    if (!selectedCategories.length ||
        selectedCategories.some(category => !Book.categories.includes(category))) {
      return res.status(400).send('Please select valid book categories.');
    }
    if (!uploadedPdf) return res.status(400).send('Please upload the book PDF.');

    const safeStatus = ['draft', 'published'].includes(status) ? status : 'draft';

    let coverName = '';
    if (uploadedCover) {
      coverName = await uploadBookFile(uploadedCover, 'cover');
      uploadedNames.push(coverName);
    }

    const pdfName = await uploadBookFile(uploadedPdf, 'pdf');
    uploadedNames.push(pdfName);

    await Book.createBook({
      title, subtitle, author, description, language,
      categories: selectedCategories,
      coverUrl: coverName,
      pdfUrl: pdfName,
      pdfPath: pdfName,
      isbn, publisher, publishedDate, pages, price,
      tableOfContents, whatReadersLearn, authorIntro,
      status: safeStatus
    });

    databaseSaved = true;
    return res.redirect('/admin');
  } catch (error) {
    if (!databaseSaved) await removeBookFiles(uploadedNames);
    console.error('Add book error:', error);
    return res.status(500).send('Unable to add book.');
  }
});

// Edit book details and optionally replace files
router.post('/books/:id/edit', handleBookUpload, async (req, res) => {
  const uploadedNames = [];
  let databaseSaved = false;

  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).send('Invalid book ID.');
    }

    const existing = await Book.findById(req.params.id);
    if (!existing) return res.status(404).send('Book not found.');

    const {
      title, subtitle, author, description, language, categories,
      isbn, publisher, publishedDate, pages, price,
      tableOfContents, whatReadersLearn, authorIntro, status
    } = req.body;

    if (!title?.trim() || !Book.languages.includes(language)) {
      return res.status(400).send('Please provide a valid title and language.');
    }

    const selectedCategories = getBookCategories(categories);
    if (!selectedCategories.length ||
        selectedCategories.some(category => !Book.categories.includes(category))) {
      return res.status(400).send('Please select valid book categories.');
    }

    const uploadedCover = req.files?.cover?.[0];
    const uploadedPdf = req.files?.pdf?.[0];
    let newCoverName;
    let newPdfName;

    if (uploadedCover) {
      newCoverName = await uploadBookFile(uploadedCover, 'cover');
      uploadedNames.push(newCoverName);
    }
    if (uploadedPdf) {
      newPdfName = await uploadBookFile(uploadedPdf, 'pdf');
      uploadedNames.push(newPdfName);
    }

    const updated = await Book.updateBook(req.params.id, {
      title, subtitle, author, description, language,
      categories: selectedCategories,
      coverUrl: newCoverName,
      pdfUrl: newPdfName,
      pdfPath: newPdfName,
      isbn, publisher, publishedDate, pages, price,
      tableOfContents, whatReadersLearn, authorIntro,
      status: ['draft', 'published'].includes(status) ? status : 'draft'
    });

    if (!updated) {
      await removeBookFiles(uploadedNames);
      return res.status(404).send('Book not found.');
    }

    databaseSaved = true;
    const oldFiles = [];
    if (uploadedCover && existing.coverUrl) oldFiles.push(existing.coverUrl);
    if (uploadedPdf) oldFiles.push(existing.pdfPath || existing.pdfUrl);
    await removeBookFiles(oldFiles);

    return res.redirect('/admin');
  } catch (error) {
    if (!databaseSaved) await removeBookFiles(uploadedNames);
    console.error('Edit book error:', error);
    return res.status(500).send('Unable to update book.');
  }
});

// Publish or unpublish book
router.post('/books/:id/status', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).send('Invalid book ID.');
    const { status } = req.body;
    if (!['draft', 'published'].includes(status)) {
      return res.status(400).send('Invalid book status.');
    }

    const book = await Book.updateStatus(req.params.id, status);
    if (!book) return res.status(404).send('Book not found.');
    return res.redirect('/admin');
  } catch (error) {
    console.error('Book status update error:', error);
    return res.status(500).send('Unable to update book status.');
  }
});

// Secure Admin-only book file preview
router.get('/books/:id/file/:kind', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).send('Invalid book ID.');
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).send('Book not found.');

    if (req.params.kind === 'cover') {
      if (!book.coverUrl) return res.status(404).send('Cover not found.');
      return await sendBookFile(res, book.coverUrl, 'cover', { private: true });
    }

    if (req.params.kind === 'pdf') {
      const filename = book.pdfPath || book.pdfUrl;
      if (!filename) return res.status(404).send('PDF not found.');
      return await sendBookFile(res, filename, 'pdf', { private: true });
    }

    return res.status(404).send('File not found.');
  } catch (error) {
    next(error);
  }
});

// Delete book and its uploaded files
router.post('/books/:id/delete', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).send('Invalid book ID.');
    const book = await Book.findById(req.params.id);
    if (!book) return res.redirect('/admin');

    const deletedBook = await Book.deleteBook(req.params.id);
    if (deletedBook) {
      await removeBookFiles([book.coverUrl, book.pdfPath || book.pdfUrl]);
    }

    return res.redirect('/admin');
  } catch (error) {
    console.error('Delete book error:', error);
    return res.status(500).send('Unable to delete book.');
  }
});

// Contact Messages

// --------------------------------------------------



router.get('/contacts/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(404).send('Contact message not found.');
    }

    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).send('Contact message not found.');
    }

    return res.render('pages/admin-contact-view', {
      title: 'Contact Message',
      user: req.session.user,
      contact
    });
  } catch (error) {
    console.error('Admin contact view error:', error);
    return res.status(500).send('Unable to open contact message.');
  }
});
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
