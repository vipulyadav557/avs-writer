const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { isConnected } = require('../config/database');
const Contact = require('../models/Contact');

const contactRules = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name is required'),

  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),

  body('subject')
    .optional()
    .trim()
    .isLength({ max: 200 }),

  body('message')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message is required')
];

router.get('/', (req, res) => {
  res.render('pages/contact', {
    title: 'Contact',
    errors: [],
    success: false
  });
});

router.post('/', contactRules, async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).render('pages/contact', {
      title: 'Contact',
      errors: errors.array(),
      success: false
    });
  }

  if (!isConnected()) {
    return res.status(500).render('pages/contact', {
      title: 'Contact',
      errors: [{ msg: 'Database not configured. Message cannot be saved.' }],
      success: false
    });
  }

  try {
    const { name, email, subject, message } = req.body;

    await Contact.createMessage({
      name,
      email,
      subject: subject || '',
      message,
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    return res.render('pages/contact', {
      title: 'Contact',
      errors: [],
      success: true
    });

  } catch (error) {
    console.error('Contact error:', error);

    return res.status(500).render('pages/contact', {
      title: 'Contact',
      errors: [{ msg: 'Failed to send message. Please try again.' }],
      success: false
    });
  }
});

module.exports = router;