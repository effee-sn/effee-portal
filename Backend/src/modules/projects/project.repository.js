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
    _count: { select: { machines: { where: { deleted_at: null } } } },
  });

  const machineSelect = Object.freeze({
    id: true, machine_no: true, name: true, description: true, sort_order: true, created_at: true, updated_at: true,
  });

  const projectDetailSelect = Object.freeze({
    ...projectListSelect,
    description: true,
    updated_at: true,
    created_by: true,
    machines: { where: { deleted_at: null }, select: machineSelect, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] },
  });

  /**
   * Gives `n` new machines of a project their Machine IDs, inside `tx`: the
   * counter in settings is advanced by `n` in one UPDATE (which locks the
   * row), so two people adding machines at once never get the same ID.
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {number} projectId @param {number} n
   * @param {(p: { machine_prefix: string, machine_separator: string, machine_digits: number }, n: number) => string} formatNo
   * @param {{ name?: string|null, actorId?: number|null }} [extra]
   */
  async function addMachinesIn(tx, projectId, n, formatNo, { name = null, actorId = null } = {}) {
    if (n < 1) return [];
    const settings = (await tx.companySettings.findFirst({ select: { id: true } })) ?? (await tx.companySettings.create({ data: {}, select: { id: true } }));
    const p = await tx.companySettings.update({
      where: { id: settings.id },
      data: { machine_next: { increment: n } },
      select: { machine_prefix: true, machine_separator: true, machine_digits: true, machine_next: true },
    });
    const nos = Array.from({ length: n }, (_, i) => formatNo(p, p.machine_next - n + i));
    const taken = await tx.projectMachine.findMany({ where: { machine_no: { in: nos } }, select: { machine_no: true } });
    if (taken.length) {
      const err = new Error(`Machine ID ${taken.map((t) => t.machine_no).join(', ')} already exists`);
      err.code = 'MACHINE_NO_TAKEN';
      throw err;
    }
    const last = await tx.projectMachine.aggregate({ where: { project_id: projectId }, _max: { sort_order: true } });
    const start = (last._max.sort_order ?? -1) + 1;
    await tx.projectMachine.createMany({
      data: nos.map((machine_no, i) => ({
        project_id: projectId, machine_no, name: n === 1 ? name : (name ? `${name} ${i + 1}` : null),
        sort_order: start + i, created_by: actorId, updated_by: actorId,
      })),
    });
    return nos;
  }

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

    /** A project and its first `machines` machines, together. */
    create(data, machines, formatNo) {
      return db.$transaction(async (tx) => {
        const p = await tx.project.create({ data, select: { id: true } });
        await addMachinesIn(tx, p.id, machines, formatNo, { actorId: data.created_by ?? null });
        return tx.project.findUnique({ where: { id: p.id }, select: projectDetailSelect });
      });
    },

    /** More machines for a project; returns their Machine IDs. */
    addMachines(projectId, n, formatNo, extra) {
      return db.$transaction((tx) => addMachinesIn(tx, projectId, n, formatNo, extra));
    },

    /** A live machine of a project. @param {number} projectId @param {number} machineId */
    findMachine(projectId, machineId) {
      return db.projectMachine.findFirst({ where: { id: machineId, project_id: projectId, deleted_at: null }, select: machineSelect });
    },

    updateMachine(machineId, data) {
      return db.projectMachine.update({ where: { id: machineId }, data, select: machineSelect });
    },

    /** BOM revisions (any) with lines for this machine. @param {number} machineId */
    machineBomRevs(machineId) {
      return db.projectBom.findMany({ where: { lines: { some: { machine_id: machineId } } }, select: { rev: true, status: true }, orderBy: { rev: 'asc' } });
    },

    softDeleteMachine(machineId, actorId) {
      return db.projectMachine.update({ where: { id: machineId }, data: { deleted_at: new Date(), updated_by: actorId }, select: { id: true } });
    },

    /** The Machine ID numbering, and how many machines exist (any project). */
    async machineNumbering() {
      const s = (await db.companySettings.findFirst()) ?? (await db.companySettings.create({ data: {} }));
      const used = await db.projectMachine.count();
      return { id: s.id, machine_prefix: s.machine_prefix, machine_separator: s.machine_separator, machine_digits: s.machine_digits, machine_next: s.machine_next, used };
    },

    setMachineNumbering(id, data) {
      return db.companySettings.update({ where: { id }, data, select: { id: true } });
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
