const { enquiryRepository } = require('./enquiry.repository');
const { workflowRepository } = require('./workflow.repository');
const { auditService } = require('../audit/audit.service');
const { notificationService } = require('../notification/notification.service');
const { missingForStage, GATED_STAGES } = require('./stageGate');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError, buildSearchClause } = require('../../core');

/**
 * Which role holds the enquiry at a given stage. FIELD = the initiator who
 * raised it; INTERNAL = the configured Internal Sales handler. The initiator
 * owns intake and every follow-up; Internal owns Review→offer, negotiation
 * sends, and the close.
 * @param {string} stage
 * @returns {'FIELD'|'INTERNAL'}
 */
function phaseRole(stage) {
  switch (stage) {
    case 'NEW':
    case 'CONTACTED':
    case 'FOLLOW_UP':
    case 'NEGOTIATION_FOLLOW_UP':
      return 'FIELD';
    default:
      // REVIEW, CONCEPT, COSTING, COSTING_REVIEW, OFFER_RELEASED, NEGOTIATION,
      // WON, LOST — the internal preparation / negotiation-send / close phases.
      return 'INTERNAL';
  }
}

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
    // Only the current handler (the workflow baton) may act. Falls back to the
    // field initiator when no handler is set (e.g. legacy rows).
    const gateId = enquiry.handler_id ?? enquiry.owner_id;
    if (actor?.id && actor.id === gateId) return;
    throw new ForbiddenError('Only the current handler can update this enquiry');
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

  /**
   * Prerequisite gate — a stage that requires documents can't be entered until
   * they exist (e.g. Offer Released needs concept + costing; Won needs a sent
   * offer).
   * @throws {ConflictError}
   */
  async function assertStageGate(enquiryId, targetStage) {
    const missing = missingForStage(targetStage, await repository.docFlags(enquiryId));
    if (missing.length) {
      throw new ConflictError(`Needs ${missing.join(' and ')} to move to the next stage.`);
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
      'description', 'review_notes', 'expected_value', 'expected_close', 'owner_id']) {
      if (dto[f] !== undefined) data[f] = dto[f];
    }
    return data;
  }

  /**
   * The user who should hold the enquiry at `stage`: the field initiator
   * (owner) or the configured Internal Sales handler. Falls back to the owner
   * when no internal handler is configured, so an enquiry is never left with
   * nobody able to act.
   * @param {string} stage
   * @param {number} ownerId
   * @param {number|null} internalId
   */
  function resolveHandler(stage, ownerId, internalId) {
    return phaseRole(stage) === 'INTERNAL' ? (internalId ?? ownerId) : ownerId;
  }

  /** The configured Internal Sales handler id (or null). */
  function internalHandlerId() {
    return workflowRepository.internalUserId();
  }

  /** Notifies whoever the enquiry has just been handed to (never the actor). */
  function notifyHandoff(enquiry, handlerId, actor) {
    if (!handlerId || handlerId === actor?.id) return;
    notificationService.notify({
      userIds: [handlerId],
      type: notificationService.Type.ENQUIRY_ASSIGNED,
      title: `Enquiry handed to you: ${enquiry.ref_no}`,
      body: `${enquiry.title} — now at ${enquiry.stage}`,
      entityType: 'Enquiry',
      entityId: String(enquiry.id),
      link: `/dashboard/sales/enquiries/${enquiry.id}`,
      actorId: actor?.id ?? null,
    });
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
     * Prerequisite readiness for the gated stages, so the UI can show what a
     * move needs before it's attempted.
     * @param {number} id
     */
    async readiness(id) {
      if (!(await repository.findById(id))) throw new NotFoundError('Enquiry');
      const flags = await repository.docFlags(id);
      /** @type {Record<string, string[]>} */
      const blocked = {};
      for (const stage of GATED_STAGES) blocked[stage] = missingForStage(stage, flags);
      return { flags, blocked };
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
        // The raiser is both the field initiator (owner) and the first handler.
        handler_id: resolveHandler(dto.stage || 'NEW', owner_id, null),
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
      if (dto.stage && dto.stage !== before.stage) {
        // One step forward at a time, along the enquiry-type's own flow
        // (Generated skips Contacted). No stepping back, no skipping ahead.
        // The manual flow ends at Offer Released; from there the deal moves on
        // its own — sending the offer flips it to Follow-up, flagging a
        // follow-up for negotiation flips it to Negotiation (see setStageAuto).
        const flow = before.enquiry_type === 'GENERATED'
          ? ['NEW', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED']
          : ['NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED'];
        const fromIdx = flow.indexOf(before.stage);
        const toIdx = flow.indexOf(dto.stage);
        if (fromIdx === -1 || toIdx !== fromIdx + 1) {
          throw new ConflictError('An enquiry can only move to the next stage.');
        }
        await assertStageGate(id, dto.stage);
      }

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
      if (stageChanged) {
        data.stage_since = new Date();
        // Hand the baton to whoever owns the new stage's phase.
        data.handler_id = resolveHandler(dto.stage, before.owner_id, await internalHandlerId());
      }
      const enquiry = await repository.update(id, data);
      if (stageChanged) {
        await repository.recordStageEvent({
          enquiry_id: id, from_stage: before.stage, to_stage: dto.stage, changed_by: actor?.id ?? null,
        });
        if (data.handler_id !== before.handler_id) notifyHandoff(enquiry, data.handler_id, actor);
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
     * System-driven stage move, bypassing the one-step-forward flow and the
     * document gates. Used for the Offer Released → Follow-up ⇄ Negotiation
     * loop, where sending an offer or flagging a follow-up for negotiation moves
     * the stage as a side effect rather than a manual "move to next" click.
     * No-op (returns the current row) if already at the target stage.
     * @param {number} id
     * @param {'FOLLOW_UP'|'NEGOTIATION'|'NEGOTIATION_FOLLOW_UP'} toStage
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async setStageAuto(id, toStage, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      if (before.stage === toStage) return before;

      const handler_id = resolveHandler(toStage, before.owner_id, await internalHandlerId());
      const enquiry = await repository.update(id, {
        stage: toStage, stage_since: new Date(), handler_id, updated_by: actor?.id ?? null,
      });
      await repository.recordStageEvent({
        enquiry_id: id, from_stage: before.stage, to_stage: toStage, changed_by: actor?.id ?? null,
      });
      if (handler_id !== before.handler_id) notifyHandoff(enquiry, handler_id, actor);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { stage: { from: before.stage, to: toStage }, auto: true },
      });
      return enquiry;
    },

    /**
     * Hands the enquiry to the Internal Sales handler without changing the
     * stage — used when the field person ends the follow-up (at Follow-up or
     * Negotiation Follow-up), the signal to close it out. No-op if already held
     * by that handler, or if no internal handler is configured.
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async handoffToInternal(id, actor) {
      const internalId = await internalHandlerId();
      if (!internalId) return null;
      const before = await repository.findById(id);
      if (!before || before.handler_id === internalId) return before;

      const enquiry = await repository.update(id, { handler_id: internalId, updated_by: actor?.id ?? null });
      notifyHandoff(enquiry, internalId, actor);
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
      await assertStageGate(id, 'WON');

      const data = {
        stage: 'WON',
        stage_since: new Date(),
        won_at: new Date(),
        order_no: dto.order_no ?? null,
        order_value: dto.order_value,
        order_date: dto.order_date ?? new Date(),
        won_declaration: dto.won_declaration ?? null,
        won_terms: dto.won_terms ?? null,
        handler_id: resolveHandler('WON', before.owner_id, await internalHandlerId()),
        // Clear any prior lost close-out.
        lost_at: null,
        lost_reason: null,
        lost_to: null,
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
        lost_to: dto.lost_to ?? null,
        handler_id: resolveHandler('LOST', before.owner_id, await internalHandlerId()),
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

    /** Reopens a won/lost enquiry back into the active pipeline (Follow-up). */
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
        handler_id: before.owner_id, // Follow-up is the field initiator's phase
        won_at: null, order_no: null, order_value: null, order_date: null,
        won_declaration: null, won_terms: null,
        lost_at: null, lost_reason: null, lost_to: null,
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
     * Supervisory reassignment: change the field owner (the persistent
     * initiator) and/or the current handler. Not gated to the handler — it's a
     * lead/admin action (route-authorised by SALES_EDIT) for covering someone
     * who's out. Moving the owner also moves the baton when the field owner
     * currently holds it (unless a handler is given explicitly).
     * @param {number} id
     * @param {{ owner_id?: number, handler_id?: number }} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async reassign(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');

      const data = { updated_by: actor?.id ?? null };
      if (dto.owner_id !== undefined && dto.owner_id !== before.owner_id) {
        if (!(await repository.userExists(dto.owner_id))) {
          throw new ValidationError('Validation failed', [{ field: 'owner_id', message: 'Selected owner does not exist' }]);
        }
        data.owner_id = dto.owner_id;
        // If the field initiator currently holds the baton, it follows them.
        if (before.handler_id === before.owner_id && dto.handler_id === undefined) {
          data.handler_id = dto.owner_id;
        }
      }
      if (dto.handler_id !== undefined && dto.handler_id !== before.handler_id) {
        if (!(await repository.userExists(dto.handler_id))) {
          throw new ValidationError('Validation failed', [{ field: 'handler_id', message: 'Selected handler does not exist' }]);
        }
        data.handler_id = dto.handler_id;
      }
      if (data.owner_id === undefined && data.handler_id === undefined) return before;

      const enquiry = await repository.update(id, data);
      if (data.handler_id !== undefined && data.handler_id !== before.handler_id) {
        notifyHandoff(enquiry, data.handler_id, actor);
      }

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: {
          ...(data.owner_id !== undefined ? { owner_id: { from: before.owner_id, to: data.owner_id } } : {}),
          ...(data.handler_id !== undefined ? { handler_id: { from: before.handler_id, to: data.handler_id } } : {}),
          reassigned: true,
        },
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
