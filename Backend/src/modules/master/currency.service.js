const { currencyRepository } = require('./currency.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError } = require('../../core');

/**
 * Currency business logic (Master Data → Currencies).
 *
 *   - INR is the base currency: rate 1, never edited, deactivated or deleted.
 *   - Rates are entered manually as "₹ for 1 unit" and kept as a history —
 *     a new rate is a new entry, never an overwrite. The entry with the latest
 *     effective date is the currency's current rate.
 *   - A rate can't take effect in the future (it would silently become
 *     "current" before its date).
 *   - A wrongly entered history entry can be removed, as long as the currency
 *     keeps at least one rate.
 *
 * @param {ReturnType<typeof import('./currency.repository').createCurrencyRepository>} repository
 */
function createCurrencyService(repository) {
  /** Today as a UTC-midnight Date (how DATE columns come back). */
  const today = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  };

  /** Normalises an incoming date to UTC midnight; defaults to today. */
  const toDay = (value) => {
    if (!value) return today();
    const d = new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  };

  function assertNotFuture(day) {
    if (day > today()) {
      throw new ValidationError('Validation failed', [
        { field: 'effective_from', message: 'The effective date cannot be in the future' },
      ]);
    }
  }

  async function load(code) {
    const currency = await repository.findByCode(code);
    if (!currency) throw new NotFoundError('Currency');
    return currency;
  }

  const shape = (c) => {
    const { _count, ...rest } = c;
    return { ...rest, rate: Number(c.rate), rate_entries: _count?.rates ?? 0 };
  };

  return {
    async list() {
      return (await repository.list()).map(shape);
    },

    async options() {
      return (await repository.listActiveOptions()).map((c) => ({ ...c, rate: Number(c.rate) }));
    },

    /** @param {string} code */
    async getByCode(code) {
      const currency = await load(code);
      const history = await repository.history(code);
      return { ...shape(currency), history: history.map((h) => ({ ...h, rate: Number(h.rate) })) };
    },

    /** @param {{ code: string, name: string, symbol: string, rate: number, effective_from?: Date, note?: string }} dto */
    async create(dto, actor) {
      if (await repository.findByCode(dto.code)) throw new ConflictError(`Currency ${dto.code} already exists`);
      const effective_from = toDay(dto.effective_from);
      assertNotFuture(effective_from);

      const currency = await repository.createWithRate({
        code: dto.code, name: dto.name, symbol: dto.symbol,
        rate: dto.rate, effective_from, note: dto.note ?? null,
      }, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.CREATE, entity: 'Currency', entityId: dto.code, actor,
        changes: { name: dto.name, symbol: dto.symbol, rate: dto.rate, effective_from },
      });
      return shape(currency);
    },

    /** Name / symbol / active. The rate is changed only through `addRate`. */
    async update(code, dto, actor) {
      const before = await load(code);
      if (before.is_base) throw new ConflictError('The base currency (INR) cannot be changed');

      const data = { updated_by: actor?.id ?? null };
      for (const f of ['name', 'symbol', 'is_active']) if (dto[f] !== undefined) data[f] = dto[f];
      const currency = await repository.update(code, data);

      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Currency', entityId: code, actor,
        changes: auditService.diff(before, data, ['updated_by']),
      });
      return shape(currency);
    },

    /** Adds a rate-history entry; the latest effective one becomes current. */
    async addRate(code, dto, actor) {
      const before = await load(code);
      if (before.is_base) throw new ConflictError('The base currency (INR) is always 1');
      const effective_from = toDay(dto.effective_from);
      assertNotFuture(effective_from);

      const entry = await repository.addRate(code, { rate: dto.rate, effective_from, note: dto.note ?? null }, actor?.id ?? null);
      const currency = await repository.syncCurrentRate(code, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Currency', entityId: code, actor,
        changes: {
          rate_added: { rate: dto.rate, effective_from, note: dto.note ?? null },
          current_rate: { from: Number(before.rate), to: Number(currency.rate) },
        },
      });
      return { currency: shape(currency), entry: { ...entry, rate: Number(entry.rate) } };
    },

    /** Removes a wrongly entered history entry (never the last one). */
    async deleteRate(code, rateId, actor) {
      const currency = await load(code);
      const entry = await repository.findRate(rateId);
      if (!entry || entry.currency_code !== code) throw new NotFoundError('Rate entry');
      if (currency.is_base) throw new ConflictError('The base currency (INR) is always 1');
      if ((await repository.countRates(code)) <= 1) {
        throw new ConflictError('A currency must keep at least one rate — add the correct rate first, then remove this one');
      }

      await repository.deleteRate(rateId);
      const after = await repository.syncCurrentRate(code, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE, entity: 'CurrencyRate', entityId: rateId, actor,
        changes: { currency: code, rate: Number(entry.rate), effective_from: entry.effective_from, current_rate: Number(after.rate) },
      });
      return shape(after);
    },

    /** Deletes a currency and its rate history. */
    async delete(code, actor) {
      const currency = await load(code);
      if (currency.is_base) throw new ConflictError('The base currency (INR) cannot be deleted');
      // Once enquiries carry a currency, an in-use currency will be blocked
      // here (mark it inactive instead).
      await repository.delete(code);
      await auditService.record({
        action: auditService.Action.DELETE, entity: 'Currency', entityId: code, actor,
        changes: { name: currency.name },
      });
    },
  };
}

const currencyService = createCurrencyService(currencyRepository);

module.exports = { currencyService, createCurrencyService };
