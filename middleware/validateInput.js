const { body, param, validationResult } = require('express-validator');
const { categories, languages } = require('../models/Poem');

const createRules = [
  body('title').trim().notEmpty().isLength({ max: 200 }),
  body('body').trim().notEmpty(),
  body('category').isIn(categories),
  body('language').isIn(languages),
  body('mood').optional().trim().isLength({ max: 50 }),
  body('tags').optional().trim(),
  body('author').optional().trim().isLength({ max: 100 }),
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('pages/write', { title: 'Writing Studio', errors: errors.array(), dbAvailable: true });
  }
  next();
}

module.exports = { createRules, handleValidation, param };
