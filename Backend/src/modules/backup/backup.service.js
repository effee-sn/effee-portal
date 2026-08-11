const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = require('../../config/env');
const { BadRequestError, NotFoundError } = require('../../core');

/**
 * Database backup & restore.
 *
 * A backup is a full `mysqldump` of the application database (schema + data,
 * self-contained with DROP/CREATE) written to `backups/`. A restore replays a
 * dump back into the **same** database via the `mysql` client — no separate DB.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 *   - Credentials come from DATABASE_URL and are passed to the child process via
 *     the MYSQL_PWD env var, never on the command line (where they'd show up in
 *     the process list).
 *   - Child processes are spawned with an argument array and no shell, so a
 *     value can never be interpreted as a shell command.
 *   - Restore is destructive (overwrites all data) and is gated to super-admins
 *     at the route; filenames are validated against the backups directory to
 *     block path traversal.
 */

/** Directory where backup files live. */
const BACKUP_DIR = path.join(__dirname, '../../../backups');
/** Only files matching this are treated as backups. */
const FILE_RE = /^backup-[0-9]{8}-[0-9]{6}\.sql$/;

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/** Parses the connection string into the pieces mysqldump/mysql need. */
function dbConfig() {
  const url = new URL(config.DATABASE_URL);
  return {
    host: url.hostname || 'localhost',
    port: url.port || '3306',
    user: decodeURIComponent(url.username || 'root'),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent((url.pathname || '').replace(/^\//, '')),
  };
}

/** Resolves a client binary, honouring MYSQL_BIN_DIR when set. */
function bin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return config.MYSQL_BIN_DIR ? path.join(config.MYSQL_BIN_DIR, exe) : name;
}

/** Timestamp like 20260807-143005 for the filename. */
function stamp() {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Validates a backup filename and returns its absolute path.
 * @param {string} filename @returns {string}
 */
function resolvePath(filename) {
  if (typeof filename !== 'string' || path.basename(filename) !== filename || !FILE_RE.test(filename)) {
    throw new BadRequestError('Invalid backup filename');
  }
  const full = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(full)) throw new NotFoundError('Backup file');
  return full;
}

module.exports = {
  BACKUP_DIR,
  resolvePath,

  /** @returns {Array<{ filename: string, size: number, created_at: string }>} newest first */
  list() {
    ensureDir();
    return fs.readdirSync(BACKUP_DIR)
      .filter((f) => FILE_RE.test(f))
      .map((f) => {
        const s = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, size: s.size, created_at: s.mtime.toISOString() };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  /**
   * Runs mysqldump into a new file.
   * @returns {Promise<{ filename: string, size: number, created_at: string }>}
   */
  create() {
    ensureDir();
    const db = dbConfig();
    const filename = `backup-${stamp()}.sql`;
    const full = path.join(BACKUP_DIR, filename);

    return new Promise((resolve, reject) => {
      const args = [
        // Force TCP so we connect the same way the app (Prisma) does — `-h
        // localhost` alone means a named pipe on Windows / a unix socket on Linux.
        '--protocol=TCP', '-h', db.host, '-P', db.port, '-u', db.user,
        '--single-transaction', '--routines', '--triggers', '--add-drop-table',
        db.database,
      ];
      const out = fs.createWriteStream(full);
      const child = spawn(bin('mysqldump'), args, { env: { ...process.env, MYSQL_PWD: db.password } });

      let stderr = '';
      child.stdout.pipe(out);
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => { out.close(); fs.rmSync(full, { force: true }); reject(new BadRequestError(`Backup failed: ${err.message}. Is mysqldump installed / MYSQL_BIN_DIR set?`)); });
      child.on('close', (code) => {
        out.close(() => {
          if (code === 0) {
            const s = fs.statSync(full);
            resolve({ filename, size: s.size, created_at: s.mtime.toISOString() });
          } else {
            fs.rmSync(full, { force: true });
            reject(new BadRequestError(`Backup failed (mysqldump exit ${code}): ${stderr.trim().slice(0, 500)}`));
          }
        });
      });
    });
  },

  /**
   * Restores a dump file into the live database (destructive). Accepts an
   * absolute path already validated by the caller.
   * @param {string} absPath @returns {Promise<void>}
   */
  restore(absPath) {
    const db = dbConfig();
    return new Promise((resolve, reject) => {
      const args = ['--protocol=TCP', '-h', db.host, '-P', db.port, '-u', db.user, db.database];
      const child = spawn(bin('mysql'), args, { env: { ...process.env, MYSQL_PWD: db.password } });

      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => reject(new BadRequestError(`Restore failed: ${err.message}. Is the mysql client installed / MYSQL_BIN_DIR set?`)));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new BadRequestError(`Restore failed (mysql exit ${code}): ${stderr.trim().slice(0, 500)}`));
      });

      const input = fs.createReadStream(absPath);
      input.on('error', (err) => reject(new BadRequestError(`Restore failed: ${err.message}`)));
      input.pipe(child.stdin);
    });
  },

  /** Deletes a backup file. @param {string} filename */
  remove(filename) {
    const full = resolvePath(filename);
    fs.rmSync(full, { force: true });
  },
};
