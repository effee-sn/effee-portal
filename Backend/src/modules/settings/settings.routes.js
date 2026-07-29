const { Router } = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const authenticate      = require('../../middleware/authenticate');
const requireSystemRole = require('../../middleware/requireSystemRole');
const { asyncHandler, validate, BadRequestError } = require('../../core');
const {
  updateCompanyBody, updateEmailBody, updateSecurityBody, testEmailBody,
} = require('./settings.validation');
const {
  getSettings, updateCompanyInfo, updateEmailSettings,
  updateSecuritySettings, testEmail, uploadLogo,
} = require('./settings.controller');

const router = Router();

// ── Logo upload ───────────────────────────────────────────────────────────────

const logoDir = path.join(__dirname, '../../../uploads/logos');
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

/**
 * Extensions permitted for the company logo, keyed by the MIME type the client
 * claims. Two rules follow from this map and both matter:
 *
 *   1. The stored extension comes from this map, never from the uploaded
 *      filename. Deriving it from `originalname` lets a caller pick the
 *      extension, and these files are served back from the application's own
 *      origin — a stored `.html` or `.svg` becomes stored XSS against every
 *      user who loads it.
 *   2. SVG is excluded on purpose. It is an image to a user and an executable
 *      document to a browser; there is no safe way to serve attacker-supplied
 *      SVG from a trusted origin without sanitising it first.
 *
 * `mimetype` is client-supplied and therefore untrusted on its own. It is used
 * here only to reject obviously wrong uploads early; the extension whitelist is
 * what actually contains the risk.
 */
const ALLOWED_LOGO_TYPES = Object.freeze({
  'image/png':  '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif':  '.gif',
});

/** Hard ceiling on logo size, independent of the configurable upload setting. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const extension = ALLOWED_LOGO_TYPES[file.mimetype];
    if (!extension) return cb(new BadRequestError('Unsupported image type'));

    // Random name: the original is never echoed back, which removes path
    // traversal and null-byte tricks, and prevents one upload overwriting
    // another when two land in the same millisecond.
    return cb(null, `logo-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_LOGO_TYPES[file.mimetype]) return cb(null, true);

    return cb(new BadRequestError(
      `Unsupported image type. Allowed formats: ${Object.values(ALLOWED_LOGO_TYPES).join(', ')}`
    ));
  },
});

/**
 * Translates multer's own failures into the API's error shape. Without this a
 * file that exceeds the size limit surfaces as an opaque 500.
 *
 * @param {import('express').RequestHandler} handler
 * @returns {import('express').RequestHandler}
 */
function handleUploadErrors(handler) {
  return (req, res, next) => handler(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `Logo must be smaller than ${MAX_LOGO_BYTES / (1024 * 1024)} MB`
        : `Upload failed: ${err.message}`;
      return next(new BadRequestError(message));
    }

    return next(err);
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.use(authenticate);

/**
 * Readable by any authenticated user, but the payload is filtered by role in
 * the service. Every user needs company branding for the application shell;
 * only system administrators may see SMTP and security configuration.
 */
router.get('/', asyncHandler(getSettings));

/**
 * Platform configuration. These were originally protected by authentication
 * alone, with the super-admin check left to the frontend — which meant any
 * authenticated user could repoint SMTP credentials or disable login rate
 * limiting by calling the API directly.
 */
router.put(
  '/company',
  requireSystemRole,
  validate({ body: updateCompanyBody }),
  asyncHandler(updateCompanyInfo)
);

router.put(
  '/email',
  requireSystemRole,
  validate({ body: updateEmailBody }),
  asyncHandler(updateEmailSettings)
);

router.put(
  '/security',
  requireSystemRole,
  validate({ body: updateSecurityBody }),
  asyncHandler(updateSecuritySettings)
);

router.post(
  '/test-email',
  requireSystemRole,
  validate({ body: testEmailBody }),
  asyncHandler(testEmail)
);

router.post(
  '/logo',
  requireSystemRole,
  handleUploadErrors(logoUpload.single('logo')),
  asyncHandler(uploadLogo)
);

module.exports = router;
