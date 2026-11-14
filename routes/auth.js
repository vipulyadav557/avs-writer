
const express = require('express');
const router = express.Router();

const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const loginRules = [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty()
];

const registerRules = [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 72 }),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
];

// Only allow safe local redirects
function getSafeRedirect(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
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

// Login Page
router.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(
      req.session.user.role === 'admin' ? '/admin' : '/writer'
    );
  }

  res.render('pages/login', {
    title: 'Sign In',
    errors: [],
    redirectTo: getSafeRedirect(req.query.next) || ''
  });
});

// Registration Page
router.get('/register', (req, res) => {
  res.render('pages/register', {
    title: 'Create Account',
    errors: []
  });
});

// Register New Writer
router.post('/register', registerRules, async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).render('pages/register', {
      title: 'Create Account',
      errors: errors.array()
    });
  }

  const { name, email, password } = req.body;

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

    res.redirect('/auth/login');

  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === '23505') {
      return res.status(409).render('pages/register', {
        title: 'Create Account',
        errors: [{ msg: 'Email is already registered.' }]
      });
    }

    res.status(500).render('pages/500', {
      title: 'Server Error'
    });
  }
});

// Login
router.post('/login', loginRules, async (req, res) => {
  const errors = validationResult(req);
  const redirectTo = getSafeRedirect(req.body.redirectTo);

  if (!errors.isEmpty()) {
    return res.status(400).render('pages/login', {
      title: 'Sign In',
      errors: errors.array(),
      redirectTo: redirectTo || ''
    });
  }

  const { email, password } = req.body;

  try {
    const user = await User.findByEmail(email);

    if (
      !user ||
      !await User.verifyPassword(password, user.password_hash)
    ) {
      return res.status(400).render('pages/login', {
        title: 'Sign In',
        errors: [{ msg: 'Invalid email or password' }],
        redirectTo: redirectTo || ''
      });
    }

    if (!user.is_active) {
      return res.status(403).render('pages/login', {
        title: 'Sign In',
        errors: [{ msg: 'Account is disabled' }],
        redirectTo: redirectTo || ''
      });
    }

    req.session.regenerate(async (err) => {
      if (err) {
        console.error(err);

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

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error(saveErr);

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
        console.error('Login update error:', error);

        res.status(500).render('pages/500', {
          title: 'Server Error'
        });
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    res.status(500).render('pages/500', {
      title: 'Server Error'
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);

    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;
