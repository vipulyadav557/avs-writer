
require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const multer = require('multer');

const { pool, connectDatabase } = require('./config/database');

const app = express();

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing.');
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase environment variables are missing.');
}

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured in production.');
}

const sessionSecret =
  process.env.SESSION_SECRET ||
  'avs-writer-local-development-secret';

if (isProduction) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    reportOnly: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      styleSrcAttr: ["'none'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", "blob:", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests:
        process.env.NODE_ENV === 'production' ? [] : null
    }
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '1mb'
}));

app.use(express.json({
  limit: '1mb'
}));

app.use(express.static(
  path.join(__dirname, 'public')
));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// PostgreSQL session storage
const sessionStore = new PgSession({
  pool,
  tableName: 'user_sessions',
  createTableIfMissing: true,
  pruneSessionInterval: 15 * 60
});

app.use(session({
  store: sessionStore,
  name: 'avs.writer.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  }
}));

// CSRF protection
const {
  issueCsrfToken,
  verifyCsrfToken
} = require('./middleware/csrf');

app.use(issueCsrfToken);
app.use(verifyCsrfToken);

// Current logged-in user
const { currentUser } = require('./middleware/auth');

app.use(currentUser);

// Load unread notification count for the admin navbar.
app.use(async (req, res, next) => {
  if (res.locals.currentUser?.role === 'admin') {
    try {
      const AdminNotification = require('./models/AdminNotification');

      res.locals.adminUnreadCount =
        await AdminNotification.getUnreadCount();

    } catch (error) {
      console.error('ADMIN UNREAD COUNT LOAD ERROR:', error);
      res.locals.adminUnreadCount = 0;
    }
  }

  next();
});

const site = require('./config/site');

const poemRoutes = require('./routes/poems');
const bookRoutes = require('./routes/books');
const contactRoutes = require('./routes/contact');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminUsersRoutes = require('./routes/admin-users');
const adminNotificationRoutes = require('./routes/admin-notifications');
const writerRoutes = require('./routes/writer');
const authorRoutes = require('./routes/authors');

// Homepage
app.get('/', async (req, res, next) => {
  try {
    const Poem = require('./models/Poem');
    const homepagePoems = await Poem.findHomepage();

    return res.render('pages/index', {
      title: 'AVS Writer',
      featuredPoems: homepagePoems.featured,
      latestPoems: homepagePoems.latest,
      bannerUrl: site.poetryBannerUrl
    });
  } catch (error) {
    console.error('HOMEPAGE ERROR:', error);
    return next(error);
  }
});

// Public routes
app.use('/poems', poemRoutes);

app.get('/poetry', (req, res) => {
  return res.redirect('/poems');
});

app.use('/books', bookRoutes);

app.get('/book', (req, res) => {
  return res.redirect('/books');
});

// Writer, contact and authentication
app.use('/writer', writerRoutes);
app.use('/contact', contactRoutes);
app.use('/auth', authRoutes);

// Admin user management
app.use('/admin/users', adminUsersRoutes);

// Admin notifications must run before the main admin router.
app.use('/admin', adminNotificationRoutes);

// Existing admin routes
app.use('/admin', adminRoutes);

app.use('/author', authorRoutes);

// 404
app.use((req, res) => {
  return res.status(404).render('pages/404', {
    title: 'Not Found'
  });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);

  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).send(
        'Uploaded file exceeds the allowed size.'
      );
    }

    if (
      err.code === 'LIMIT_FILE_COUNT' ||
      err.code === 'LIMIT_UNEXPECTED_FILE'
    ) {
      return res.status(400).send(
        'Invalid number of uploaded files.'
      );
    }

    return res.status(400).send(
      'File upload failed. Please check your files.'
    );
  }

  const allowedUploadErrors = [
    'Only JPG, PNG, JPEG, WEBP and PDF files are allowed.',
    'Only JPG, JPEG and PNG profile photos are allowed.',
    'Cover must be JPG, PNG or WebP.',
    'Book document must be a PDF.'
  ];

  if (allowedUploadErrors.includes(err.message)) {
    return res.status(400).send(err.message);
  }

  return res.status(500).render('pages/500', {
    title: 'Server Error'
  });
});

// Start server only after database connection succeeds.
async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log(`AVS Writer running on port ${PORT}`);
      console.log(
        `Environment: ${isProduction ? 'production' : 'development'}`
      );
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

startServer();

