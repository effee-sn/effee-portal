const { salesConfigRepository } = require('./config.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError } = require('../../core');

/**
 * Sales configuration business logic (Sales → Configuration).
 *
 *   - **Applications** — the list an enquiry's application is picked from
 *     (Annealing, Hardening, …). Names are unique. One already used by an
 *     enquiry can't be deleted; it is marked inactive instead, which hides it
 *     from new enquiries while existing ones keep it.
 *   - **Stage probabilities** — win % per stage, used for the weighted
 *     pipeline. WON is fixed at 100 and LOST at 0.
 *
 * @param {ReturnType<typeof import('./config.repository').createSalesConfigRepository>} repository
 */
function createSalesConfigService(repository) {
  const STAGES = Object.freeze([
    'NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW',
    'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST',
  ]);
  const FIXED = Object.freeze({ WON: 100, LOST: 0 });

  // Fallback when a stage row is missing (e.g. a database seeded before the
  // migration's defaults): matches the migration's defaults.
  const DEFAULTS = Object.freeze({
    NEW: 10, CONTACTED: 15, REVIEW: 20, CONCEPT: 30, COSTING: 40, COSTING_REVIEW: 45,
    OFFER_RELEASED: 50, FOLLOW_UP: 60, NEGOTIATION: 75, NEGOTIATION_FOLLOW_UP: 80, WON: 100, LOST: 0,
  });

  const shape = (a) => {
    const { _count, ...rest } = a;
    return { ...rest, enquiry_count: _count.enquiries };
  };

  async function assertNameFree(name, exceptId) {
    const clash = await repository.findApplicationByName(name);
    if (clash && clash.id !== exceptId) throw new ConflictError(`An application named "${name}" already exists`);
  }

  return {
    STAGES,

    async listApplications() {
      return (await repository.listApplications()).map(shape);
    },

    /** @param {{ name: string, description?: string, is_active?: boolean, sort_order?: number }} dto */
    async createApplication(dto, actor) {
      await assertNameFree(dto.name);
      const app = await repository.createApplication({
        name: dto.name,
        description: dto.description ?? null,
        is_active: dto.is_active ?? true,
        sort_order: dto.sort_order ?? 0,
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });
      await auditService.record({
        action: auditService.Action.CREATE, entity: 'SalesApplication', entityId: app.id, actor,
        changes: { name: app.name },
      });
      return shape(app);
    },

    /** @param {number} id */
    async updateApplication(id, dto, actor) {
      const before = await repository.findApplication(id);
      if (!before) throw new NotFoundError('Application');
      if (dto.name !== undefined && dto.name !== before.name) await assertNameFree(dto.name, id);

      const data = { updated_by: actor?.id ?? null };
      for (const f of ['name', 'description', 'is_active', 'sort_order']) {
        if (dto[f] !== undefined) data[f] = dto[f];
      }
      const app = await repository.updateApplication(id, data);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'SalesApplication', entityId: id, actor,
        changes: dto,
      });
      return shape(app);
    },

    /** @param {number} id */
    async deleteApplication(id, actor) {
      const before = await repository.findApplication(id);
      if (!before) throw new NotFoundError('Application');
      const used = await repository.countEnquiriesUsing(id);
      if (used > 0) {
        throw new ConflictError(
          `"${before.name}" is used by ${used} ${used === 1 ? 'enquiry' : 'enquiries'} and can't be deleted — mark it inactive instead`
        );
      }
      await repository.deleteApplication(id);
      await auditService.record({
        action: auditService.Action.DELETE, entity: 'SalesApplication', entityId: id, actor,
        changes: { name: before.name },
      });
    },

    /** Probability per stage, in pipeline order, with WON/LOST pinned. */
    async listProbabilities() {
      const rows = Object.fromEntries((await repository.listProbabilities()).map((r) => [r.stage, r]));
      return STAGES.map((stage) => ({
        stage,
        probability: FIXED[stage] ?? rows[stage]?.probability ?? DEFAULTS[stage],
        fixed: stage in FIXED,
        updated_at: rows[stage]?.updated_at ?? null,
      }));
    },

    /** `{ STAGE: percent }` — for weighting the pipeline. */
    async probabilityMap() {
      return Object.fromEntries((await this.listProbabilities()).map((r) => [r.stage, r.probability]));
    },

    /** @param {{ items: Array<{ stage: string, probability: number }> }} dto */
    async saveProbabilities(dto, actor) {
      // WON / LOST are fixed and silently ignored if sent.
      const items = dto.items.filter((i) => !(i.stage in FIXED));
      await repository.saveProbabilities(items, actor?.id ?? null);
      await auditService.record({
        action: auditService.Action.SETTINGS_UPDATED, entity: 'SalesStageProbability', entityId: null, actor,
        changes: Object.fromEntries(items.map((i) => [i.stage, i.probability])),
      });
      return this.listProbabilities();
    },
  };
}

const salesConfigService = createSalesConfigService(salesConfigRepository);

module.exports = { salesConfigService, createSalesConfigService };
