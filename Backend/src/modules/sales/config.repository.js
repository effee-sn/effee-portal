const prisma = require('../../lib/prisma');

/**
 * Sales configuration data-access layer: the applications list, the
 * per-stage win probabilities and the follow-up reminder timings.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createSalesConfigRepository(db) {
  const applicationSelect = Object.freeze({
    id: true, name: true, description: true, is_active: true, sort_order: true,
    created_at: true, updated_at: true,
    _count: { select: { enquiries: { where: { deleted_at: null } } } },
  });

  return {
    listApplications() {
      return db.salesApplication.findMany({
        select: applicationSelect,
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      });
    },

    /** @param {number} id */
    findApplication(id) {
      return db.salesApplication.findUnique({ where: { id }, select: applicationSelect });
    },

    /** Case-insensitive name lookup (MariaDB's default collation is case-insensitive). @param {string} name */
    findApplicationByName(name) {
      return db.salesApplication.findFirst({ where: { name }, select: { id: true } });
    },

    /** @param {object} data */
    createApplication(data) {
      return db.salesApplication.create({ data, select: applicationSelect });
    },

    /** @param {number} id @param {object} data */
    updateApplication(id, data) {
      return db.salesApplication.update({ where: { id }, data, select: applicationSelect });
    },

    /** @param {number} id */
    deleteApplication(id) {
      return db.salesApplication.delete({ where: { id }, select: { id: true } });
    },

    /** Enquiries (including soft-deleted ones) still pointing at this application. @param {number} id */
    countEnquiriesUsing(id) {
      return db.enquiry.count({ where: { application_id: id } });
    },

    listProbabilities() {
      return db.salesStageProbability.findMany({ select: { stage: true, probability: true, updated_at: true } });
    },

    /**
     * Writes all given stage probabilities in one transaction.
     * @param {Array<{ stage: string, probability: number }>} items
     * @param {number|null} actorId
     */
    saveProbabilities(items, actorId) {
      return db.$transaction(items.map(({ stage, probability }) => db.salesStageProbability.upsert({
        where: { stage },
        update: { probability, updated_by: actorId },
        create: { stage, probability, updated_by: actorId },
      })));
    },

    listReminderSchedules() {
      return db.salesReminderSchedule.findMany({ select: { kind: true, offsets: true, updated_at: true } });
    },

    /**
     * Writes all given reminder timings in one transaction.
     * @param {Array<{ kind: string, offsets: number[] }>} items
     * @param {number|null} actorId
     */
    saveReminderSchedules(items, actorId) {
      return db.$transaction(items.map(({ kind, offsets }) => db.salesReminderSchedule.upsert({
        where: { kind },
        update: { offsets: offsets.join(','), updated_by: actorId },
        create: { kind, offsets: offsets.join(','), updated_by: actorId },
      })));
    },
  };
}

const salesConfigRepository = createSalesConfigRepository(prisma);

module.exports = { salesConfigRepository, createSalesConfigRepository };
