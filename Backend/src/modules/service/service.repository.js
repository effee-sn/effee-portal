const prisma = require('../../lib/prisma');

/**
 * Service (ticket) data-access layer.
 *
 * The only file in the module that touches Prisma. Soft-delete scoping is
 * applied here through `active`, so no read elsewhere can accidentally surface
 * a deleted ticket.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createServiceRepository(db) {
  /** Columns returned for a ticket. Explicit so schema additions stay opt-in. */
  const ticketSelect = Object.freeze({
    id: true,
    ticket_id: true,
    ticket_type: true,
    source_details: true,
    company_name: true,
    company_location: true,
    reported_by: true,
    reported_by_phone: true,
    reported_by_email: true,
    complaint_date: true,
    complaint_time: true,
    machine_project: true,
    machine_serial_no: true,
    issue_title: true,
    issue_description: true,
    issue_severity: true,
    // Classification (triage)
    technical_category: true,
    originating_department_id: true,
    originating_department: { select: { id: true, name: true } },
    // Impacts
    impact_details: true,
    // Resolution
    service_location: true,
    customer_confirmed: true,
    observation_until: true,
    reopened_count: true,
    // Workflow assignment
    workflow_id: true,
    current_step_id: true,
    assigned_user_id: true,
    assigned_department_id: true,
    assigned_role_id: true,
    assigned_to_name: true,
    assigned_by_id: true,
    assigned_by_name: true,
    decline_reason: true,
    participants: {
      select: { user_id: true, user_name: true, stage_label: true, created_at: true },
      orderBy: { created_at: 'asc' },
    },
    status: true,
    created_at: true,
    updated_at: true,
    created_by: true,
    created_by_name: true,
  });

  /** @param {Record<string, unknown>} [where] */
  const active = (where = {}) => ({ ...where, deleted_at: null });

  /** Scopes to soft-deleted rows only — the inverse of `active`, for the trash. */
  const deleted = (where = {}) => ({ ...where, deleted_at: { not: null } });

  return {
    ticketSelect,

    /**
     * @param {object} params
     * @param {Record<string, unknown>} params.where
     * @param {Record<string, 'asc'|'desc'>} params.orderBy
     * @param {number} params.skip
     * @param {number} params.take
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async findPage({ where, orderBy, skip, take }) {
      const scoped = active(where);
      const [items, total] = await Promise.all([
        db.serviceTicket.findMany({ where: scoped, select: ticketSelect, orderBy, skip, take }),
        db.serviceTicket.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /**
     * @param {number} id
     * @returns {Promise<object|null>}
     */
    findById(id) {
      return db.serviceTicket.findFirst({ where: active({ id }), select: ticketSelect });
    },

    /**
     * The trash — soft-deleted tickets only.
     *
     * @param {object} params { where, orderBy, skip, take }
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async findDeletedPage({ where, orderBy, skip, take }) {
      const scoped = deleted(where);
      const [items, total] = await Promise.all([
        db.serviceTicket.findMany({ where: scoped, select: ticketSelect, orderBy, skip, take }),
        db.serviceTicket.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /**
     * A specific soft-deleted ticket — used to validate restore / purge targets
     * (the normal `findById` is scoped to live rows and would not find it).
     * @param {number} id
     * @returns {Promise<object|null>}
     */
    findDeletedById(id) {
      return db.serviceTicket.findFirst({ where: deleted({ id }), select: ticketSelect });
    },

    /**
     * Clears the soft-delete flag, bringing a ticket back.
     * @param {number} id @param {number|null} [actorId]
     * @returns {Promise<object>}
     */
    restore(id, actorId = null) {
      return db.serviceTicket.update({
        where: { id },
        data: { deleted_at: null, updated_by: actorId },
        select: ticketSelect,
      });
    },

    /**
     * Permanently removes a ticket. Its department tasks, plans, and participants
     * are removed too via `onDelete: Cascade`. Irreversible.
     * @param {number} id
     * @returns {Promise<{ id: number }>}
     */
    hardDelete(id) {
      return db.serviceTicket.delete({ where: { id }, select: { id: true } });
    },

    /**
     * A department with its configured head — used when dispatching / routing a
     * department task to its lead.
     *
     * @param {number} departmentId
     * @returns {Promise<{ id: number, name: string, head_user_id: number|null, head: { name: string }|null }|null>}
     */
    findDepartmentWithHead(departmentId) {
      return db.department.findFirst({
        where: { id: departmentId, deleted_at: null },
        select: { id: true, name: true, head_user_id: true, head: { select: { name: true } } },
      });
    },

    /**
     * A live user's id + name, for re-assigning a stage to a specific person.
     * @param {number} userId
     * @returns {Promise<{ id: number, name: string }|null>}
     */
    findUserById(userId) {
      return db.user.findFirst({
        where: { id: userId, deleted_at: null, status: 'ACTIVE' },
        select: { id: true, name: true, department_id: true },
      });
    },

    /**
     * Tickets currently assigned to a user — directly, via their department, or
     * via their role. Powers the "My Tickets" inbox.
     *
     * @param {{ id: number, department_id?: number|null, role_id?: number|null }} user
     * @param {object} params { where, orderBy, skip, take }
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async findInbox(user, { where = {}, orderBy, skip, take }) {
      /** @type {Array<Record<string, unknown>>} */
      const mine = [
        { assigned_user_id: user.id },
        // Tickets I've been involved in at any stage — so the PM keeps seeing a
        // ticket after routing it onward, not only while it's currently theirs.
        { participants: { some: { user_id: user.id } } },
      ];
      if (user.department_id) mine.push({ assigned_department_id: user.department_id });
      if (user.role_id) mine.push({ assigned_role_id: user.role_id });

      const scoped = active({ ...where, OR: mine });

      const [items, total] = await Promise.all([
        db.serviceTicket.findMany({ where: scoped, select: ticketSelect, orderBy, skip, take }),
        db.serviceTicket.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /**
     * Records a person as a participant of a ticket (idempotent). Called
     * whenever a stage resolves to a specific user.
     *
     * @param {number} ticketId
     * @param {number} userId
     * @param {string|null} userName
     * @param {string|null} stageLabel
     */
    addParticipant(ticketId, userId, userName, stageLabel) {
      return db.ticketParticipant.upsert({
        where: { ticket_id_user_id: { ticket_id: ticketId, user_id: userId } },
        update: { stage_label: stageLabel },
        create: { ticket_id: ticketId, user_id: userId, user_name: userName, stage_label: stageLabel },
      });
    },

    /**
     * @param {number} id
     * @returns {Promise<boolean>}
     */
    async existsById(id) {
      const found = await db.serviceTicket.findFirst({ where: active({ id }), select: { id: true } });
      return found !== null;
    },

    /**
     * @param {number} departmentId
     * @returns {Promise<boolean>}
     */
    async departmentExists(departmentId) {
      const dept = await db.department.findFirst({ where: { id: departmentId, deleted_at: null }, select: { id: true } });
      return dept !== null;
    },

    /**
     * Creates a ticket and assigns its human-readable `ticket_id`.
     *
     * Runs in a transaction: the row is inserted with a temporary unique
     * placeholder, then stamped `SRV-<zero-padded id>`. Deriving the reference
     * from the primary key guarantees uniqueness and monotonic ordering without
     * a separate counter or a race between concurrent creates.
     *
     * @param {object} data Validated ticket fields (no ticket_id).
     * @returns {Promise<object>}
     */
    create(data) {
      return db.$transaction(async (tx) => {
        const created = await tx.serviceTicket.create({
          // Placeholder is unique and clearly temporary; it never reaches a
          // client because the same transaction overwrites it.
          data: { ...data, ticket_id: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
          select: { id: true },
        });

        return tx.serviceTicket.update({
          where: { id: created.id },
          data: { ticket_id: `SRV-${String(created.id).padStart(6, '0')}` },
          select: ticketSelect,
        });
      });
    },

    /**
     * @param {number} id
     * @param {object} data
     * @returns {Promise<object>}
     */
    update(id, data) {
      return db.serviceTicket.update({ where: { id }, data, select: ticketSelect });
    },

    /**
     * Soft-deletes a ticket.
     *
     * @param {number} id
     * @param {number|null} [actorId]
     * @returns {Promise<{ id: number }>}
     */
    softDelete(id, actorId = null) {
      return db.serviceTicket.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /**
     * Aggregate counts for the Service dashboard.
     *
     * Uses `groupBy` so the whole breakdown is two round-trips rather than one
     * per status/severity bucket.
     *
     * @returns {Promise<{
     *   total: number,
     *   byStatus: Record<string, number>,
     *   bySeverity: Record<string, number>,
     * }>}
     */
    async stats() {
      const where = active();

      const [total, byStatus, bySeverity] = await Promise.all([
        db.serviceTicket.count({ where }),
        db.serviceTicket.groupBy({ by: ['status'], where, _count: { _all: true } }),
        db.serviceTicket.groupBy({ by: ['issue_severity'], where, _count: { _all: true } }),
      ]);

      const toMap = (rows, key) =>
        Object.fromEntries(rows.map((r) => [r[key], r._count._all]));

      return {
        total,
        byStatus: toMap(byStatus, 'status'),
        bySeverity: toMap(bySeverity, 'issue_severity'),
      };
    },

    /**
     * The most recent tickets, for the dashboard's activity list.
     *
     * @param {number} take
     * @returns {Promise<object[]>}
     */
    recent(take) {
      return db.serviceTicket.findMany({
        where: active(),
        select: ticketSelect,
        orderBy: { created_at: 'desc' },
        take,
      });
    },
  };
}

const serviceRepository = createServiceRepository(prisma);

module.exports = { serviceRepository, createServiceRepository };
