const fs = require('fs');

const backupService = require('./backup.service');
const { auditService } = require('../audit/audit.service');
const { ApiResponse, BadRequestError } = require('../../core');
const { requestContext } = require('../../core/http/requestContext');

/**
 * Backup & restore HTTP controller (database + uploaded files). Every route is super-admin gated
 * (see routes). Backup/restore are recorded to the audit trail (best-effort).
 */

/** `GET /backups` — list stored backups, newest first. */
const list = async (req, res) => ApiResponse.ok(res, backupService.list());

/** `POST /backups` — create a new backup. */
const create = async (req, res) => {
  const backup = await backupService.create();
  await auditService.record({
    action: 'DB_BACKUP', entity: 'Database', actor: requestContext(req),
    changes: { file: backup.filename, size: backup.size, type: backup.type },
  });
  ApiResponse.created(res, backup);
};

/** `GET /backups/:filename/download` — download a stored backup. */
const download = async (req, res) => {
  const full = backupService.resolvePath(req.params.filename);
  res.download(full, req.params.filename);
};

/** `POST /backups/restore` — restore a stored backup (destructive). */
const restore = async (req, res) => {
  const full = backupService.resolvePath(req.body.filename);
  const result = await backupService.restore(full);
  // Recorded after the restore so the entry lands in the restored database.
  await auditService.record({
    action: 'DB_RESTORE', entity: 'Database', actor: requestContext(req),
    changes: { file: req.body.filename, ...result },
  });
  ApiResponse.message(res, result.type === 'full' ? 'Database and files restored from backup' : 'Database restored from backup');
};

/** `POST /backups/restore-upload` — restore from an uploaded .tar.gz or .sql (destructive). */
const restoreUpload = async (req, res) => {
  if (!req.file) throw new BadRequestError('No backup file uploaded');
  try {
    const result = await backupService.restore(req.file.path);
    await auditService.record({
      action: 'DB_RESTORE', entity: 'Database', actor: requestContext(req),
      changes: { file: req.file.originalname, uploaded: true, ...result },
    });
    ApiResponse.message(res, result.type === 'full' ? 'Database and files restored from uploaded backup' : 'Database restored from uploaded backup');
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
};

/** `DELETE /backups/:filename` — delete a stored backup. */
const remove = async (req, res) => {
  backupService.remove(req.params.filename);
  ApiResponse.message(res, 'Backup deleted');
};

module.exports = { list, create, download, restore, restoreUpload, remove };
