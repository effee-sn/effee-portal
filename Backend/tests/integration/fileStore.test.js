/**
 * File storage: this server's disk ↔ Azure Blob Storage — pinned down.
 *
 * Runs against Azurite (the local Azure Storage emulator) on 127.0.0.1:10000:
 *   npx azurite@3 azurite-blob --skipApiVersionCheck --loose
 * Needs a development/test DATABASE_URL; puts the storage setting back and
 * removes what it creates (its own container, its own test files).
 * Run:  npm run test:storage
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

require('dotenv').config();
const tag = `t${Date.now().toString().slice(-7)}`;
process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.AZURE_STORAGE_ACCOUNT_NAME = '';
process.env.AZURE_STORAGE_CONTAINER = `files-${tag}`;

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }

const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

const reachable = () => new Promise((resolve) => {
  const s = net.connect(10000, '127.0.0.1');
  s.once('connect', () => { s.end(); resolve(true); });
  s.once('error', () => resolve(false));
});

let prisma; let store; let storage; let settingsRow;
const dir = `storage/zz-test-${tag}`;
const keys = { a: `${dir}/a.pdf`, b: `${dir}/b.pdf`, c: `${dir}/c.pdf` };
const tmpFile = (text) => { const p = path.join(os.tmpdir(), `${tag}-${Math.random().toString(36).slice(2)}.pdf`); fs.writeFileSync(p, text); return p; };
const read = (file) => new Promise((resolve, reject) => {
  const parts = [];
  file.stream.on('data', (d) => parts.push(d)).on('end', () => resolve(Buffer.concat(parts).toString())).on('error', reject);
});
/** Waits for the background transfer to finish. */
async function settled() {
  for (let i = 0; i < 200; i += 1) {
    const s = await storage.status();
    if (s.transfer && s.transfer.status !== 'RUNNING') return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('transfer did not finish');
}

before(async () => {
  if (env.unavailable) return;
  if (!(await reachable())) { env.unavailable = true; env.reason = 'Azurite is not running on 127.0.0.1:10000'; return; }
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  store = require('../../src/lib/fileStore');
  ({ storageService: storage } = require('../../src/modules/settings/storage.service'));
  settingsRow = await prisma.companySettings.findFirst();
  await prisma.companySettings.update({ where: { id: settingsRow.id }, data: { storage_driver: 'LOCAL', storage_transfer: null } });
  store.setDriverCache('LOCAL');
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.companySettings.update({
      where: { id: settingsRow.id },
      data: { storage_driver: settingsRow.storage_driver, storage_transfer: settingsRow.storage_transfer },
    });
    fs.rmSync(path.join(store.APP_DIR, ...dir.split('/')), { recursive: true, force: true });
    const { BlobServiceClient } = require('@azure/storage-blob');
    await BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true').getContainerClient(`files-${tag}`).deleteIfExists();
  } finally { await prisma.$disconnect(); }
});

describe('File storage: disk and Azure Blob', () => {
  it('on this server, a file is kept on disk and read back from there', async () => {
    await store.saveFile(keys.a, tmpFile('A'), 'application/pdf');
    assert.ok(fs.existsSync(path.join(store.APP_DIR, ...keys.a.split('/'))));
    const f = await store.open(keys.a);
    assert.equal(f.from, 'LOCAL');
    assert.equal(await read(f), 'A');
  });

  it('switching to Blob with transfer copies the files there, and new files go to Blob', async () => {
    const s = await storage.update({ driver: 'BLOB', transfer: true }, { name: 'Test' });
    assert.equal(s.driver, 'BLOB');
    assert.equal(s.active, 'BLOB');
    const done = await settled();
    assert.equal(done.transfer.status, 'DONE', JSON.stringify(done.transfer));
    assert.equal(done.transfer.direction, 'TO_BLOB');
    assert.ok(done.transfer.copied >= 1);

    const a = await store.open(keys.a);
    assert.equal(a.from, 'BLOB', 'read from Blob now');
    assert.equal(await read(a), 'A');

    const src = tmpFile('B');
    await store.saveFile(keys.b, src, 'application/pdf');
    assert.ok(!fs.existsSync(path.join(store.APP_DIR, ...keys.b.split('/'))), 'not kept on disk');
    assert.ok(!fs.existsSync(src), 'upload copy removed');
    const b = await store.open(keys.b);
    assert.equal(b.from, 'BLOB');
    assert.equal(b.contentType, 'application/pdf');
    assert.equal(await read(b), 'B');
  });

  it('a second transfer skips what is already there; a file only on disk still opens', async () => {
    await storage.transfer('TO_BLOB', null);
    const again = await settled();
    assert.equal(again.transfer.copied, 0);
    assert.ok(again.transfer.skipped >= 1);

    const onlyLocal = path.join(store.APP_DIR, ...keys.c.split('/'));
    fs.writeFileSync(onlyLocal, 'C');
    const c = await store.open(keys.c);
    assert.equal(c.from, 'LOCAL', 'falls back to the disk');
    assert.equal(await read(c), 'C');
    assert.equal(await store.open(`${dir}/missing.pdf`), null);
  });

  it('a backup gathers files from both places', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), `${tag}-bk-`));
    try {
      const roots = await store.exportAll(out);
      assert.ok(roots.includes('storage'));
      assert.equal(fs.readFileSync(path.join(out, ...keys.b.split('/')), 'utf8'), 'B', 'from Blob');
      assert.equal(fs.readFileSync(path.join(out, ...keys.c.split('/')), 'utf8'), 'C', 'from disk');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  });

  it('switching back with transfer brings Blob files to this server', async () => {
    const s = await storage.update({ driver: 'LOCAL', transfer: true }, null);
    assert.equal(s.active, 'LOCAL');
    const done = await settled();
    assert.equal(done.transfer.direction, 'TO_LOCAL');
    assert.equal(done.transfer.status, 'DONE', JSON.stringify(done.transfer));
    assert.equal(fs.readFileSync(path.join(store.APP_DIR, ...keys.b.split('/')), 'utf8'), 'B');
    const b = await store.open(keys.b);
    assert.equal(b.from, 'LOCAL');
    b.stream.destroy();
  });

  it('a container deleted while the app runs is created again on the next upload', async () => {
    await storage.update({ driver: 'BLOB', transfer: false }, null);
    const { BlobServiceClient } = require('@azure/storage-blob');
    await BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true').getContainerClient(`files-${tag}`).delete();
    const key = `${dir}/after-delete.pdf`;
    await store.saveFile(key, tmpFile('D'), 'application/pdf');
    const d = await store.open(key);
    assert.equal(d.from, 'BLOB');
    assert.equal(await read(d), 'D');
  });

  it('with Azure unreachable, files on this server still open and missing ones are "not found", not an error', async () => {
    const config = require('../../src/config/env');
    const saved = config.AZURE_STORAGE.CONNECTION_STRING;
    const local = path.join(store.APP_DIR, ...keys.a.split('/'));
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, 'A');
    // A fresh copy of the store, pointed at an endpoint nothing listens on.
    delete require.cache[require.resolve('../../src/lib/fileStore')];
    config.AZURE_STORAGE.CONNECTION_STRING = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:9/devstoreaccount1;';
    try {
      const broken = require('../../src/lib/fileStore');
      broken.setDriverCache('BLOB');
      const a = await broken.open(keys.a);
      assert.equal(a.from, 'LOCAL', 'falls back to the disk');
      assert.equal(await read(a), 'A');
      broken.setDriverCache('LOCAL');
      assert.equal(await broken.open(`${dir}/nowhere.pdf`), null);
    } finally {
      config.AZURE_STORAGE.CONNECTION_STRING = saved;
      delete require.cache[require.resolve('../../src/lib/fileStore')];
    }
  });

  it('keys can never leave the storage folders', () => {
    for (const bad of ['storage/../.env', 'src/app.js', 'uploads', 'uploads//x', 'storage/./x', 'storage\\x']) {
      assert.throws(() => store._test.assertKey(bad), /Invalid file key/, bad);
    }
  });
});
