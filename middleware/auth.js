
const User = require('../models/User');

const SESSION_COOKIE_NAME = 'avs.writer.sid';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/'
};

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
}

function destroySession(req, res, redirectTo = '/auth/login') {
  if (!req.session) {
    clearSessionCookie(res);
    return res.redirect(redirectTo);
  }

  req.session.destroy((error) => {
    if (error) {
      console.error('SESSION DESTROY ERROR:', error);
    }

    clearSessionCookie(res);
    return res.redirect(redirectTo);
  });
}

async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    const returnTo = req.originalUrl || '/writer';

    return res.redirect(
      `/auth/login?next=${encodeURIComponent(returnTo)}`
    );
  }

  try {
    const user = await User.findById(req.session.userId);

    if (!user || !user.is_active) {
      return destroySession(req, res);
    }

    req.session.user = {
      id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.locals.currentUser = req.session.user;

    return next();
  } catch (error) {
    console.error('AUTHENTICATION CHECK ERROR:', error);
    return next(error);
  }
}

function requireAdmin(req, res, next) {
  if (
    req.session &&
    req.session.user &&
    req.session.user.role === 'admin'
  ) {
    return next();
  }

  return res.status(403).render('pages/404', {
    title: 'Access Denied'
  });
}

function requireWriter(req, res, next) {
  if (
    req.session &&
    req.session.user &&
    req.session.user.role === 'writer'
  ) {
    return next();
  }

  return res.status(403).render('pages/404', {
    title: 'Access Denied'
  });
}

function currentUser(req, res, next) {
  res.locals.currentUser =
    (req.session && req.session.user) || null;

  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireWriter,
  currentUser,
  clearSessionCookie,
  destroySession
};
