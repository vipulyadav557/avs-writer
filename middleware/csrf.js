
const crypto = require('crypto');

const TOKEN_FIELD = '_csrf';
const TOKEN_HEADER = 'x-csrf-token';

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return (
    aBuffer.length === bBuffer.length &&
    crypto.timingSafeEqual(aBuffer, bBuffer)
  );
}

function issueCsrfToken(req, res, next) {
  if (!req.session) {
    return next(
      new Error('Session middleware must run before CSRF middleware.')
    );
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = createToken();
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function validateToken(req, res, next) {
  if (!req.session || !req.session.csrfToken) {
    return res.status(403).send(
      'Invalid security token. Please refresh the page.'
    );
  }

  const submittedToken =
    req.get(TOKEN_HEADER) ||
    (req.body && req.body[TOKEN_FIELD]);

  if (!safeCompare(submittedToken, req.session.csrfToken)) {
    return res.status(403).send(
      'Security validation failed. Please refresh the page and try again.'
    );
  }

  return next();
}

// For normal URL-encoded and JSON requests.
// Multipart requests are checked after Multer parses their body.
function verifyCsrfToken(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(req.method)) {
    return next();
  }

  if (req.is('multipart/form-data')) {
    return next();
  }

  return validateToken(req, res, next);
}

// Use after Multer has parsed a multipart form.
function verifyCsrfTokenAfterUpload(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(req.method)) {
    return next();
  }

  return validateToken(req, res, next);
}

module.exports = {
  issueCsrfToken,
  verifyCsrfToken,
  verifyCsrfTokenAfterUpload
};
