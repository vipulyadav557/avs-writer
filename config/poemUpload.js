
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDirectory = path.join(
  __dirname,
  '..',
  'storage',
  'poems'
);

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedTypes = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf']
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `${crypto.randomUUID()}${extension}`;

    cb(null, filename);
  }
});

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();
  const extensions = allowedTypes[file.mimetype];

  if (!extensions || !extensions.includes(extension)) {
    return cb(new Error('Only JPG, JPEG, PNG, WEBP and PDF files are allowed.'));
  }

  cb(null, true);
}

const uploadPoemFiles = multer({
  storage,
  fileFilter,
  limits: {
    files: 2,
    fileSize: 10 * 1024 * 1024
  }
}).fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'poemPdf', maxCount: 1 }
]);

module.exports = {
  uploadPoemFiles,
  uploadDirectory
};
