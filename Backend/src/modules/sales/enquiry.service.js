const { enquiryRepository } = require('./enquiry.repository');
const { auditService } = require('../audit/audit.service');
const { notificationService } = require('../notification/notification.service');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError, buildSearchClause } = require('../../core');

/**
 * Enquiry business logic — the opportunity pipeline. WON / LOST are reached
 * through the dedicated `win` / `lose` methods so their close-out data is
 * always captured; ordinary stage moves go through `update`.
 *
 * @param {ReturnType<typeof import('./enquiry.repository').createEnquiryRepository>} repository
 */
function createEnquiryService(repository) {
  const SORTABLE_FIELDS   = Object.freeze(['created_at', 'expected_close', 'title', 'stage', 'ref_no']);
  const SEARCHABLE_FIELDS = Object.freeze(['ref_no', 'title']);

  // Config for parseListQuery — turns query params into a Prisma `where`.
  const FILTERABLE = Object.freeze({
    stage:        (v) => v,
    enquiry_type: (v) => v,
    owner_id:     (v) => Number(v) || undefined,
    customer_id:  (v) => Number(v) || undefined,
  });

  /**
   * The stage work (review → offer → close) is done by the assigned owner.
   * Only they, or a system user, may edit/advance an enquiry.
   * @throws {ForbiddenError}
   */
  function assertCanManage(enquiry, actor) {
    if (actor?.is_system) return;
    if (actor?.id && actor.id === enquiry.owner_id) return;
    throw new ForbiddenError('Only the assigned owner can update this enquiry');
  }

  /**
   * CONTACTED belongs to the INCOMING path only — a GENERATED enquiry (field
   * sales already interacted) skips straight to REVIEW.
   * @throws {ValidationError}
   */
  function assertStageAllowed(stage, enquiryType) {
    if (stage === 'CONTACTED' && enquiryType === 'GENERATED') {
      throw new ValidationError('Validation failed', [
        { field: 'stage', message: 'A generated enquiry does not use the Contacted stage' },
      ]);
    }
  }

  /** Next `ENQ-YYYY-NNNN` reference for the current year. */
  async function nextRefNo() {
    const year = new Date().getFullYear();
    const prefix = `ENQ-${year}-`;
    const latest = await repository.maxRefForPrefix(prefix);
    const seq = latest ? Number(latest.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  /** Validates the customer / contact / owner references on a write. */
  async function assertRefs({ customer_id, contact_id, owner_id }) {
    if (customer_id !== undefined && !(await repository.customerExists(customer_id))) {
      throw new ValidationError('Validation failed', [
        { field: 'customer_id', message: 'Selected customer does not exist' },
      ]);
    }
    if (contact_id !== undefined && contact_id !== null) {
      // A contact must belong to the enquiry's customer.
      if (customer_id === undefined) {
        throw new ValidationError('Validation failed', [
          { field: 'contact_id', message: 'Cannot set a contact without its customer' },
        ]);
      }
      if (!(await repository.contactBelongsToCustomer(contact_id, customer_id))) {
        throw new ValidationError('Validation failed', [
          { field: 'contact_id', message: 'Selected contact does not belong to this customer' },
        ]);
      }
    }
    if (owner_id !== undefined && owner_id !== null && !(await repository.userExists(owner_id))) {
      throw new ValidationError('Validation failed', [
        { field: 'owner_id', message: 'Selected owner does not exist' },
      ]);
    }
  }

  function pickWritable(dto, data = {}) {
    for (const f of ['title', 'customer_id', 'contact_id', 'enquiry_type', 'stage',
      'description', 'expected_value', 'expected_close', 'owner_id']) {
      if (dto[f] !== undefined) data[f] = dto[f];
    }
    return data;
  }

  /** Notifies a newly assigned owner (never the actor themselves). */
  function notifyOwner(enquiry, actor) {
    notificationService.notify({
      userIds: [enquiry.owner_id],
      type: notificationService.Type.ENQUIRY_ASSIGNED,
      title: `Enquiry assigned: ${enquiry.ref_no}`,
      body: `${enquiry.title} — ${enquiry.customer?.name ?? 'customer'}`,
      entityType: 'Enquiry',
      entityId: String(enquiry.id),
      link: `/dashboard/sales/enquiries/${enquiry.id}`,
      actorId: actor?.id ?? null,
    });
  }

  return {
    SORTABLE_FIELDS,
    FILTERABLE,

    /** @param {import('../../core/http/queryOptions').ListQuery} query */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const where = { ...query.filters, ...(search || {}) };
      return repository.findPage({ where, orderBy: query.orderBy, skip: query.skip, take: query.take });
    },

    /** @param {number} id @throws {NotFoundError} */
    async getById(id) {
      const enquiry = await repository.findById(id);
      if (!enquiry) throw new NotFoundError('Enquiry');
      return enquiry;
    },

    /**
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async create(dto, actor) {
      // Owner defaults to whoever raises the enquiry.
      const owner_id = dto.owner_id ?? actor?.id ?? null;
      if (!owner_id) {
        throw new ValidationError('Validation failed', [
          { field: 'owner_id', message: 'An owner is required' },
        ]);
      }
      await assertRefs({ customer_id: dto.customer_id, contact_id: dto.contact_id, owner_id });
      if (dto.stage) assertStageAllowed(dto.stage, dto.enquiry_type || 'INCOMING');

      const data = pickWritable(dto, {
        owner_id,
        ref_no: await nextRefNo(),
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      const enquiry = await repository.create(data);
      await repository.recordStageEvent({
        enquiry_id: enquiry.id, from_stage: null, to_stage: enquiry.stage, changed_by: actor?.id ?? null,
      });

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Enquiry',
        entityId: enquiry.id,
        actor,
        changes: { ref_no: enquiry.ref_no, title: enquiry.title, customer_id: enquiry.customer_id },
      });

      notifyOwner(enquiry, actor);
      return enquiry;
    },

    /**
     * @param {number} id
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      assertCanManage(before, actor);
      if (dto.stage) assertStageAllowed(dto.stage, dto.enquiry_type ?? before.enquiry_type);

      // Resolve the effective customer for contact validation (new or existing).
      const customer_id = dto.customer_id ?? before.customer_id;
      await assertRefs({
        customer_id: dto.customer_id !== undefined ? customer_id : undefined,
        contact_id: dto.contact_id,
        owner_id: dto.owner_id,
      });
      // A contact change alone must still match the existing customer.
      if (dto.contact_id !== undefined && dto.contact_id !== null && dto.customer_id === undefined) {
        if (!(await repository.contactBelongsToCustomer(dto.contact_id, customer_id))) {
          throw new ValidationError('Validation failed', [
            { field: 'contact_id', message: 'Selected contact does not belong to this customer' },
          ]);
        }
      }

      const stageChanged = dto.stage !== undefined && dto.stage !== before.stage;
      const data = pickWritable(dto, { updated_by: actor?.id ?? null });
      if (stageChanged) data.stage_since = new Date();
      const enquiry = await repository.update(id, data);
      if (stageChanged) {
        await repository.recordStageEvent({
          enquiry_id: id, from_stage: before.stage, to_stage: dto.stage, changed_by: actor?.id ?? null,
        });
      }

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: auditService.diff(before, data),
      });

      // Notify a newly assigned owner.
      if (dto.owner_id !== undefined && dto.owner_id !== before.owner_id) notifyOwner(enquiry, actor);
      return enquiry;
    },

    /**
     * Marks an enquiry WON and records the order. Idempotency guard: refuses if
     * already won.
     */
    async win(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      assertCanManage(before, actor);
      if (before.stage === 'WON') throw new ConflictError('Enquiry is already marked won');

      const data = {
        stage: 'WON',
        stage_since: new Date(),
        won_at: new Date(),
        order_no: dto.order_no ?? null,
        order_value: dto.order_value,
        order_date: dto.order_date ?? new Date(),
        // Clear any prior lost close-out.
        lost_at: null,
        lost_reason: null,
        updated_by: actor?.id ?? null,
      };
      const enquiry = await repository.update(id, data);
      await repository.recordStageEvent({ enquiry_id: id, from_stage: before.stage, to_stage: 'WON', changed_by: actor?.id ?? null });

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { stage: { from: before.stage, to: 'WON' }, order_value: dto.order_value, order_no: dto.order_no ?? null },
      });

      // Congratulate / inform the owner (unless they closed it themselves).
      notificationService.notify({
        userIds: [enquiry.owner_id],
        type: notificationService.Type.ENQUIRY_WON,
        title: `Order won: ${enquiry.ref_no}`,
        body: `${enquiry.title} — ${enquiry.customer?.name ?? 'customer'}`,
        entityType: 'Enquiry',
        entityId: String(enquiry.id),
        link: `/dashboard/sales/enquiries/${enquiry.id}`,
        actorId: actor?.id ?? null,
      });

      return enquiry;
    },

    /** Marks an enquiry LOST with a reason. */
    async lose(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      assertCanManage(before, actor);
      if (before.stage === 'LOST') throw new ConflictError('Enquiry is already marked lost');

      const data = {
        stage: 'LOST',
        stage_since: new Date(),
        lost_at: new Date(),
        lost_reason: dto.lost_reason,
        updated_by: actor?.id ?? null,
      };
      const enquiry = await repository.update(id, data);
      await repository.recordStageEvent({ enquiry_id: id, from_stage: before.stage, to_stage: 'LOST', changed_by: actor?.id ?? null });

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { stage: { from: before.stage, to: 'LOST' }, lost_reason: dto.lost_reason },
      });

      return enquiry;
    },

    /** Reopens a won/lost enquiry back into the active pipeline (Negotiation). */
    async reopen(id, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      assertCanManage(before, actor);
      if (before.stage !== 'WON' && before.stage !== 'LOST') {
        throw new ConflictError('Only a won or lost enquiry can be reopened');
      }

      const data = {
        stage: 'FOLLOW_UP',
        stage_since: new Date(),
        won_at: null, order_no: null, order_value: null, order_date: null,
        lost_at: null, lost_reason: null,
        updated_by: actor?.id ?? null,
      };
      const enquiry = await repository.update(id, data);
      await repository.recordStageEvent({ enquiry_id: id, from_stage: before.stage, to_stage: 'FOLLOW_UP', changed_by: actor?.id ?? null });

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { stage: { from: before.stage, to: 'FOLLOW_UP' }, reopened: true },
      });

      return enquiry;
    },

    /**
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async remove(id, actor) {
      const enquiry = await repository.findById(id);
      if (!enquiry) throw new NotFoundError('Enquiry');

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { ref_no: enquiry.ref_no, soft_deleted: true },
      });
    },
  };
}

const enquiryService = createEnquiryService(enquiryRepository);

module.exports = { enquiryService, createEnquiryService };
