
const path = require('path');

function matchesSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  switch (mimeType) {
    case 'image/jpeg':
      return (
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );

    case 'image/png':
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        )
      );

    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      );

    case 'application/pdf':
      return buffer.toString('ascii', 0, 5) === '%PDF-';

    default:
      return false;
  }
}

function validateUploadedFile(file, allowedTypes, errorMessage) {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    typeof file.originalname !== 'string'
  ) {
    throw new Error(errorMessage);
  }

  const originalName = file.originalname;

  // Reject path separators, control characters and invalid filenames.
  if (
    !originalName ||
    originalName.length > 255 ||
    originalName.includes('/') ||
    originalName.includes('\\') ||
    /[\x00-\x1f\x7f]/.test(originalName) ||
    originalName === '.' ||
    originalName === '..'
  ) {
    throw new Error(errorMessage);
  }

  const extension = path.extname(originalName).toLowerCase();
  const allowedExtensions = allowedTypes[file.mimetype];

  if (
    !allowedExtensions ||
    !allowedExtensions.includes(extension) ||
    !matchesSignature(file.buffer, file.mimetype)
  ) {
    throw new Error(errorMessage);
  }

  return true;
}

module.exports = {
  validateUploadedFile
};
