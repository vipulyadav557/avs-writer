
const multer = require('multer');
const path = require('path');

const { validateUploadedFile } = require('./fileSignature');
const { verifyCsrfTokenAfterUpload } = require('../middleware/csrf');

const profileUploadDirectory = path.join(
  __dirname,
  '..',
  'storage',
  'profiles'
);

const allowedTypes = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

const uploadErrorMessage =
  'Only JPG, JPEG and PNG profile photos are allowed.';

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
    files: 1,
    fileSize: 2 * 1024 * 1024
  }
}).single('profilePhoto');

function uploadProfilePhoto(req, res, callback) {
  multerUpload(req, res, (error) => {
    if (error) {
      return callback(error);
    }

    return verifyCsrfTokenAfterUpload(req, res, (csrfError) => {
      if (csrfError) {
        return callback(csrfError);
      }

      try {
        if (req.file) {
          validateUploadedFile(
            req.file,
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
  uploadProfilePhoto,
  profileUploadDirectory
};
