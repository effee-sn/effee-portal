const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const { BadRequestError } = require('../../core');
const { ALLOWED_TYPES } = require('../sales/attachment.upload');

/**
 * Upload plumbing for files on issues (screenshots, documents). Stored outside
 * the public `/uploads` dir and streamed back only through the authenticated
 * download route — the same types as sales documents (no HTML / SVG).
 */

const storageDir = path.join(__dirname, '../../../storage/issue-files');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, storageDir),
  filename: (req, file, cb) => {
    const extension = ALLOWED_TYPES[file.mimetype];
    if (!extension) return cb(new BadRequestError('Unsupported file type'));
    return cb(null, `iss-${Date.now()}-${crypto.randomBytes(10).toString('hex')}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    return cb(new BadRequestError(
      `Unsupported file type. Allowed: ${[...new Set(Object.values(ALLOWED_TYPES))].join(', ')}`
    ));
  },
});

/** Up to five files in the `files` field, with multer's failures in the API's error shape. */
function issueFiles(req, res, next) {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `Each file must be smaller than ${MAX_FILE_BYTES / (1024 * 1024)} MB`
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Up to ${MAX_FILES} files at a time`
          : `Upload failed: ${err.message}`;
      return next(new BadRequestError(message));
    }
    return next(err);
  });
}

/** A file's key in the file store (lib/fileStore) — moves to Azure Blob when that is on. */
const fileKey = (storedName) => `storage/issue-files/${storedName}`;

module.exports = { storageDir, fileKey, issueFiles, MAX_FILE_BYTES, MAX_FILES };
