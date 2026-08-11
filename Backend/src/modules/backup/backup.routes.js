const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const authenticate = require('../../middleware/authenticate');
const requireSystemRole = require('../../middleware/requireSystemRole');
const { asyncHandler } = require('../../core');
const ctrl = require('./backup.controller');

const router = Router();

/**
 * Database backup & restore routes.
 *
 * Platform-level operation restricted to super-admins (`requireSystemRole`).
 * Restore is destructive — the client requires an explicit type-to-confirm.
 */

// Uploaded .sql restore files land here briefly, then are deleted after restore.
const tmpDir = path.join(__dirname, '../../../backups/tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => cb(null, `restore-${Date.now()}.sql`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB ceiling for a dump
  fileFilter: (req, file, cb) => cb(null, /\.sql$/i.test(file.originalname)),
});

router.use(authenticate, requireSystemRole);

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.post('/restore', asyncHandler(ctrl.restore));
router.post('/restore-upload', upload.single('backup'), asyncHandler(ctrl.restoreUpload));
router.get('/:filename/download', asyncHandler(ctrl.download));
router.delete('/:filename', asyncHandler(ctrl.remove));

module.exports = router;
