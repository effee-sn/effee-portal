/**
 * Showing Sales amounts in another currency — open amounts at today's rate,
 * won orders and sent offers at the rate on their day — pinned down with the
 * worked example: ₹1,000 stored; €1 = ₹100 last month, ₹110 this month.
 *
 * Needs a development/test DATABASE_URL; removes what it creates.
 * Run:  npm run test:display-currency
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const env = { unavailable: false, reason: '' };
if (!process.env.DATABASE_URL) { env.unavailable = true; env.reason = 'DATABASE_URL is not set'; }
else if ((process.env.NODE_ENV || '') === 'production') { env.unavailable = true; env.reason = 'refusing to run in production'; }
const it = (name, fn) => test(name, async (t) => (env.unavailable ? t.skip(env.reason) : fn(t)));

let prisma; let fx; let enquiries; let analytics; let reports;
const CODE = 'XTE'; // a test currency, removed afterwards
const DAY = 864e5;
const lastMonth = new Date(Date.now() - 35 * DAY);
const made = { enquiries: [], customer: null };
const sys = { id: null, email: 'display-currency-test@local', is_system: true, permissions: [] };

before(async () => {
  if (env.unavailable) return;
  prisma = require('../../src/lib/prisma');
  try { await prisma.$queryRaw`SELECT 1`; } catch (err) { env.unavailable = true; env.reason = `database unreachable (${err.message.split('\n')[0]})`; return; }
  fx = require('../../src/modules/master/fx');
  ({ enquiryService: enquiries } = require('../../src/modules/sales/enquiry.service'));
  ({ analyticsService: analytics } = require('../../src/modules/sales/analytics.service'));
  ({ reportsService: reports } = require('../../src/modules/reports/reports.service'));

  await prisma.currencyRate.deleteMany({ where: { currency_code: CODE } });
  await prisma.currency.deleteMany({ where: { code: CODE } });
  const day = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  await prisma.currency.create({
    data: {
      code: CODE, name: 'Test euro', symbol: '€', rate: 110, rate_effective_from: day(new Date()), is_active: true,
      rates: { create: [{ rate: 100, effective_from: day(new Date(Date.now() - 60 * DAY)) }, { rate: 110, effective_from: day(new Date(Date.now() - 1 * DAY)) }] },
    },
  });
  made.customer = (await prisma.customer.create({ data: { name: `TEST DISPLAY CURRENCY ${Date.now()}` }, select: { id: true } })).id;
  const owner = (await prisma.user.findFirst({ where: { deleted_at: null }, select: { id: true } })).id;
  const mk = (data) => prisma.enquiry.create({
    data: { ref_no: `XTE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: 'TEST display currency', enquiry_type: 'INCOMING', customer_id: made.customer, owner_id: owner, handler_id: owner, currency_code: 'INR', ...data },
  });
  made.open = await mk({ stage: 'NEW', expected_value: 1000 });
  made.won = await mk({ stage: 'WON', expected_value: 1000, order_value: 1000, order_fx_rate: 1, won_at: lastMonth });
  // Entered in the test euro itself; the order locked at 105 (not the history's 100) on a day 70 days back.
  made.eurOpen = await mk({ stage: 'NEW', expected_value: 10000, currency_code: CODE });
  made.eurWon = await mk({ stage: 'WON', expected_value: 10000, order_value: 10000, order_fx_rate: 105, won_at: new Date(Date.now() - 70 * DAY), currency_code: CODE });
  made.enquiries.push(made.open.id, made.won.id, made.eurOpen.id, made.eurWon.id);
});

after(async () => {
  if (!prisma || env.unavailable) return;
  try {
    await prisma.enquiryStageEvent.deleteMany({ where: { enquiry_id: { in: made.enquiries } } });
    await prisma.enquiry.deleteMany({ where: { id: { in: made.enquiries } } });
    if (made.customer) await prisma.customer.delete({ where: { id: made.customer } });
    await prisma.currencyRate.deleteMany({ where: { currency_code: CODE } });
    await prisma.currency.deleteMany({ where: { code: CODE } });
  } finally { await prisma.$disconnect(); }
});

describe('Showing amounts in another currency', () => {
  it('₹1,000: today at 110 → €9.09; on a day last month at 100 → €10.00; INR is untouched', async () => {
    const eur = await fx.displayConverter(CODE);
    assert.equal(eur.code, CODE);
    assert.equal(fx.paise(eur.fromInr(1000)), 9.09, 'today');
    assert.equal(fx.paise(eur.fromInr(1000, lastMonth)), 10, 'the rate on that day');
    const inr = await fx.displayConverter('INR');
    assert.equal(inr.fromInr(1000, lastMonth), 1000);
    assert.equal((await fx.displayConverter('ZZZ')).code, 'INR', 'unknown: no conversion');
  });

  it('the enquiry list: an open one at today\'s rate, an order won last month at that day\'s rate', async () => {
    const q = { filters: { customer_id: made.customer }, search: '', orderBy: { created_at: 'desc' }, skip: 0, take: 10, display_currency: CODE };
    const { items } = await enquiries.list(q, sys);
    const byId = new Map(items.map((e) => [e.id, e]));
    assert.equal(byId.get(made.open.id).display_value, 9.09);
    assert.equal(byId.get(made.won.id).display_value, 10);
    assert.equal(byId.get(made.won.id).display_currency, CODE);
    const inr = await enquiries.list({ ...q, display_currency: undefined }, sys);
    assert.equal(inr.items.find((e) => e.id === made.won.id).display_value, 1000, 'INR view: ₹1,000');
  });

  it('an amount entered in the chosen currency shows exactly as entered: €10,000 stays €10,000', async () => {
    const q = { filters: { customer_id: made.customer }, search: '', orderBy: { created_at: 'desc' }, skip: 0, take: 10, display_currency: CODE };
    const byId = new Map((await enquiries.list(q, sys)).items.map((e) => [e.id, e]));
    assert.equal(byId.get(made.eurOpen.id).display_value, 10000, 'open');
    assert.equal(byId.get(made.eurWon.id).display_value, 10000, 'won — no round trip through the locked rate and the history');
    const page = await enquiries.getById(made.eurWon.id, sys, CODE);
    assert.equal(page.expected_value_display, 10000);
    assert.equal(page.order_value_display, 10000);
    // Viewed in INR it is still its rupee value at the locked rate.
    assert.equal((await enquiries.getById(made.eurWon.id, sys)).order_value_display, 1050000);
  });

  it('MIS reports follow the chosen currency — titles, values and the filter line', async () => {
    const q = { customer_id: made.customer };
    const inr = await reports.run('sales', 'enquiry-register', q, sys);
    const eur = await reports.run('sales', 'enquiry-register', { ...q, currency: CODE }, sys);
    assert.equal(inr.currency, 'INR');
    assert.equal(eur.currency, CODE);
    assert.equal(eur.columns.find((c) => c.key === 'value_inr').label, `Value (${CODE})`);
    const v = (r, id) => r.rows.find((x) => x.id === id).value_inr;
    assert.equal(v(inr, made.won.id), 1000, 'INR: as before');
    assert.equal(v(eur, made.open.id), 9.09, 'open: today\'s rate');
    assert.equal(v(eur, made.won.id), 10, 'won last month: that day\'s rate');
    assert.equal(v(eur, made.eurOpen.id), 10000, 'in the chosen currency: as entered');
    assert.equal(v(eur, made.eurWon.id), 10000);
    assert.match(eur.filters, new RegExp(`Amounts in ${CODE}`));
  });

  it('the dashboard adds each order at its own day\'s rate', async () => {
    const from = new Date(Date.now() - 90 * DAY); const to = new Date(Date.now() + DAY);
    const inr = await analytics.overview({ from, to });
    const eur = await analytics.overview({ from, to, currency: CODE });
    assert.equal(eur.currency, CODE);
    // Every won order in the period, each at its own day's rate: the test one (₹1,000 last month) adds €10, not €9.09.
    const month = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mInr = inr.monthly.find((m) => m.key === month(lastMonth));
    const mEur = eur.monthly.find((m) => m.key === month(lastMonth));
    assert.ok(mInr.won_value >= 1000 && mEur.won_value >= 10, 'the order is in last month');
    assert.ok(Math.abs(mEur.won_value - Math.round(mInr.won_value / 100)) <= 1, 'last month\'s orders at last month\'s rate (100), not today\'s (110)');
  });
});
