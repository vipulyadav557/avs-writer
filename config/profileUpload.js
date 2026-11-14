
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const profileUploadDirectory = path.join(
    __dirname,
    '..',
    'storage',
    'profiles'
);

fs.mkdirSync(profileUploadDirectory, { recursive: true });

const allowedTypes = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp']
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, profileUploadDirectory);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `${crypto.randomUUID()}${extension}`);
    }
});

function fileFilter(req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    const extensions = allowedTypes[file.mimetype];

    if (!extensions || !extensions.includes(extension)) {
        return cb(
            new Error('Only JPG, JPEG and PNG profile photos are allowed.')
        );
    }

    cb(null, true);
}

const uploadProfilePhoto = multer({
    storage,
    fileFilter,
    limits: {
        files: 1,
        fileSize: 2 * 1024 * 1024
    }
}).single('profilePhoto');

module.exports = {
    uploadProfilePhoto,
    profileUploadDirectory
};
