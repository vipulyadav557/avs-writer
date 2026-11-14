
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }

  const returnTo = req.originalUrl || '/writer';

  return res.redirect(
    `/auth/login?next=${encodeURIComponent(returnTo)}`
  );
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

  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireWriter,
  currentUser
};
