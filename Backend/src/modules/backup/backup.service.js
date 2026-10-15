const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = require('../../config/env');
const { BadRequestError, NotFoundError } = require('../../core');

/**
 * Platform backup & restore.
 *
 * A backup is one `backup-YYYYMMDD-HHMMSS.tar.gz` in `backups/` holding
 * everything needed to bring the portal back:
 *   - `database.sql` — a full `mysqldump` (schema + data, DROP/CREATE);
 *   - `storage/`     — the sales documents (formats, concept, costing, offers…);
 *   - `uploads/`     — the company logo and other public uploads;
 *   - `backup-info.json` — when it was made and what it contains.
 * `.env` is never included: it holds the passwords and secrets.
 *
 * A restore replays the dump into the **same** database via the `mysql`
 * client, then puts the files back (the current folders are replaced). Older
 * database-only `.sql` backups can still be restored — files are left as they
 * are. Packing uses the system `tar` (Linux, and Windows 10+), so no extra
 * packages are needed.
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
/** Scratch space for packing / unpacking. */
const TMP_DIR = path.join(BACKUP_DIR, 'tmp');
/** The backend folder — the file folders below live in it. */
const APP_DIR = path.join(__dirname, '../../..');
/** Folders of uploaded files that a full backup carries. */
const FILE_DIRS = Object.freeze(['storage', 'uploads']);
/** Only files matching this are treated as backups: full (.tar.gz) or database-only (.sql). */
const FILE_RE = /^backup-[0-9]{8}-[0-9]{6}\.(sql|tar\.gz)$/;

/**
 * The tar binary. On Windows, the built-in bsdtar (System32): a GNU tar from
 * Git on the PATH would read "C:\…" as a remote host.
 */
const TAR = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  : 'tar';

/** 'full' for a .tar.gz, 'database' for a plain .sql. */
const typeOf = (filename) => (filename.endsWith('.tar.gz') ? 'full' : 'database');

/**
 * Runs a command (no shell), resolving on exit code 0.
 * @param {string} cmd @param {string[]} args @param {object} [opts] @returns {Promise<void>}
 */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(new Error(`${cmd}: ${err.message}`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${stderr.trim().slice(0, 500)}`))));
  });
}

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
        return { filename: f, size: s.size, created_at: s.mtime.toISOString(), type: typeOf(f) };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  /**
   * A full backup: the database dump plus the uploaded-file folders, packed
   * into one .tar.gz.
   * @returns {Promise<{ filename: string, size: number, created_at: string, type: string }>}
   */
  async create() {
    ensureDir();
    const id = stamp();
    const stage = path.join(TMP_DIR, `stage-${id}`);
    fs.mkdirSync(stage, { recursive: true });
    const filename = `backup-${id}.tar.gz`;
    const full = path.join(BACKUP_DIR, filename);
    try {
      await this.dumpDatabase(path.join(stage, 'database.sql'));
      const folders = FILE_DIRS.filter((d) => fs.existsSync(path.join(APP_DIR, d)));
      fs.writeFileSync(path.join(stage, 'backup-info.json'), JSON.stringify({
        created_at: new Date().toISOString(),
        contains: ['database.sql', ...folders.map((d) => `${d}/`)],
      }, null, 2));
      // Two -C hops: the dump + info from the staging folder, the file folders
      // from the backend folder — all at the archive's top level.
      await run(TAR, ['-czf', full, '-C', stage, 'database.sql', 'backup-info.json', '-C', APP_DIR, ...folders]);
    } catch (err) {
      fs.rmSync(full, { force: true });
      throw err instanceof BadRequestError ? err : new BadRequestError(`Backup failed: ${err.message}`);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
    const s = fs.statSync(full);
    return { filename, size: s.size, created_at: s.mtime.toISOString(), type: 'full' };
  },

  /**
   * Runs mysqldump into a file.
   * @param {string} full absolute output path
   * @returns {Promise<void>}
   */
  dumpDatabase(full) {
    const db = dbConfig();

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
            resolve();
          } else {
            fs.rmSync(full, { force: true });
            reject(new BadRequestError(`Backup failed (mysqldump exit ${code}): ${stderr.trim().slice(0, 500)}`));
          }
        });
      });
    });
  },

  /**
   * Restores a backup (destructive): a full .tar.gz puts back the database and
   * the uploaded files; a plain .sql only the database. Accepts an absolute
   * path already validated by the caller.
   * @param {string} absPath @returns {Promise<{ type: string, folders: string[] }>}
   */
  async restore(absPath) {
    if (!/\.tar\.gz$/i.test(absPath)) {
      await this.restoreDatabase(absPath);
      return { type: 'database', folders: [] };
    }

    const work = path.join(TMP_DIR, `unpack-${stamp()}-${process.pid}`);
    fs.mkdirSync(work, { recursive: true });
    try {
      try { await run(TAR, ['-xzf', absPath, '-C', work]); }
      catch (err) { throw new BadRequestError(`Not a valid backup file: ${err.message}`); }

      const sql = path.join(work, 'database.sql');
      if (!fs.existsSync(sql)) throw new BadRequestError('This backup has no database.sql — not a portal backup');
      await this.restoreDatabase(sql);

      // Files: replace each folder the backup carries. A symlink in place of a
      // folder is refused — it could point anywhere on the server.
      const restored = [];
      for (const dir of FILE_DIRS) {
        const from = path.join(work, dir);
        if (!fs.existsSync(from)) continue;
        if (fs.lstatSync(from).isSymbolicLink()) throw new BadRequestError(`Refusing to restore "${dir}": it is a link`);
        const to = path.join(APP_DIR, dir);
        fs.rmSync(to, { recursive: true, force: true });
        fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
        restored.push(dir);
      }
      return { type: 'full', folders: restored };
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  },

  /**
   * Replays a .sql dump into the live database.
   * @param {string} absPath @returns {Promise<void>}
   */
  restoreDatabase(absPath) {
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
