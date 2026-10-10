/**
 * Master Data → Currencies — rules pinned down.
 *
 * Runs the currency service against a real (development/test) database: the
 * base-currency guard, manual rates kept as history, "current rate" = latest
 * effective entry, and the delete rules. Creates its own currency codes and
 * removes them afterwards; refuses to run in production.
 *
 * Run:  node --test tests/integration/currency.test.js
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) {
  env.unavailable = true; env.reason = 'DATABASE_URL is not set';
} else if ((process.env.NODE_ENV || '') === 'production') {
  env.unavailable = true; env.reason = 'refusing to run against a production environment';
}

const it = (name, fn) => test(name, async (t) => {
  if (env.unavailable) return t.skip(env.reason);
  return fn(t);
});

let prisma; let currencyService;
const actor = { id: null, email: 'currency-test@local' };
// A code no real currency uses: Q + two random letters.
const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
const CODE = `Q${letter()}${letter()}`;
const day = (offset) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) {
    env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return;
  }
  ({ currencyService } = require('../../src/modules/master/currency.service'));
  await prisma.currency.deleteMany({ where: { code: CODE } });
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.currency.deleteMany({ where: { code: CODE } }); // cascades its rates
  } finally {
    await prisma.$disconnect();
  }
});

describe('Currencies', () => {
  it('INR is the base: it cannot be edited, re-rated or deleted', async () => {
    await assert.rejects(currencyService.update('INR', { name: 'Rupee' }, actor), { name: 'ConflictError' });
    await assert.rejects(currencyService.addRate('INR', { rate: 2 }, actor), { name: 'ConflictError' });
    await assert.rejects(currencyService.delete('INR', actor), { name: 'ConflictError' });
    assert.equal((await currencyService.getByCode('INR')).rate, 1);
  });

  it('a currency is created with its first rate in the history', async () => {
    const c = await currencyService.create({ code: CODE, name: 'Test Dollar', symbol: 'T$', rate: 84, effective_from: day(-30) }, actor);
    assert.equal(c.rate, 84);
    const detail = await currencyService.getByCode(CODE);
    assert.equal(detail.history.length, 1);
    await assert.rejects(
      currencyService.create({ code: CODE, name: 'Again', symbol: 'X', rate: 1 }, actor),
      { name: 'ConflictError' },
    );
  });

  it('a new rate is added to the history and becomes current; old rates are kept', async () => {
    await currencyService.addRate(CODE, { rate: 85.5, effective_from: day(-1), note: 'Q3 average' }, actor);
    const detail = await currencyService.getByCode(CODE);
    assert.equal(detail.rate, 85.5);
    assert.deepEqual(detail.history.map((h) => h.rate), [85.5, 84]);
    assert.equal(detail.history[0].note, 'Q3 average');
  });

  it('a back-dated rate goes into the history without replacing the current one', async () => {
    await currencyService.addRate(CODE, { rate: 82, effective_from: day(-60) }, actor);
    const detail = await currencyService.getByCode(CODE);
    assert.equal(detail.rate, 85.5, 'current stays the latest effective rate');
    assert.equal(detail.history.length, 3);
  });

  it('a rate cannot take effect in the future', async () => {
    await assert.rejects(
      currencyService.addRate(CODE, { rate: 90, effective_from: day(5) }, actor),
      { name: 'ValidationError' },
    );
  });

  it('removing the current entry falls back to the previous one; the last entry cannot be removed', async () => {
    let detail = await currencyService.getByCode(CODE);
    await currencyService.deleteRate(CODE, detail.history[0].id, actor);
    detail = await currencyService.getByCode(CODE);
    assert.equal(detail.rate, 84);

    for (const h of detail.history.slice(1)) await currencyService.deleteRate(CODE, h.id, actor);
    detail = await currencyService.getByCode(CODE);
    assert.equal(detail.history.length, 1);
    await assert.rejects(currencyService.deleteRate(CODE, detail.history[0].id, actor), { name: 'ConflictError' });
  });

  it('an inactive currency drops out of the dropdown options', async () => {
    await currencyService.update(CODE, { is_active: false }, actor);
    const codes = (await currencyService.options()).map((o) => o.code);
    assert.ok(!codes.includes(CODE));
    assert.equal(codes[0], 'INR', 'the base currency is listed first');
  });

  it('a currency can be deleted, with its history', async () => {
    await currencyService.delete(CODE, actor);
    assert.equal(await prisma.currencyRate.count({ where: { currency_code: CODE } }), 0);
    await assert.rejects(currencyService.getByCode(CODE), { name: 'NotFoundError' });
  });
});
