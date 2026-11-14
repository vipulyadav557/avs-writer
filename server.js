
require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const multer = require('multer');

const { connectDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});

app.use(limiter);

app.use(session({
  secret: process.env.SESSION_SECRET || 'avs-writer-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true
  }
}));

const { currentUser } = require('./middleware/auth');
app.use(currentUser);

const site = require('./config/site');

const poemRoutes = require('./routes/poems');
const bookRoutes = require('./routes/books');
const contactRoutes = require('./routes/contact');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const writerRoutes = require('./routes/writer');
const authorRoutes = require('./routes/authors');

const samplePoems = require('./data/samples');

app.get('/', async (req, res, next) => {
  try {
    const Poem = require('./models/Poem');
    const homepagePoems = await Poem.findHomepage();

    res.render('pages/index', {
      title: 'AVS Writer',
      featuredPoems: homepagePoems.featured,
      latestPoems: homepagePoems.latest,
      bannerUrl: site.poetryBannerUrl
    });
  } catch (error) {
    console.error('HOMEPAGE ERR', error);
    next(error);
  }
});

app.use('/poems', poemRoutes);

app.get('/poetry', (req, res) => {
  res.redirect('/poems');
});

app.use('/books', bookRoutes);

app.get('/book', (req, res) => {
  res.redirect('/books');
});

app.use('/writer', writerRoutes);
app.use('/contact', contactRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/writer', writerRoutes);
app.use('/author', authorRoutes);

app.use((req, res) => {
  res.status(404).render('pages/404', {
    title: 'Not Found'
  });
});

// Upload and server error handling
app.use((err, req, res, next) => {
  console.error(err);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).send('Each uploaded file must not exceed 10 MB.');
    }

    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).send('Invalid number of uploaded files.');
    }

    return res.status(400).send('File upload failed. Please check your files.');
  }

  if (
    err.message ===
    'Only JPG, JPEG, PNG, WEBP and PDF files are allowed.'
  ) {
    return res.status(400).send(err.message);
  }

  res.status(500).render('pages/500', {
    title: 'Server Error'
  });
});

connectDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AVS Writer running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Server startup failed:', error);
    process.exit(1);
  });
