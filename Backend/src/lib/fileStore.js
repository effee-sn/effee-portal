const fs = require('fs');
const path = require('path');

const config = require('../config/env');
const prisma = require('./prisma');
const { logger } = require('../core');

/**
 * Where uploaded files live: the server's disk (LOCAL) or Azure Blob Storage
 * (BLOB), chosen in Settings → Storage. The account and key come from .env
 * (`config.AZURE_STORAGE`) — never the database.
 *
 * Files are named by a **key**: their path under the backend folder, e.g.
 * `storage/sales-docs/enq-….pdf` or `uploads/logos/logo-….png`. The same key
 * is the blob's name, so the two stores mirror each other and a file can move
 * between them without any database change.
 *
 *   - Writing: uploads land on disk first (multer); `saveFile` then moves them
 *     to Blob when Blob is on (the disk copy is removed).
 *   - Reading: the current store first, then the other one — so files not yet
 *     transferred (or left behind on purpose) still open after a switch.
 *   - Transfers (`transfer`): copy everything from one store to the other,
 *     skipping files already there with the same size. Nothing is deleted.
 *     Progress is kept on CompanySettings.storage_transfer, so any server
 *     instance (and the Settings page) can follow it.
 */

/** The backend folder: keys are relative to it. */
const APP_DIR = path.join(__dirname, '../..');
/** The folders that hold uploaded files (the only keys allowed). */
const ROOTS = Object.freeze(['storage', 'uploads']);

const CONTENT_TYPES = Object.freeze({
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.csv': 'text/csv', '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
const typeOf = (key) => CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';

/**
 * A key is a forward-slash path inside one of the roots — never `..`, `.`,
 * empty parts or backslashes, so it can't reach outside the store.
 * @param {string} key
 */
function assertKey(key) {
  const parts = String(key || '').split('/');
  if (!ROOTS.includes(parts[0]) || parts.length < 2 || String(key).includes('\\')
    || parts.some((p) => !p || p === '.' || p === '..')) {
    throw new Error(`Invalid file key: ${key}`);
  }
  return key;
}
const localPath = (key) => path.join(APP_DIR, ...assertKey(key).split('/'));

// ── Azure Blob ────────────────────────────────────────────────────────────────

const az = () => config.AZURE_STORAGE;
const isBlobConfigured = () => Boolean(az().CONNECTION_STRING || (az().ACCOUNT_NAME && az().ACCOUNT_KEY));
/** Which .env settings are still needed for Blob. */
const missingSettings = () => (isBlobConfigured() ? [] : ['AZURE_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY)']);
/** The storage account's name (shown in Settings; never the key). */
const accountName = () => az().ACCOUNT_NAME || /AccountName=([^;]+)/i.exec(az().CONNECTION_STRING)?.[1] || null;

let containerClient = null;
let containerReady = null;
function container() {
  if (!containerClient) {
    const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
    // A few quick retries: an unreachable Azure shouldn't hold a download for long
    // (the other store is tried next).
    const options = { retryOptions: { maxTries: 3, retryDelayInMs: 300, maxRetryDelayInMs: 2000 } };
    const service = az().CONNECTION_STRING
      ? BlobServiceClient.fromConnectionString(az().CONNECTION_STRING, options)
      : new BlobServiceClient(`https://${az().ACCOUNT_NAME}.blob.core.windows.net`, new StorageSharedKeyCredential(az().ACCOUNT_NAME, az().ACCOUNT_KEY), options);
    containerClient = service.getContainerClient(az().CONTAINER);
  }
  return containerClient;
}
/** Creates the (private) container on first use; a failure is retried next time. */
function ensureContainer() {
  if (!containerReady) {
    containerReady = container().createIfNotExists().catch((err) => { containerReady = null; throw err; });
  }
  return containerReady;
}
const blob = (key) => container().getBlockBlobClient(assertKey(key));
const notFound = (err) => err?.statusCode === 404 || err?.code === 'BlobNotFound' || err?.code === 'ContainerNotFound';

/**
 * Runs a write against the container; if the container has gone (deleted in
 * Azure while the app ran), creates it again and retries once.
 * @template T @param {() => Promise<T>} fn @returns {Promise<T>}
 */
async function withContainer(fn) {
  await ensureContainer();
  try { return await fn(); }
  catch (err) {
    if (err?.code !== 'ContainerNotFound') throw err;
    containerReady = null;
    await ensureContainer();
    return fn();
  }
}

/** Checks the account, key and container work (creating the container). Throws a readable error. */
async function checkBlob() {
  if (!isBlobConfigured()) throw new Error(`Azure Blob Storage isn't configured — set ${missingSettings().join(', ')} in the backend .env`);
  try { await ensureContainer(); }
  catch (err) { throw new Error(`Azure Blob Storage can't be reached: ${err.message}`); }
}

// ── Which store is on ─────────────────────────────────────────────────────────

const DRIVER_TTL_MS = 10_000;
let cached = { driver: null, at: 0 };

/** The store new files go to: BLOB only when switched on and configured. @returns {Promise<'LOCAL'|'BLOB'>} */
async function driver() {
  if (Date.now() - cached.at > DRIVER_TTL_MS) {
    const s = await prisma.companySettings.findFirst({ select: { storage_driver: true } }).catch(() => null);
    cached = { driver: s?.storage_driver === 'BLOB' ? 'BLOB' : 'LOCAL', at: Date.now() };
  }
  return cached.driver === 'BLOB' && isBlobConfigured() ? 'BLOB' : 'LOCAL';
}
/** After Settings changes the store: this instance uses it at once (others within seconds). */
function setDriverCache(value) { cached = { driver: value, at: Date.now() }; }

// ── Files ─────────────────────────────────────────────────────────────────────

/**
 * Keeps a file that was just written to disk (by multer) under its key: on
 * Blob when Blob is on (the disk copy is then removed), otherwise where it is.
 * @param {string} key @param {string} srcPath the file on disk @param {string} [contentType]
 */
async function saveFile(key, srcPath, contentType) {
  if (await driver() === 'BLOB') {
    await withContainer(() => blob(key).uploadFile(srcPath, { blobHTTPHeaders: { blobContentType: contentType || typeOf(key) } }));
    await fs.promises.unlink(srcPath).catch(() => {});
    return;
  }
  const to = localPath(key);
  if (srcPath && path.resolve(srcPath) !== path.resolve(to)) {
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    await fs.promises.rename(srcPath, to);
  }
}

async function openLocal(key) {
  const abs = localPath(key);
  const s = await fs.promises.stat(abs).catch(() => null);
  if (!s?.isFile()) return null;
  return { stream: fs.createReadStream(abs), size: s.size, contentType: typeOf(key), modified: s.mtime, from: 'LOCAL' };
}
async function openBlob(key) {
  if (!isBlobConfigured()) return null;
  try {
    const r = await blob(key).download();
    return { stream: r.readableStreamBody, size: r.contentLength, contentType: r.contentType || typeOf(key), modified: r.lastModified, from: 'BLOB' };
  } catch (err) {
    if (notFound(err)) return null;
    throw err;
  }
}

/**
 * A file to stream back: from the current store, else the other one.
 * @param {string} key
 * @returns {Promise<{ stream: NodeJS.ReadableStream, size?: number, contentType: string, modified?: Date, from: string } | null>}
 */
async function open(key) {
  assertKey(key);
  const [first, second] = await driver() === 'BLOB' ? [openBlob, openLocal] : [openLocal, openBlob];
  // One store failing (Azure unreachable, a wrong key) must not hide a file the other one has.
  let failure = null;
  const found = await first(key).catch((err) => { failure = err; return null; });
  if (found) return found;
  const other = await second(key).catch((err) => {
    logger.warn({ err, key }, 'File store: the other store could not be read');
    return null;
  });
  if (other) return other;
  if (failure) throw failure;
  return null;
}

/** Every file on disk under the roots: [{ key, size }] (links are skipped). */
function listLocal() {
  const out = [];
  const walk = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const key = `${prefix}/${e.name}`;
      if (e.isDirectory()) walk(path.join(dir, e.name), key);
      else if (e.isFile()) {
        const s = fs.statSync(path.join(dir, e.name), { throwIfNoEntry: false });
        if (s) out.push({ key, size: s.size });
      }
    }
  };
  ROOTS.forEach((r) => walk(path.join(APP_DIR, r), r));
  return out;
}

/** Every file in the container: [{ key, size }]. */
async function listBlob() {
  return withContainer(async () => {
    const out = [];
    for await (const b of container().listBlobsFlat()) {
      if (ROOTS.includes(b.name.split('/')[0])) out.push({ key: b.name, size: b.properties.contentLength ?? 0 });
    }
    return out;
  });
}

/** Copies one file disk → Blob, unless the blob is already there with the same size. @returns {Promise<boolean>} copied */
async function copyToBlob({ key, size }) {
  const props = await blob(key).getProperties().catch((err) => { if (notFound(err)) return null; throw err; });
  if (props && props.contentLength === size) return false;
  try {
    await withContainer(() => blob(key).uploadFile(localPath(key), { blobHTTPHeaders: { blobContentType: typeOf(key) } }));
  } catch (err) {
    // Gone since the listing (an upload's temporary copy, moved to Blob already).
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
  return true;
}
/** Copies one file Blob → disk, unless it is already on disk with the same size. @returns {Promise<boolean>} copied */
async function copyToLocal({ key, size }) {
  const abs = localPath(key);
  const s = await fs.promises.stat(abs).catch(() => null);
  if (s?.isFile() && s.size === size) return false;
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await blob(key).downloadToFile(abs);
  return true;
}

/**
 * Copies every file from one store to the other (nothing is deleted), keeping
 * progress up to date through `onProgress`.
 * @param {'TO_BLOB'|'TO_LOCAL'} direction
 * @param {(p: { total: number, copied: number, skipped: number, failed: number, bytes: number, failures: Array<{ key: string, error: string }> }) => Promise<void>|void} [onProgress]
 */
async function transfer(direction, onProgress = () => {}) {
  await checkBlob();
  const files = direction === 'TO_BLOB' ? listLocal() : await listBlob();
  const copy = direction === 'TO_BLOB' ? copyToBlob : copyToLocal;
  const p = { total: files.length, copied: 0, skipped: 0, failed: 0, bytes: 0, failures: [] };
  await onProgress(p);
  let last = Date.now();
  const BATCH = 4;
  for (let i = 0; i < files.length; i += BATCH) {
    await Promise.all(files.slice(i, i + BATCH).map(async (f) => {
      try {
        if (await copy(f)) { p.copied += 1; p.bytes += f.size; } else p.skipped += 1;
      } catch (err) {
        p.failed += 1;
        if (p.failures.length < 20) p.failures.push({ key: f.key, error: err.message });
        logger.warn({ err, key: f.key, direction }, 'File transfer failed for one file');
      }
    }));
    if (Date.now() - last > 1500) { last = Date.now(); await onProgress(p); }
  }
  await onProgress(p);
  return p;
}

/**
 * For a backup: puts every file — on disk and on Blob — under `dir`, as
 * `dir/storage/…` and `dir/uploads/…`. A file in both places is taken from
 * the current store.
 * @param {string} dir  an empty staging folder
 * @returns {Promise<string[]>} the roots that now exist in `dir`
 */
async function exportAll(dir) {
  const blobFirst = await driver() === 'BLOB';
  const local = listLocal();
  let fromBlob = [];
  if (blobFirst) fromBlob = await listBlob();
  else if (isBlobConfigured()) {
    // Blob is set up but not in use: include what is there, but don't fail the backup over it.
    fromBlob = await listBlob().catch((err) => { logger.warn({ err }, 'Backup: Azure Blob not readable — disk files only'); return []; });
  }
  const take = new Map();
  for (const f of blobFirst ? local : fromBlob) take.set(f.key, f);
  for (const f of blobFirst ? fromBlob : local) take.set(f.key, f);
  const blobKeys = new Set(fromBlob.map((f) => f.key));
  const localKeys = new Set(local.map((f) => f.key));
  for (const [key] of take) {
    const to = path.join(dir, ...key.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const useBlob = blobKeys.has(key) && (blobFirst || !localKeys.has(key));
    if (useBlob) await blob(key).downloadToFile(to);
    else {
      try { fs.copyFileSync(localPath(key), to); }
      catch (err) { if (err.code !== 'ENOENT') throw err; } // gone since the listing
    }
  }
  return ROOTS.filter((r) => fs.existsSync(path.join(dir, r)));
}

module.exports = {
  ROOTS, APP_DIR,
  isBlobConfigured, missingSettings, accountName, checkBlob,
  driver, setDriverCache,
  saveFile, open, listLocal, listBlob, transfer, exportAll,
  containerName: () => az().CONTAINER,
  _test: { assertKey, localPath, typeOf },
};
