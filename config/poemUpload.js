
const multer = require('multer');
const path = require('path');

const { validateUploadedFile } = require('./fileSignature');
const { verifyCsrfTokenAfterUpload } = require('../middleware/csrf');

const allowedTypes = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf']
};

const uploadErrorMessage =
  'Only JPG, JPEG, PNG, WEBP and PDF files are allowed.';

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();
  const extensions = allowedTypes[file.mimetype];

  if (!extensions || !extensions.includes(extension)) {
    return cb(new Error(uploadErrorMessage));
  }

  return cb(null, true);
}

const multerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    files: 2,
    fileSize: 10 * 1024 * 1024
  }
}).fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'poemPdf', maxCount: 1 }
]);

function uploadPoemFiles(req, res, callback) {
  multerUpload(req, res, (error) => {
    if (error) {
      return callback(error);
    }

    return verifyCsrfTokenAfterUpload(req, res, (csrfError) => {
      if (csrfError) {
        return callback(csrfError);
      }

      try {
        const files = Object.values(req.files || {}).flat();

        for (const file of files) {
          validateUploadedFile(
            file,
            allowedTypes,
            uploadErrorMessage
          );
        }

        return callback();
      } catch (validationError) {
        return callback(validationError);
      }
    });
  });
}

module.exports = {
  uploadPoemFiles,
  uploadDirectory: null
};
