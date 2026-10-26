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

/**
 * Shows rupee amounts in another currency (the Sales "show amounts in"
 * choice): rupees ÷ that currency's rate — **today's** rate for a live amount
 * (an open enquiry), and **the rate in force on the day** for a closed one (an
 * order on the day it was won, an offer on the day it was sent), taken from
 * the currency's rate history. So a past order keeps the value it had then.
 *
 *
 * `convert` takes an amount in its own currency: one already in the display
 * currency is shown exactly as stored (a €10,000 enquiry viewed in EUR is
 * €10,000 — no round trip through rupees); any other goes via INR as above.
 *
 * @param {string} [code]  the display currency (INR or unknown: no conversion)
 * @param {import('@prisma/client').PrismaClient} [db]
 * @returns {Promise<{ code: string, fromInr: (inr: number|null, onDate?: Date|null) => number|null,
 *   convert: (amount: unknown, currency: string|undefined, rates: Record<string, number>, lockedRate?: unknown, onDate?: Date|null) => number }>}
 */
async function displayConverter(code, db = prisma) {
  const withConvert = (conv) => ({
    ...conv,
    convert: (amount, currency, rates, lockedRate, onDate) => {
      if (amount === null || amount === undefined) return 0;
      if ((currency || 'INR') === conv.code) return Number(amount);
      return conv.fromInr(toInr(amount, currency, rates, lockedRate), onDate);
    },
  });
  const none = withConvert({ code: 'INR', fromInr: (inr) => (inr === null || inr === undefined ? null : Number(inr)) });
  if (!code || code === 'INR' || !/^[A-Z]{3}$/.test(String(code))) return none;
  const cur = await db.currency.findUnique({
    where: { code },
    select: { code: true, rate: true, rates: { select: { rate: true, effective_from: true }, orderBy: { effective_from: 'asc' } } },
  });
  if (!cur || !Number(cur.rate)) return none;
  const today = Number(cur.rate);
  const history = cur.rates.map((r) => ({ from: r.effective_from.getTime(), rate: Number(r.rate) })).filter((r) => r.rate > 0);
  /** The rate in force on a day: the latest entry effective on or before it (the earliest, for a day before any). */
  const rateOn = (date) => {
    const t = new Date(date).getTime();
    let found = null;
    for (const h of history) { if (h.from <= t) found = h.rate; else break; }
    return found ?? history[0]?.rate ?? today;
  };
  return withConvert({
    code: cur.code,
    fromInr: (inr, onDate) => {
      if (inr === null || inr === undefined) return null;
      return Number(inr) / (onDate ? rateOn(onDate) : today);
    },
  });
}

module.exports = { loadRates, toInr, paise, displayConverter };
