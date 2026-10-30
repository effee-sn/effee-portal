const { enquiryRepository } = require('./enquiry.repository');
const { activityRepository } = require('./activity.repository');
const { workflowRepository } = require('./workflow.repository');
const { auditService } = require('../audit/audit.service');
const { notificationService } = require('../notification/notification.service');
const { missingForStage, GATED_STAGES, manualFlow } = require('./stageGate');
const { currencyService } = require('../master/currency.service');
const { loadRates, toInr, paise, displayConverter } = require('../master/fx');
const { NEXT_STEP, enquiryRows, money, sentence, stageName } = require('./emailDetails');
const { salesEvent } = require('./flowEvents');
const { resolveAssignment } = require('../flowengine/assignment');
const { checkGuard } = require('../flowengine/guard');
const { approvalsService } = require('../flowengine/approvals.service');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError, buildSearchClause } = require('../../core');
const {
  canReassign, assertFlowWork, assertDetailsEdit, assertCanWin, assertCanLose, enquiryScope, assertCanSeeEnquiry,
} = require('./access');

/** Human label for a stage enum, for notification text (`FOLLOW_UP` → `Follow up`). */
function stageLabel(stage) {
  const s = String(stage || '').replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Stages where the final costing value can be entered (Costing Review on). */
const COSTED_STAGES = Object.freeze(['COSTING_REVIEW', 'OFFER_RELEASED', 'NEGOTIATION']);

/**
 * Which role holds the enquiry at a given stage. FIELD = the initiator who
 * raised it; INTERNAL = the configured Internal Sales handler. The initiator
 * owns intake, every follow-up, and the close (Won/Lost); Internal owns
 * Review→offer and the negotiation sends.
 * @param {string} stage
 * @returns {'FIELD'|'INTERNAL'}
 */
function phaseRole(stage) {
  switch (stage) {
    case 'NEW':
    case 'CONTACTED':
    case 'FOLLOW_UP':
    case 'NEGOTIATION_FOLLOW_UP':
    case 'WON':
    case 'LOST':
      return 'FIELD';
    default:
      // REVIEW, CONCEPT, COSTING, COSTING_REVIEW, OFFER_RELEASED, NEGOTIATION —
      // the internal preparation / negotiation-send phases.
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
  // customer / owner sort by their name (see list); stage sorts in flow order (the column is an enum).
  const SORTABLE_FIELDS   = Object.freeze(['created_at', 'expected_close', 'title', 'stage', 'ref_no', 'customer', 'owner', 'expected_value']);
  const SEARCHABLE_FIELDS = Object.freeze(['ref_no', 'title']);

  // Config for parseListQuery — turns query params into a Prisma `where`.
  const FILTERABLE = Object.freeze({
    stage:        (v) => v,
    enquiry_type: (v) => v,
    owner_id:     (v) => Number(v) || undefined,
    customer_id:  (v) => Number(v) || undefined,
    application_id: (v) => Number(v) || undefined,
  });

  /**
   * The stage work (review → offer → close) is done by the current handler
   * with Sales → Edit (or a system user) — see ./access.
   * @throws {ForbiddenError}
   */
  function assertCanManage(enquiry, actor) {
    assertFlowWork(enquiry, actor, 'update this enquiry');
  }

  /**
   * An update. Moving the stage is the holder's work (the flow gives access);
   * anything else is the enquiry's details — the raiser's, with Sales → Edit;
   * changing the owner is a reassignment.
   * @throws {ForbiddenError}
   */
  function assertCanUpdate(enquiry, dto, actor) {
    if (actor?.is_system) return;
    assertFlowWork(enquiry, actor, 'update this enquiry');
    const details = Object.keys(dto).filter((k) => dto[k] !== undefined && k !== 'stage');
    if (details.length) assertDetailsEdit(enquiry, actor);
    if (dto.owner_id !== undefined && dto.owner_id !== null && dto.owner_id !== enquiry.owner_id && !canReassign(actor)) {
      throw new ForbiddenError('You need the Sales reassign permission to change the owner');
    }
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
   * they exist (e.g. Offer needs concept + costing; Won needs a sent
   * offer).
   * @throws {ConflictError}
   */
  async function assertStageGate(enquiryId, targetStage, refurbishment = false) {
    const missing = missingForStage(targetStage, await repository.docFlags(enquiryId), { refurbishment });
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
  /**
   * Adds the rupee equivalents next to the original-currency amounts: the
   * expected value at the currency's current rate, the order value at the rate
   * locked when it was won.
   */
  function withInr(e, rates) {
    if (!e) return e;
    return {
      ...e,
      expected_value_inr: e.expected_value === null || e.expected_value === undefined
        ? null : paise(toInr(e.expected_value, e.currency_code, rates)),
      order_value_inr: e.order_value === null || e.order_value === undefined
        ? null : paise(toInr(e.order_value, e.currency_code, rates, e.order_fx_rate)),
    };
  }

  async function withMoney(enquiry) {
    return withInr(enquiry, await loadRates());
  }

  /** A newly chosen application must exist and be active (inactive ones stay on old enquiries). */
  async function assertApplication(applicationId) {
    if (applicationId === undefined || applicationId === null) return;
    if (!(await repository.applicationActive(applicationId))) {
      throw new ValidationError('Validation failed', [
        { field: 'application_id', message: 'Selected application does not exist or is inactive' },
      ]);
    }
  }

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
    for (const f of ['title', 'customer_id', 'contact_id', 'enquiry_type', 'is_refurbishment', 'stage',
      'description', 'expected_value', 'expected_close', 'owner_id', 'application_id', 'currency_code']) {
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

  /**
   * Who holds the enquiry as it enters `stage`: what a Flow Builder flow says,
   * else the built-in rule above (owner, or the Internal Sales handler). When
   * the flow sends it to a department's queue, its head holds it until they
   * pick a member. Returns the fields to write; every stage move clears an
   * earlier queue.
   * @param {string} stage @param {number} ownerId  the owner it will have
   * @param {object|null} enquiry  the enquiry before the move (a partial one while it is being created)
   */
  async function holderFor(stage, ownerId, enquiry) {
    const { userId, departmentId } = await resolveAssignment(
      { module: 'SALES', stage, entity: enquiry ? { ...enquiry, owner_id: ownerId } : null },
      async () => resolveHandler(stage, ownerId, phaseRole(stage) === 'INTERNAL' ? await internalHandlerId() : null),
    );
    return {
      handler_id: userId,
      queue_department_id: departmentId,
      queued_at: departmentId ? new Date() : null,
      queue_reminded_at: null,
    };
  }

  /** What the hand-off notification says when the enquiry waits for the head to pick a member. */
  const QUEUED_NOTE = 'waiting for you to assign it to someone in your team';

  /** Notifies whoever the enquiry has just been handed to (never the actor). */
  function notifyHandoff(enquiry, handlerId, actor, note) {
    if (!handlerId || handlerId === actor?.id) return;
    notificationService.notify({
      userIds: [handlerId],
      type: notificationService.Type.ENQUIRY_ASSIGNED,
      title: `Enquiry handed to you: ${enquiry.ref_no}`,
      body: `${enquiry.title} — ${note || `now at ${stageLabel(enquiry.stage)}`}`,
      entityType: 'Enquiry',
      entityId: String(enquiry.id),
      link: `/dashboard/sales/enquiries/${enquiry.id}`,
      actorId: actor?.id ?? null,
      email: {
        intro: sentence(note) || `It's now at ${stageName(enquiry.stage)} and with you. ${NEXT_STEP[enquiry.stage] || ''}`.trim(),
        details: enquiryRows(enquiry, [['Next step', NEXT_STEP[enquiry.stage]]]),
      },
    });
  }

  /**
   * Tells everyone with a stake in the deal how it closed: the field owner, the
   * internal handler, and whoever raised it — minus the person who closed it.
   */
  /**
   * Changes the stage once: the approvals relied on are used up first (given back
   * if the move does not happen), and the write only lands if the enquiry is
   * still where it was read — a double click or two people at once move it once.
   * @throws {ConflictError} when it was moved in the meantime
   */
  async function moveOnce(id, fromStage, data, guard) {
    if (guard) await guard.done();
    let enquiry;
    try { enquiry = await repository.moveFrom(id, fromStage, data); } catch (err) { if (guard) await guard.release(); throw err; }
    if (!enquiry) {
      if (guard) await guard.release();
      throw new ConflictError('This enquiry was just moved by someone else — reload to see where it is');
    }
    return enquiry;
  }

  async function notifyClose(enquiry, actor, { type, title, body, email }) {
    await notificationService.notify({
      email,
      userIds: [enquiry.owner_id, await internalHandlerId(), enquiry.created_by],
      type,
      title,
      body,
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
      email: {
        intro: "You're now the owner of this enquiry.",
        details: enquiryRows(enquiry, [['Next step', NEXT_STEP[enquiry.stage]]]),
      },
      entityType: 'Enquiry',
      entityId: String(enquiry.id),
      link: `/dashboard/sales/enquiries/${enquiry.id}`,
      actorId: actor?.id ?? null,
    });
  }

  return {
    SORTABLE_FIELDS,
    FILTERABLE,

    /**
     * @param {import('../../core/http/queryOptions').ListQuery} query
     * @param {object} [actor]  limits the list to their own enquiries when that is all they may see
     */
    async list(query, actor) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const scope = enquiryScope(actor);
      const base = { ...query.filters, ...(search || {}) };
      const where = scope ? { AND: [base, scope] } : base;
      // Customer / field person sort by name; a stable tie-break keeps paging steady.
      const [[field, dir] = ['created_at', 'desc']] = Object.entries(query.orderBy || {});
      const orderBy = [field === 'customer' ? { customer: { name: dir } } : field === 'owner' ? { owner: { name: dir } } : { [field]: dir }, { id: 'desc' }];
      const page = await repository.findPage({ where, orderBy, skip: query.skip, take: query.take });
      const [rates, conv] = await Promise.all([loadRates(), displayConverter(query.display_currency)]);
      // display_value: the value shown (order once won, else expected) in the chosen
      // currency — as stored when that is its own currency; else a won order at the
      // rate on the day it was won, and an open one at today's.
      return {
        ...page,
        items: page.items.map((e) => {
          const r = withInr(e, rates);
          const won = e.stage === 'WON';
          const amount = won ? e.order_value : e.expected_value;
          const shown = amount === null ? null : paise(conv.convert(amount, e.currency_code, rates, won ? e.order_fx_rate : null, won ? e.won_at : null));
          return { ...r, display_currency: conv.code, display_value: shown };
        }),
      };
    },

    /**
     * @param {number} id @param {object} [actor]
     * @param {string} [displayCurrency]  also give its values in this currency (the expected value at
     *   today's rate, the order at the rate on the day it was won)
     * @throws {NotFoundError}
     */
    async getById(id, actor, displayCurrency) {
      const enquiry = await repository.findById(id);
      if (!enquiry) throw new NotFoundError('Enquiry');
      assertCanSeeEnquiry(enquiry, actor);
      const e = await withMoney(enquiry);
      const [rates, conv] = await Promise.all([loadRates(), displayConverter(displayCurrency)]);
      return {
        ...e,
        display_currency: conv.code,
        expected_value_display: enquiry.expected_value === null ? null : paise(conv.convert(enquiry.expected_value, enquiry.currency_code, rates)),
        order_value_display: enquiry.order_value === null ? null : paise(conv.convert(enquiry.order_value, enquiry.currency_code, rates, enquiry.order_fx_rate, enquiry.won_at)),
      };
    },

    /**
     * Prerequisite readiness for the gated stages, so the UI can show what a
     * move needs before it's attempted.
     * @param {number} id
     */
    async readiness(id, actor) {
      const enquiry = await repository.findById(id);
      if (!enquiry) throw new NotFoundError('Enquiry');
      assertCanSeeEnquiry(enquiry, actor);
      const flags = await repository.docFlags(id);
      /** @type {Record<string, string[]>} */
      const blocked = {};
      const opts = { refurbishment: enquiry.is_refurbishment };
      for (const stage of GATED_STAGES) blocked[stage] = missingForStage(stage, flags, opts);
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
      await assertApplication(dto.application_id);
      // New enquiries start in the default currency (Master Data → Currencies).
      const currency_code = dto.currency_code ?? await currencyService.defaultCode();
      if (dto.currency_code) await currencyService.assertSelectable(dto.currency_code);

      // Every enquiry starts at NEW — a stage passed by the caller is ignored,
      // so creation can never skip the gates or the handoffs.
      const { stage: _ignored, ...fields } = dto;
      const data = pickWritable(fields, {
        currency_code,
        stage: 'NEW',
        owner_id,
        // The raiser is both the field initiator (owner) and the first handler.
        ...(await holderFor('NEW', owner_id, { owner_id, created_by: actor?.id ?? null })),
        ref_no: await nextRefNo(),
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      const enquiry = await repository.create(data);
      await repository.recordStageEvent({
        enquiry_id: enquiry.id, from_stage: null, to_stage: enquiry.stage, changed_by: actor?.id ?? null, handler_id: enquiry.handler_id ?? null,
      });

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Enquiry',
        entityId: enquiry.id,
        actor,
        changes: { ref_no: enquiry.ref_no, title: enquiry.title, customer_id: enquiry.customer_id },
      });

      notifyOwner(enquiry, actor);
      await salesEvent('ENQUIRY_CREATED', enquiry.id, actor);
      await salesEvent('STAGE_ENTERED', enquiry.id, actor, { from: null, to: enquiry.stage });
      return withMoney(enquiry);
    },

    /**
     * @param {number} id
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      assertCanSeeEnquiry(before, actor);
      assertCanUpdate(before, dto, actor);
      // The type picks the flow (Generated skips Contacted), so it's fixed once
      // the enquiry leaves NEW — switching mid-flow could strand it on a stage
      // its new flow doesn't have.
      if (dto.enquiry_type !== undefined && dto.enquiry_type !== before.enquiry_type && before.stage !== 'NEW') {
        throw new ValidationError('Validation failed', [
          { field: 'enquiry_type', message: 'The enquiry type can only be changed while the enquiry is New' },
        ]);
      }
      // Refurbishment decides whether Concept is in the flow, so it can only
      // change before Concept would be reached (New, Contacted, Review).
      if (dto.is_refurbishment !== undefined && dto.is_refurbishment !== before.is_refurbishment
        && !['NEW', 'CONTACTED', 'REVIEW'].includes(before.stage)) {
        throw new ValidationError('Validation failed', [
          { field: 'is_refurbishment', message: 'Refurbishment can only be changed until the Review stage' },
        ]);
      }
      const refurbishment = dto.is_refurbishment ?? before.is_refurbishment;
      if (dto.stage) assertStageAllowed(dto.stage, dto.enquiry_type ?? before.enquiry_type);
      if (dto.stage === 'CONCEPT' && refurbishment) {
        throw new ConflictError('A refurbishment enquiry skips Concept — it moves from Review to Costing.');
      }
      if (dto.stage && dto.stage !== before.stage) {
        // One step forward at a time, along the enquiry's own flow (Generated
        // skips Contacted; refurbishment skips Concept). No stepping back, no
        // skipping ahead. The manual flow ends at Offer; from there
        // the deal moves on its own — sending the offer flips it to Follow-up,
        // flagging a follow-up for negotiation flips it to Negotiation.
        const flow = manualFlow(before.enquiry_type, refurbishment);
        const fromIdx = flow.indexOf(before.stage);
        const toIdx = flow.indexOf(dto.stage);
        if (fromIdx === -1 || toIdx !== fromIdx + 1) {
          throw new ConflictError('An enquiry can only move to the next stage.');
        }
        await assertStageGate(id, dto.stage, refurbishment);
      }

      if (dto.application_id !== before.application_id) await assertApplication(dto.application_id);
      if (dto.currency_code !== undefined && dto.currency_code !== before.currency_code) {
        // A closed deal's amounts (and a won order's locked rate) belong to
        // its currency — reopen it first to change.
        if (before.stage === 'WON' || before.stage === 'LOST') {
          throw new ConflictError('The currency of a closed enquiry cannot be changed — reopen it first');
        }
        await currencyService.assertSelectable(dto.currency_code);
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
      const ownerChanged = dto.owner_id !== undefined && dto.owner_id !== null && dto.owner_id !== before.owner_id;
      // A Flow Builder "Before moving to a stage" flow may hold the move for approval.
      const guard = stageChanged ? await checkGuard({
        module: 'SALES', type: 'BEFORE_STAGE_MOVE', entityId: id, payload: { from: before.stage, to: dto.stage }, actionKey: `STAGE:${before.stage}>${dto.stage}`, actor,
      }) : null;
      const data = pickWritable(dto, { updated_by: actor?.id ?? null });
      if (stageChanged) {
        data.stage_since = new Date();
        // Hand the baton to whoever owns the new stage's phase.
        Object.assign(data, await holderFor(dto.stage, data.owner_id ?? before.owner_id, before));
      } else if (ownerChanged && (before.handler_id ?? before.owner_id) === before.owner_id) {
        // Same rule as Reassign: when the field owner holds the baton, it
        // follows them to the new owner.
        data.handler_id = dto.owner_id;
      }
      const enquiry = stageChanged ? await moveOnce(id, before.stage, data, guard) : await repository.update(id, data);
      if (stageChanged) {
        await repository.recordStageEvent({
          enquiry_id: id, from_stage: before.stage, to_stage: dto.stage, changed_by: actor?.id ?? null, handler_id: enquiry.handler_id ?? null,
        });
        if (data.handler_id !== before.handler_id) notifyHandoff(enquiry, data.handler_id, actor, data.queue_department_id ? QUEUED_NOTE : undefined);
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
      if (stageChanged) await salesEvent('STAGE_ENTERED', id, actor, { from: before.stage, to: dto.stage });
      return withMoney(enquiry);
    },

    /**
     * System-driven stage move, bypassing the one-step-forward flow and the
     * document gates. Used for the Offer → Follow-up ⇄ Negotiation
     * loop, where sending an offer or flagging a follow-up for negotiation moves
     * the stage as a side effect rather than a manual "move to next" click.
     * No-op (returns the current row) if already at the target stage.
     * @param {number} id
     * @param {'FOLLOW_UP'|'NEGOTIATION'|'NEGOTIATION_FOLLOW_UP'} toStage
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async setStageAuto(id, toStage, actor, { note } = {}) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      if (before.stage === toStage) return before;

      const hold = await holderFor(toStage, before.owner_id, before);
      const { handler_id } = hold;
      const enquiry = await repository.moveFrom(id, before.stage, {
        stage: toStage, stage_since: new Date(), ...hold, updated_by: actor?.id ?? null,
      });
      if (!enquiry) return repository.findById(id); // moved by someone else a moment ago
      await repository.recordStageEvent({
        enquiry_id: id, from_stage: before.stage, to_stage: toStage, changed_by: actor?.id ?? null, handler_id,
      });
      if (handler_id !== before.handler_id) notifyHandoff(enquiry, handler_id, actor, hold.queue_department_id ? `${note ? `${note} — ` : ''}${QUEUED_NOTE}` : note);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { stage: { from: before.stage, to: toStage }, auto: true },
      });
      await salesEvent('STAGE_ENTERED', id, actor, { from: before.stage, to: toStage, auto: true });
      return withMoney(enquiry);
    },

    /**
     * Marks an enquiry WON and records the order. Idempotency guard: refuses if
     * already won.
     */
    async win(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      assertCanSeeEnquiry(before, actor);
      assertCanWin(before, actor);
      if (before.stage === 'WON') throw new ConflictError('Enquiry is already marked won');
      await assertStageGate(id, 'WON');
      // Today's rate: locked on the order below, and what a "Before marking won" flow compares.
      const rate = (await loadRates())[before.currency_code] ?? 1;
      const guard = await checkGuard({
        module: 'SALES', type: 'BEFORE_WON', entityId: id, actionKey: `WON:${before.stage}:${Number(dto.order_value)}:${before.currency_code}`, actor,
        payload: { from: before.stage, order_value: Number(dto.order_value), order_value_inr: paise(Number(dto.order_value) * rate) },
      });

      const data = {
        stage: 'WON',
        stage_since: new Date(),
        won_at: new Date(),
        order_no: dto.order_no ?? null,
        order_value: dto.order_value,
        // Lock today's rate so this order's rupee value never moves.
        order_fx_rate: rate,
        order_date: dto.order_date ?? new Date(),
        won_declaration: dto.won_declaration ?? null,
        won_terms: dto.won_terms ?? null,
        ...(await holderFor('WON', before.owner_id, before)),
        // Clear any prior lost close-out.
        lost_at: null,
        lost_reason: null,
        lost_to: null,
        updated_by: actor?.id ?? null,
      };
      const enquiry = await moveOnce(id, before.stage, data, guard);
      await repository.recordStageEvent({ enquiry_id: id, from_stage: before.stage, to_stage: 'WON', changed_by: actor?.id ?? null, handler_id: data.handler_id });
      // Its open follow-ups close with it.
      await activityRepository.closeFollowUpsOfEnquiry(id);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { stage: { from: before.stage, to: 'WON' }, order_value: dto.order_value, order_no: dto.order_no ?? null },
      });

      // Congratulate / inform the owner (unless they closed it themselves).
      await notifyClose(enquiry, actor, {
        type: notificationService.Type.ENQUIRY_WON,
        title: `Order won: ${enquiry.ref_no}`,
        body: `${enquiry.title} — ${enquiry.customer?.name ?? 'customer'}`,
        email: {
          eyebrow: 'Sales · Order won',
          intro: 'The customer has confirmed the order.',
          details: enquiryRows({ ...enquiry, expected_value: null }, [
            ['Order value', money(enquiry.order_value, enquiry.currency_code, enquiry.currency?.symbol)],
            ['PO number', enquiry.order_no],
            ['PO date', enquiry.order_date ? new Date(enquiry.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null],
          ]),
        },
      });

      await salesEvent('ENQUIRY_WON', id, actor, { from: before.stage, order_value: Number(dto.order_value), order_value_inr: paise(Number(dto.order_value) * rate) });
      await salesEvent('STAGE_ENTERED', id, actor, { from: before.stage, to: 'WON' });
      return withMoney(enquiry);
    },

    /** Marks an enquiry LOST with a reason. */
    async lose(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      assertCanSeeEnquiry(before, actor);
      assertCanLose(before, actor);
      if (before.stage === 'LOST') throw new ConflictError('Enquiry is already marked lost');
      const guard = await checkGuard({
        module: 'SALES', type: 'BEFORE_LOST', entityId: id, actionKey: `LOST:${before.stage}`, actor,
        payload: { from: before.stage, lost_reason: dto.lost_reason, lost_to: dto.lost_to ?? null },
      });

      const data = {
        stage: 'LOST',
        stage_since: new Date(),
        lost_at: new Date(),
        lost_reason: dto.lost_reason,
        lost_to: dto.lost_to ?? null,
        ...(await holderFor('LOST', before.owner_id, before)),
        updated_by: actor?.id ?? null,
      };
      const enquiry = await moveOnce(id, before.stage, data, guard);
      await repository.recordStageEvent({ enquiry_id: id, from_stage: before.stage, to_stage: 'LOST', changed_by: actor?.id ?? null, handler_id: data.handler_id });
      await activityRepository.closeFollowUpsOfEnquiry(id);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { stage: { from: before.stage, to: 'LOST' }, lost_reason: dto.lost_reason },
      });

      await notifyClose(enquiry, actor, {
        type: notificationService.Type.ENQUIRY_LOST,
        title: `Enquiry lost: ${enquiry.ref_no}`,
        body: `${enquiry.title} — ${dto.lost_reason}${dto.lost_to ? ` (went to ${dto.lost_to})` : ''}`,
        email: {
          eyebrow: 'Sales · Lost',
          intro: 'This enquiry has been marked lost.',
          details: enquiryRows({ ...enquiry, stage: before.stage }, [['Reason', dto.lost_reason], ['Went to', dto.lost_to]])
            .map(([k, v]) => (k === 'Stage' ? ['Lost at stage', v] : [k, v])),
        },
      });

      await salesEvent('ENQUIRY_LOST', id, actor, { from: before.stage, lost_reason: dto.lost_reason, lost_to: dto.lost_to ?? null });
      await salesEvent('STAGE_ENTERED', id, actor, { from: before.stage, to: 'LOST' });
      return withMoney(enquiry);
    },

    /** Reopens a won/lost enquiry back into the active pipeline (Follow-up). */
    async reopen(id, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      if (!canReassign(actor)) throw new ForbiddenError('You need the Sales reassign permission to reopen an enquiry');
      if (before.stage !== 'WON' && before.stage !== 'LOST') {
        throw new ConflictError('Only a won or lost enquiry can be reopened');
      }
      const guard = await checkGuard({ module: 'SALES', type: 'BEFORE_REOPEN', entityId: id, actionKey: `REOPEN:${before.stage}`, actor, payload: { from: before.stage } });

      const data = {
        stage: 'FOLLOW_UP',
        stage_since: new Date(),
        ...(await holderFor('FOLLOW_UP', before.owner_id, before)), // the field initiator's phase
        won_at: null, order_no: null, order_value: null, order_fx_rate: null, order_date: null,
        won_declaration: null, won_terms: null,
        lost_at: null, lost_reason: null, lost_to: null,
        updated_by: actor?.id ?? null,
      };
      const enquiry = await moveOnce(id, before.stage, data, guard);
      await repository.recordStageEvent({ enquiry_id: id, from_stage: before.stage, to_stage: 'FOLLOW_UP', changed_by: actor?.id ?? null, handler_id: data.handler_id });

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Enquiry',
        entityId: id,
        actor,
        changes: { stage: { from: before.stage, to: 'FOLLOW_UP' }, reopened: true },
      });

      await salesEvent('ENQUIRY_REOPENED', id, actor, { from: before.stage });
      await salesEvent('STAGE_ENTERED', id, actor, { from: before.stage, to: 'FOLLOW_UP' });
      return withMoney(enquiry);
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
      // Handed to a person, it is no longer waiting in a department's queue.
      if (data.handler_id !== undefined) Object.assign(data, { queue_department_id: null, queued_at: null, queue_reminded_at: null });

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

      await salesEvent('ENQUIRY_REASSIGNED', id, actor, {
        ...(data.owner_id !== undefined ? { owner: { from: before.owner_id, to: data.owner_id } } : {}),
        ...(data.handler_id !== undefined ? { handler: { from: before.handler_id, to: data.handler_id } } : {}),
      });
      return withMoney(enquiry);
    },

    /** What Flow Builder flows did on this enquiry — for anyone who can see it. */
    async flowActivity(id, actor) {
      const enquiry = await repository.findById(id);
      if (!enquiry) throw new NotFoundError('Enquiry');
      assertCanSeeEnquiry(enquiry, actor);
      // Required here, not at the top: the engine's service loads Sales lazily too.
      const { flowEngineService } = require('../flowengine/flowengine.service');
      return flowEngineService.activityFor('SALES', id);
    },

    /**
     * Hands an open enquiry to who a Flow Builder flow now assigns at its
     * current stage — when a flow change is published and its author chooses
     * to move the current enquiries too. Recorded like a reassign.
     * @param {number} id
     * @param {{ userId: number, departmentId: number|null }} assignment
     * @param {object} actor
     * @param {string} note  why, for the audit log and the hand-off notice
     */
    async applyFlowAssignment(id, { userId, departmentId }, actor, note) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      if (before.stage === 'WON' || before.stage === 'LOST') throw new ConflictError('A closed enquiry is not moved');
      const enquiry = await repository.update(id, {
        handler_id: userId,
        queue_department_id: departmentId || null,
        queued_at: departmentId ? new Date() : null,
        queue_reminded_at: null,
        updated_by: actor?.id ?? null,
      });
      await repository.setStageHandler(id, before.stage, userId);
      if (userId !== before.handler_id) notifyHandoff(enquiry, userId, actor, departmentId ? `${note} — ${QUEUED_NOTE}` : note);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Enquiry', entityId: id, actor,
        changes: { handler_id: { from: before.handler_id, to: userId }, ...(departmentId ? { queue_department_id: departmentId } : {}), moved_by_flow_change: note },
      });
      await salesEvent('ENQUIRY_REASSIGNED', id, actor, { handler: { from: before.handler_id, to: userId }, by_flow_change: true });
      return withMoney(enquiry);
    },

    /**
     * "Assign to my team": the enquiries waiting in the queues of the
     * departments the actor heads (every queue for a Super Admin), each with
     * the members it can go to.
     * @param {import('../../core/http/requestContext').ActorContext} actor
     */
    async teamQueue(actor) {
      const departments = actor?.is_system ? null : await repository.headedDepartmentIds(actor?.id);
      if (departments && !departments.length) return { departments: [], items: [] };
      return repository.queue(departments);
    },

    /**
     * The department head hands a waiting enquiry to a member of their team
     * (or keeps it). Only the head of that department — or a Super Admin — may.
     * @param {number} id
     * @param {{ user_id: number }} dto
     * @param {import('../../core/http/requestContext').ActorContext} actor
     */
    async assignFromQueue(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      const deptId = before.queue_department_id;
      if (!deptId) throw new ConflictError('This enquiry is not waiting to be assigned');
      const headed = actor?.is_system ? [deptId] : await repository.headedDepartmentIds(actor?.id);
      if (!headed.includes(deptId)) throw new ForbiddenError('Only the head of the department can assign this enquiry');
      const team = await repository.departmentTeam(deptId);
      if (!team.some((u) => u.id === dto.user_id)) {
        throw new ValidationError('Validation failed', [{ field: 'user_id', message: 'Choose someone in the department' }]);
      }

      const enquiry = await repository.update(id, {
        handler_id: dto.user_id, queue_department_id: null, queued_at: null, queue_reminded_at: null, updated_by: actor?.id ?? null,
      });
      // The stage's record names who actually does it ("same person as at stage" relies on it).
      await repository.setStageHandler(id, before.stage, dto.user_id);
      if (dto.user_id !== before.handler_id) notifyHandoff(enquiry, dto.user_id, actor, `assigned to you by the department head — now at ${stageLabel(before.stage)}`);

      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Enquiry', entityId: id, actor,
        changes: { handler_id: { from: before.handler_id, to: dto.user_id }, assigned_from_queue: deptId },
      });
      await salesEvent('ENQUIRY_REASSIGNED', id, actor, { handler: { from: before.handler_id, to: dto.user_id }, from_queue: deptId });
      return withMoney(enquiry);
    },

    /**
     * The final costing value (enquiry currency) — set from Costing Review on
     * by whoever holds the enquiry; each offer's margin is its price minus this.
     * Optional: nothing waits on it. `null` clears it.
     * @param {number} id
     * @param {{ final_cost: number|null }} dto
     * @param {import('../../core/http/requestContext').ActorContext} actor
     */
    async setFinalCost(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Enquiry');
      assertCanSeeEnquiry(before, actor);
      assertFlowWork(before, actor, 'enter the costing value');
      if (!COSTED_STAGES.includes(before.stage)) {
        throw new ConflictError('The costing value is entered from Costing Review on');
      }
      // An offer waiting for approval was asked on this cost — it stays until decided or withdrawn.
      const waiting = await approvalsService.pendingFor({ entityType: 'Enquiry', entityId: id, action: 'BEFORE_OFFER_SENT' });
      if (waiting) {
        throw new ConflictError(`An offer is waiting for approval from ${waiting.waiting_for} — ${waiting.can_withdraw ? 'withdraw the request first to change the costing value' : 'the costing value can change once it is decided'}`);
      }

      const enquiry = await repository.update(id, { final_cost: dto.final_cost, updated_by: actor?.id ?? null });
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Enquiry', entityId: id, actor,
        changes: { final_cost: { from: before.final_cost === null ? null : Number(before.final_cost), to: dto.final_cost } },
      });
      return withMoney(enquiry);
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

module.exports = { enquiryService, createEnquiryService, stageLabel };
