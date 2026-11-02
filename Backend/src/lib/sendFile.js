const fileStore = require('./fileStore');

/**
 * Streams a file opened from the file store (disk or Azure Blob) to the
 * response.
 *
 * @param {import('express').Response} res
 * @param {{ stream: NodeJS.ReadableStream, size?: number, contentType?: string, modified?: Date }} file
 * @param {{ name?: string, type?: string, inline?: boolean, cache?: string }} [opts]
 *   name: download file name (sent as an attachment unless `inline`);
 *   type: content type (else the stored one); cache: Cache-Control value
 */
function sendFile(res, file, { name, type, inline = false, cache = 'private, no-store' } = {}) {
  if (name && !inline) res.attachment(name);
  res.type(type || file.contentType || 'application/octet-stream');
  if (file.size != null) res.setHeader('Content-Length', String(file.size));
  if (file.modified) res.setHeader('Last-Modified', new Date(file.modified).toUTCString());
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  file.stream.on('error', (err) => {
    // Headers may be out already: all that's left is to end the response.
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
  // The browser gave up (cancelled, navigated away): stop reading the file / blob.
  res.on('close', () => { if (!res.writableFinished) file.stream.destroy?.(); });
  file.stream.pipe(res);
}

/**
 * Express middleware for `/uploads/*` files that aren't on this server's disk
 * (express.static ran first): serves them from Azure Blob. Public files only
 * (the company logo) — the documents under storage/ never go through here.
 * @type {import('express').RequestHandler}
 */
async function serveUploads(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let key;
  try { key = `uploads${decodeURIComponent(req.path)}`; } catch { return next(); }
  if (!fileStore.isBlobConfigured() || key.split('/').some((p) => p.startsWith('.'))) return next();
  try {
    const file = await fileStore.open(key);
    if (!file) return next();
    if (req.method === 'HEAD') { file.stream.destroy?.(); res.type(file.contentType); return res.end(); }
    return sendFile(res, file, { inline: true, cache: 'public, max-age=86400' });
  } catch (err) {
    return next(err.message?.startsWith('Invalid file key') ? undefined : err);
  }
}

module.exports = { sendFile, serveUploads };
