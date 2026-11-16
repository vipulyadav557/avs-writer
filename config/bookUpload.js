
const multer = require('multer');
const path = require('path');

const { validateUploadedFile } = require('./fileSignature');
const { verifyCsrfTokenAfterUpload } = require('../middleware/csrf');

const allowedCovers = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

const allowedPdf = {
  'application/pdf': ['.pdf']
};

function fileFilter(req, file, callback) {
  if (
    file.fieldname === 'cover' &&
    allowedCovers[file.mimetype] &&
    allowedCovers[file.mimetype].includes(
      path.extname(file.originalname).toLowerCase()
    )
  ) {
    return callback(null, true);
  }

  if (
    file.fieldname === 'pdf' &&
    allowedPdf[file.mimetype] &&
    allowedPdf[file.mimetype].includes(
      path.extname(file.originalname).toLowerCase()
    )
  ) {
    return callback(null, true);
  }

  return callback(new Error(
    file.fieldname === 'cover'
      ? 'Cover must be JPG, PNG or WebP.'
      : 'Book document must be a PDF.'
  ));
}

const multerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    files: 2,
    fileSize: 50 * 1024 * 1024
  }
});

function fields(fieldDefinitions) {
  const uploadMiddleware = multerUpload.fields(fieldDefinitions);

  return function validatedBookUpload(req, res, next) {
    uploadMiddleware(req, res, (error) => {
      if (error) {
        return next(error);
      }

      return verifyCsrfTokenAfterUpload(req, res, (csrfError) => {
        if (csrfError) {
          return next(csrfError);
        }

        try {
          for (const file of Object.values(req.files || {}).flat()) {
            if (file.fieldname === 'cover') {
              validateUploadedFile(
                file,
                allowedCovers,
                'Cover must be JPG, PNG or WebP.'
              );
            } else if (file.fieldname === 'pdf') {
              validateUploadedFile(
                file,
                allowedPdf,
                'Book document must be a PDF.'
              );
            } else {
              throw new Error('Invalid book upload field.');
            }
          }

          return next();
        } catch (validationError) {
          return next(validationError);
        }
      });
    });
  };
}

module.exports = {
  upload: { fields }
};
