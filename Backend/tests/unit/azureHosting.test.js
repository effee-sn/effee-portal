/**
 * Hosting on Azure App Service — the database retry rules and the backup
 * kinds, pinned down.
 *
 * Run:  node --test tests/unit/azureHosting.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-of-at-least-thirty-two-characters';
const { shouldRetry } = require('../../src/lib/prisma')._test;
const { typeOf, FILE_RE } = require('../../src/modules/backup/backup.service')._test;

const e = (code, message = '') => Object.assign(new Error(message), { code });
const dead = [e('P1001'), e('P1017', 'Server has closed the connection.')];

describe('database: retry after a dropped connection', () => {
  test('a read is retried through the dead-connection sequence, at most twice', () => {
    assert.equal(shouldRetry([dead[0]], 'findMany'), true);
    assert.equal(shouldRetry(dead, 'findMany'), true);
    assert.equal(shouldRetry([...dead, e('P1017')], 'findMany'), false, 'gives up after two retries');
    assert.equal(shouldRetry([e('P2010', 'Error: server has gone away')], 'count'), true, 'by message too');
  });

  test('a write only when the first failure never reached the server', () => {
    assert.equal(shouldRetry([dead[0]], 'create'), true);
    assert.equal(shouldRetry(dead, 'update'), true);
    assert.equal(shouldRetry([e('P1017')], 'create'), false, 'lost mid-way: may have run already');
    assert.equal(shouldRetry([e('P1017')], 'deleteMany'), false);
  });

  test('other errors are never retried', () => {
    assert.equal(shouldRetry([e('P2002', 'Unique constraint failed')], 'findMany'), false);
    assert.equal(shouldRetry([e('P2024', 'Timed out fetching a new connection')], 'findMany'), false, 'pool exhausted: retrying adds load');
    assert.equal(shouldRetry([e('P1001'), e('P2002')], 'create'), false);
    assert.equal(shouldRetry([], 'findMany'), false);
  });
});

describe('backups: kinds by file name', () => {
  test('full, files-only and database-only', () => {
    assert.equal(typeOf('backup-20261103-101500.tar.gz'), 'full');
    assert.equal(typeOf('backup-20261103-101500-files.tar.gz'), 'files');
    assert.equal(typeOf('backup-20261103-101500.sql'), 'database');
  });

  test('only backup names are accepted', () => {
    for (const ok of ['backup-20261103-101500.tar.gz', 'backup-20261103-101500-files.tar.gz', 'backup-20261103-101500.sql']) {
      assert.ok(FILE_RE.test(ok), ok);
    }
    for (const bad of ['backup-20261103-101500-files.sql', 'backup-2026-11-03.tar.gz', '../backup-20261103-101500.sql', 'backup-20261103-101500-x.tar.gz']) {
      assert.ok(!FILE_RE.test(bad), bad);
    }
  });
});
