const fileStore = require('../../lib/fileStore');
const { settingsRepository } = require('./settings.repository');
const { auditService } = require('../audit/audit.service');
const { ConflictError, logger } = require('../../core');

/**
 * Settings → Storage: where uploaded files are kept (this server's disk or
 * Azure Blob Storage), and copying the existing files across when switching.
 * Super Admin only (see the routes). The Azure account and key are read from
 * .env by the file store; this only holds the switch.
 *
 * A transfer runs in the background of the instance that started it; its
 * progress is written to `storage_transfer` (JSON) so the page can follow it
 * from any instance. One that stops reporting (its server restarted) counts
 * as interrupted and can be started again — a re-run skips what was copied.
 *
 * @param {ReturnType<typeof import('./settings.repository').createSettingsRepository>} repository
 */
function createStorageService(repository, store = fileStore) {
  // Progress is written between files; a copy silent this long has stopped
  // (its server restarted). Generous, so one slow, large file isn't mistaken for it.
  const STALE_MS = 10 * 60 * 1000;
  const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

  /** The last transfer, with RUNNING turned to INTERRUPTED when it stopped reporting. */
  function transferState(s) {
    const t = parse(s.storage_transfer);
    if (t?.status === 'RUNNING' && Date.now() - new Date(t.updated_at).getTime() > STALE_MS) return { ...t, status: 'INTERRUPTED' };
    return t;
  }

  async function writeTransfer(id, t) {
    await repository.update(id, { storage_transfer: JSON.stringify({ ...t, updated_at: new Date().toISOString() }) });
  }

  /** Starts a transfer in the background. @param {'TO_BLOB'|'TO_LOCAL'} direction */
  async function startTransfer(direction, actor) {
    const s = await repository.getOrCreate();
    if (transferState(s)?.status === 'RUNNING') throw new ConflictError('A file transfer is already running — wait for it to finish');
    await store.checkBlob();
    const base = {
      direction, status: 'RUNNING', total: 0, copied: 0, skipped: 0, failed: 0, bytes: 0, failures: [],
      started_at: new Date().toISOString(), finished_at: null, by: actor?.name || actor?.email || null, error: null,
    };
    await writeTransfer(s.id, base);
    // Not awaited: the request returns, the page polls the progress.
    (async () => {
      let p = base;
      try {
        const done = await store.transfer(direction, (prog) => { p = { ...base, ...prog }; return writeTransfer(s.id, p); });
        await writeTransfer(s.id, { ...base, ...done, status: done.failed ? 'FAILED' : 'DONE', finished_at: new Date().toISOString(), error: done.failed ? `${done.failed} file(s) could not be copied` : null });
      } catch (err) {
        logger.error({ err, direction }, 'File transfer failed');
        await writeTransfer(s.id, { ...p, status: 'FAILED', finished_at: new Date().toISOString(), error: err.message }).catch(() => {});
      }
    })();
    await auditService.record({
      action: auditService.Action.SETTINGS_UPDATED, entity: 'CompanySettings', entityId: s.id, actor,
      changes: { storage_transfer: { from: null, to: direction } },
    });
  }

  return {
    /** Which store is on, whether Blob is set up, what's on disk, and the last transfer. */
    async status() {
      const s = await repository.getOrCreate();
      const local = store.listLocal();
      return {
        driver: s.storage_driver === 'BLOB' ? 'BLOB' : 'LOCAL',
        active: await store.driver(),
        configured: store.isBlobConfigured(),
        missing: store.missingSettings(),
        account: store.accountName(),
        container: store.containerName(),
        local: { files: local.length, bytes: local.reduce((n, f) => n + f.size, 0) },
        transfer: transferState(s),
      };
    },

    /**
     * Switches the store; with `transfer`, also copies the existing files to it
     * (disk → Blob when turning Blob on, Blob → disk when turning it off).
     * @param {{ driver: 'LOCAL'|'BLOB', transfer?: boolean }} dto
     */
    async update(dto, actor) {
      const s = await repository.getOrCreate();
      if (dto.driver === 'BLOB' || dto.transfer) {
        try { await store.checkBlob(); } catch (err) { throw new ConflictError(err.message); }
      }
      if (dto.transfer && transferState(s)?.status === 'RUNNING') throw new ConflictError('A file transfer is already running — wait for it to finish');
      if (s.storage_driver !== dto.driver) {
        await repository.update(s.id, { storage_driver: dto.driver, updated_by: actor?.id ?? null });
        store.setDriverCache(dto.driver);
        await auditService.record({
          action: auditService.Action.SETTINGS_UPDATED, entity: 'CompanySettings', entityId: s.id, actor,
          changes: { storage_driver: { from: s.storage_driver, to: dto.driver } },
        });
      }
      if (dto.transfer) await startTransfer(dto.driver === 'BLOB' ? 'TO_BLOB' : 'TO_LOCAL', actor);
      return this.status();
    },

    /** Runs a transfer again (e.g. after failures or an interruption). @param {'TO_BLOB'|'TO_LOCAL'} direction */
    async transfer(direction, actor) {
      try { await startTransfer(direction, actor); } catch (err) { throw err instanceof ConflictError ? err : new ConflictError(err.message); }
      return this.status();
    },
  };
}

const storageService = createStorageService(settingsRepository);

module.exports = { storageService, createStorageService };
