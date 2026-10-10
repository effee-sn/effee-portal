const prisma = require('../../lib/prisma');

/**
 * Currency conversion to the base currency (INR), shared by every module that
 * totals money.
 *
 *   - An open amount converts at its currency's *current* rate (Master Data →
 *     Currencies).
 *   - A won order converts at the rate locked when it was won, so past revenue
 *     never moves when a rate is updated.
 *
 * Rates are "₹ for one unit"; INR is always 1.
 */

/**
 * Current rate per currency code — every currency, active or not, since old
 * records may still use an inactive one.
 * @param {import('@prisma/client').PrismaClient} [db]
 * @returns {Promise<Record<string, number>>}
 */
async function loadRates(db = prisma) {
  const rows = await db.currency.findMany({ select: { code: true, rate: true } });
  return Object.fromEntries([['INR', 1], ...rows.map((r) => [r.code, Number(r.rate)])]);
}

/**
 * @param {unknown} amount  Decimal | number | string | null
 * @param {string} [code]   currency code (defaults to INR)
 * @param {Record<string, number>} rates
 * @param {unknown} [lockedRate]  rate locked on the record (e.g. order_fx_rate)
 * @returns {number} the amount in INR (0 for a missing amount)
 */
function toInr(amount, code, rates, lockedRate) {
  if (amount === null || amount === undefined) return 0;
  const locked = lockedRate === null || lockedRate === undefined ? null : Number(lockedRate);
  const rate = locked ?? rates[code || 'INR'] ?? 1;
  return Number(amount) * rate;
}

/** Rounds rupees to paise. */
const paise = (n) => Math.round(n * 100) / 100;

module.exports = { loadRates, toInr, paise };
