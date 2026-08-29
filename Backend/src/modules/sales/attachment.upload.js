const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const { BadRequestError } = require('../../core');

/**
 * Upload plumbing for enquiry documents.
 *
 * Files are stored **outside** the public `/uploads` dir (which express.static
 * serves without auth) — sales documents are sensitive, so they are streamed
 * back only through the authenticated download route.
 */

const storageDir = path.join(__dirname, '../../../storage/sales-docs');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

/**
 * Permitted document types, keyed by the client-claimed MIME. The stored
 * extension comes from this map, never from the uploaded filename. HTML/SVG are
 * excluded — served from our own origin they would be stored XSS.
 */
const ALLOWED_TYPES = Object.freeze({
  'application/pdf': '.pdf',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/csv': '.csv',
  'image/png': '.png',
  'image/jpeg': '.jpg',
});

const MAX_DOC_BYTES = 25 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, storageDir),
  filename: (req, file, cb) => {
    const extension = ALLOWED_TYPES[file.mimetype];
    if (!extension) return cb(new BadRequestError('Unsupported file type'));
    return cb(null, `enq-${Date.now()}-${crypto.randomBytes(10).toString('hex')}${extension}`);
  },
});

const docUpload = multer({
  storage,
  limits: { fileSize: MAX_DOC_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    return cb(new BadRequestError(
      `Unsupported file type. Allowed: ${[...new Set(Object.values(ALLOWED_TYPES))].join(', ')}`
    ));
  },
});

/** Translates multer's own failures into the API's error shape. */
function handleUploadErrors(handler) {
  return (req, res, next) => handler(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `File must be smaller than ${MAX_DOC_BYTES / (1024 * 1024)} MB`
        : `Upload failed: ${err.message}`;
      return next(new BadRequestError(message));
    }
    return next(err);
  });
}

module.exports = { storageDir, ALLOWED_TYPES, MAX_DOC_BYTES, docUpload, handleUploadErrors };
