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
 * Backup & restore routes (database + uploaded files).
 *
 * Platform-level operation restricted to super-admins (`requireSystemRole`).
 * Restore is destructive — the client requires an explicit type-to-confirm.
 */

// Uploaded restore files (.tar.gz full / .sql database-only) land here briefly,
// then are deleted after restore.
const tmpDir = path.join(__dirname, '../../../backups/tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => cb(null, `restore-${Date.now()}${/\.tar\.gz$/i.test(file.originalname) ? '.tar.gz' : '.sql'}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB ceiling: a full backup carries the documents
  fileFilter: (req, file, cb) => cb(null, /\.(sql|tar\.gz)$/i.test(file.originalname)),
});

router.use(authenticate, requireSystemRole);

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.post('/restore', asyncHandler(ctrl.restore));
router.post('/restore-upload', upload.single('backup'), asyncHandler(ctrl.restoreUpload));
router.get('/:filename/download', asyncHandler(ctrl.download));
router.delete('/:filename', asyncHandler(ctrl.remove));

module.exports = router;
