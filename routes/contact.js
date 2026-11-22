
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { isConnected } = require('../config/database');
const Contact = require('../models/Contact');
const { notifyAdmin } = require('../services/adminNotificationService');

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many messages submitted. Please try again after 15 minutes.'
});

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

router.post('/', contactLimiter, contactRules, async (req, res) => {
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

    void notifyAdmin({
      eventType: 'contact_message',
      title: 'New Contact Message',
      message: `A new contact message was received from ${name} (${email}). Subject: ${subject || 'No subject'}.`,
      targetUrl: '/admin',
      metadata: {
        name,
        email,
        subject: subject || ''
      }
    }).catch(error => {
      console.error('Contact notification error:', error);
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
