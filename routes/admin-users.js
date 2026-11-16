
const express = require('express');
const router = express.Router();

const { requireAuth, requireAdmin } = require('../middleware/auth');
const User = require('../models/User');

router.use(requireAuth);
router.use(requireAdmin);

// Display all writers
router.get('/', async (req, res, next) => {
  try {
    const writers = await User.findAllWriters();

    res.render('pages/admin-users', {
      title: 'User Management',
      writers,
      message: req.query.message || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('ADMIN USERS ERROR:', error);
    next(error);
  }
});

// Activate or deactivate a writer account
router.post('/:id/status', async (req, res, next) => {
  try {
    const writerId = Number(req.params.id);
    const status = req.body.status;

    if (
      !Number.isSafeInteger(writerId) ||
      writerId <= 0 ||
      !['active', 'inactive'].includes(status)
    ) {
      return res.redirect('/admin/users?error=Invalid request');
    }

    const isActive = status === 'active';

    const updatedWriter = await User.updateWriterStatus(
      writerId,
      isActive
    );

    if (!updatedWriter) {
      return res.redirect('/admin/users?error=Writer not found');
    }

    const message = isActive
      ? 'Writer account activated successfully'
      : 'Writer account deactivated successfully';

    return res.redirect(
      `/admin/users?message=${encodeURIComponent(message)}`
    );
  } catch (error) {
    console.error('WRITER STATUS UPDATE ERROR:', error);
    next(error);
  }
});

module.exports = router;
