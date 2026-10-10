const prisma = require('../../lib/prisma');

/**
 * Currency data-access layer (Master Data → Currencies).
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createCurrencyRepository(db) {
  const currencySelect = Object.freeze({
    code: true, name: true, symbol: true, is_base: true, is_active: true,
    rate: true, rate_effective_from: true, created_at: true, updated_at: true,
    _count: { select: { rates: true } },
  });

  const rateSelect = Object.freeze({
    id: true, rate: true, effective_from: true, note: true, created_at: true, created_by: true,
  });

  return {
    /** Base currency first, then by code. */
    list() {
      return db.currency.findMany({ select: currencySelect, orderBy: [{ is_base: 'desc' }, { code: 'asc' }] });
    },

    /** Active currencies for dropdowns. */
    listActiveOptions() {
      return db.currency.findMany({
        where: { is_active: true },
        select: { code: true, name: true, symbol: true, is_base: true, rate: true, rate_effective_from: true },
        orderBy: [{ is_base: 'desc' }, { code: 'asc' }],
      });
    },

    /** @param {string} code */
    findByCode(code) {
      return db.currency.findUnique({ where: { code }, select: currencySelect });
    },

    /** Rate history, newest effective date first, with who entered each. @param {string} code */
    async history(code) {
      const rows = await db.currencyRate.findMany({
        where: { currency_code: code },
        select: rateSelect,
        orderBy: [{ effective_from: 'desc' }, { id: 'desc' }],
      });
      const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
      const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
      const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
      return rows.map((r) => ({ ...r, entered_by: r.created_by ? names[r.created_by] ?? null : null }));
    },

    /**
     * Creates a currency together with its first rate-history entry.
     * @param {{ code: string, name: string, symbol: string, rate: number, effective_from: Date, note: string|null }} data
     * @param {number|null} actorId
     */
    createWithRate(data, actorId) {
      return db.currency.create({
        data: {
          code: data.code, name: data.name, symbol: data.symbol,
          rate: data.rate, rate_effective_from: data.effective_from,
          created_by: actorId, updated_by: actorId,
          rates: { create: { rate: data.rate, effective_from: data.effective_from, note: data.note, created_by: actorId } },
        },
        select: currencySelect,
      });
    },

    /** @param {string} code @param {object} data */
    update(code, data) {
      return db.currency.update({ where: { code }, data, select: currencySelect });
    },

    /** @param {string} code @param {{ rate: number, effective_from: Date, note: string|null }} data @param {number|null} actorId */
    addRate(code, data, actorId) {
      return db.currencyRate.create({
        data: { currency_code: code, rate: data.rate, effective_from: data.effective_from, note: data.note, created_by: actorId },
        select: rateSelect,
      });
    },

    /** @param {number} id */
    findRate(id) {
      return db.currencyRate.findUnique({ where: { id }, select: { ...rateSelect, currency_code: true } });
    },

    /** @param {number} id */
    deleteRate(id) {
      return db.currencyRate.delete({ where: { id }, select: { id: true } });
    },

    /** @param {string} code */
    countRates(code) {
      return db.currencyRate.count({ where: { currency_code: code } });
    },

    /**
     * Re-points the currency's current rate at the latest history entry
     * (latest effective date; the most recently entered wins a tie).
     * @param {string} code @param {number|null} actorId
     */
    async syncCurrentRate(code, actorId) {
      const latest = await db.currencyRate.findFirst({
        where: { currency_code: code },
        orderBy: [{ effective_from: 'desc' }, { id: 'desc' }],
        select: { rate: true, effective_from: true },
      });
      if (!latest) return null;
      return db.currency.update({
        where: { code },
        data: { rate: latest.rate, rate_effective_from: latest.effective_from, updated_by: actorId },
        select: currencySelect,
      });
    },

    /** @param {string} code */
    delete(code) {
      return db.currency.delete({ where: { code }, select: { code: true } });
    },
  };
}

const currencyRepository = createCurrencyRepository(prisma);

module.exports = { currencyRepository, createCurrencyRepository };
