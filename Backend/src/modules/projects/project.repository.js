const prisma = require('../../lib/prisma');

/**
 * Project data-access layer — the only file in the projects resource that
 * touches Prisma.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createProjectRepository(db) {
  const projectListSelect = Object.freeze({
    id: true,
    code: true,
    name: true,
    status: true,
    enquiry_id: true,
    enquiry: { select: { id: true, ref_no: true, title: true } },
    owner_id: true,
    owner: { select: { id: true, name: true } },
    start_date: true,
    end_date: true,
    created_at: true,
  });

  const projectDetailSelect = Object.freeze({
    ...projectListSelect,
    description: true,
    updated_at: true,
    created_by: true,
  });

  /** @param {Record<string, unknown>} [where] */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    projectListSelect,
    projectDetailSelect,
    active,

    /** @param {object} params */
    async findPage({ where, orderBy, skip, take }) {
      const scoped = active(where);
      const [items, total] = await Promise.all([
        db.project.findMany({ where: scoped, select: projectListSelect, orderBy, skip, take }),
        db.project.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /** @param {number} id */
    findById(id) {
      return db.project.findFirst({ where: active({ id }), select: projectDetailSelect });
    },

    /**
     * Highest code for a given `PRJ-YYYY-` prefix — zero-padded suffixes sort
     * lexically the same as numerically, so a desc order gives the latest.
     * @param {string} prefix
     */
    async maxCodeForPrefix(prefix) {
      const row = await db.project.findFirst({
        where: { code: { startsWith: prefix } },
        orderBy: { code: 'desc' },
        select: { code: true },
      });
      return row?.code ?? null;
    },

    /** @param {object} data */
    create(data) {
      return db.project.create({ data, select: projectDetailSelect });
    },

    /** @param {number} id @param {object} data */
    update(id, data) {
      return db.project.update({ where: { id }, data, select: projectDetailSelect });
    },

    /** @param {number} id @param {number|null} [actorId] */
    softDelete(id, actorId = null) {
      return db.project.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Won enquiries available to link to a project: stage WON, not already
     * linked to a live project. `allowId` keeps one enquiry in the list even if
     * it is linked — the project being edited passes its own current link so it
     * still appears.
     * @param {{ search?: string, allowId?: number, take?: number }} params
     */
    availableWonEnquiries({ search, allowId, take = 20 }) {
      const notLinked = { projects: { none: { deleted_at: null } } };
      const and = [{ deleted_at: null, stage: 'WON' }];
      if (search) {
        and.push({ OR: [{ ref_no: { contains: search } }, { title: { contains: search } }] });
      }
      and.push(allowId ? { OR: [notLinked, { id: allowId }] } : notLinked);
      return db.enquiry.findMany({
        where: { AND: and },
        select: { id: true, ref_no: true, title: true, stage: true, customer: { select: { name: true } } },
        orderBy: { created_at: 'desc' },
        take,
      });
    },

    // ── Foreign-key existence checks ──────────────────────────────────────────

    /** True when the enquiry is WON and not already linked to a live project
     * (unless it is the one `allowId` permits — the edited project's own link). */
    async enquiryLinkable(id, allowId) {
      if (allowId && id === allowId) return true;
      const row = await db.enquiry.findFirst({
        where: { id, deleted_at: null, stage: 'WON', projects: { none: { deleted_at: null } } },
        select: { id: true },
      });
      return row !== null;
    },

    async userExists(id) {
      const row = await db.user.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
      return row !== null;
    },
  };
}

const projectRepository = createProjectRepository(prisma);

module.exports = { projectRepository, createProjectRepository };
