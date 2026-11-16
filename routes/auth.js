
const express = require('express');
const { body, validationResult } = require('express-validator');
const { rateLimit } = require('express-rate-limit');

const User = require('../models/User');
const { clearSessionCookie } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again after 15 minutes.'
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many registration attempts. Please try again later.'
});

const loginRules = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .isString()
    .notEmpty()
    .withMessage('Password is required.')
];

const registerRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required.')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters.'),

  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be between 8 and 72 characters.'),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match.');
      }

      return true;
    })
];

// Only allow safe local redirects.
function getSafeRedirect(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\r\n]/.test(value)
  ) {
    return null;
  }

  try {
    const url = new URL(value, 'http://localhost');

    if (url.origin !== 'http://localhost') {
      return null;
    }

    return url.pathname + url.search;
  } catch {
    return null;
  }
}

function renderLogin(res, errors = [], redirectTo = '') {
  return res.status(400).render('pages/login', {
    title: 'Sign In',
    errors,
    redirectTo
  });
}

// Login Page
router.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    const role = req.session.user && req.session.user.role;

    return res.redirect(
      role === 'admin' ? '/admin' : '/writer'
    );
  }

  return res.render('pages/login', {
    title: 'Sign In',
    errors: [],
    redirectTo: getSafeRedirect(req.query.next) || ''
  });
});

// Registration Page
router.get('/register', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(
      req.session.user?.role === 'admin' ? '/admin' : '/writer'
    );
  }

  return res.render('pages/register', {
    title: 'Create Account',
    errors: []
  });
});

// Register New Writer
router.post(
  '/register',
  registerLimiter,
  registerRules,
  async (req, res) => {
    const validation = validationResult(req);

    if (!validation.isEmpty()) {
      return res.status(400).render('pages/register', {
        title: 'Create Account',
        errors: validation.array()
      });
    }

    const name = req.body.name.trim();
    const email = req.body.email;
    const password = req.body.password;

    try {
      const existingUser = await User.findByEmail(email);

      if (existingUser) {
        return res.status(409).render('pages/register', {
          title: 'Create Account',
          errors: [{ msg: 'Email is already registered.' }]
        });
      }

      await User.createUser({
        name,
        email,
        password,
        role: 'writer'
      });

      return res.redirect('/auth/login');

    } catch (error) {
      console.error('REGISTRATION ERROR:', error.message);

      if (error.code === '23505') {
        return res.status(409).render('pages/register', {
          title: 'Create Account',
          errors: [{ msg: 'Email is already registered.' }]
        });
      }

      return res.status(500).render('pages/500', {
        title: 'Server Error'
      });
    }
  }
);

// Login
router.post(
  '/login',
  loginLimiter,
  loginRules,
  async (req, res) => {
    const validation = validationResult(req);
    const redirectTo = getSafeRedirect(req.body.redirectTo) || '';

    if (!validation.isEmpty()) {
      return renderLogin(
        res,
        validation.array(),
        redirectTo
      );
    }

    const email = req.body.email;
    const password = req.body.password;

    try {
      const user = await User.findByEmail(email);

      if (
        !user ||
        !await User.verifyPassword(password, user.password_hash)
      ) {
        return renderLogin(
          res,
          [{ msg: 'Invalid email or password.' }],
          redirectTo
        );
      }

      if (!user.is_active) {
        return res.status(403).render('pages/login', {
          title: 'Sign In',
          errors: [{ msg: 'Your account is disabled.' }],
          redirectTo
        });
      }

      req.session.regenerate(async (sessionError) => {
        if (sessionError) {
          console.error('SESSION REGENERATE ERROR:', sessionError);

          return res.status(500).render('pages/500', {
            title: 'Server Error'
          });
        }

        req.session.userId = user.user_id;

        req.session.user = {
          id: user.user_id,
          name: user.name,
          email: user.email,
          role: user.role
        };

        try {
          await User.updateLastLogin(user.user_id);

          req.session.save((saveError) => {
            if (saveError) {
              console.error('SESSION SAVE ERROR:', saveError);

              return res.status(500).render('pages/500', {
                title: 'Server Error'
              });
            }

            if (user.role === 'admin') {
              return res.redirect('/admin');
            }

            return res.redirect(redirectTo || '/writer');
          });

        } catch (error) {
          console.error('LOGIN UPDATE ERROR:', error);

          return res.status(500).render('pages/500', {
            title: 'Server Error'
          });
        }
      });

    } catch (error) {
      console.error('LOGIN ERROR:', error.message);

      return res.status(500).render('pages/500', {
        title: 'Server Error'
      });
    }
  }
);

// Secure Logout - POST only (CSRF protected)
router.post('/logout', (req, res) => {
  if (!req.session) {
    clearSessionCookie(res);
    return res.redirect('/');
  }

  req.session.destroy((error) => {
    if (error) {
      console.error('LOGOUT ERROR:', error);
    }

    clearSessionCookie(res);
    return res.redirect('/');
  });
});

module.exports = router;
