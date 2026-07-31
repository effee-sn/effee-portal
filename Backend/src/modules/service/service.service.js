const { serviceRepository } = require('./service.repository');
const { auditService } = require('../audit/audit.service');
const { ticketAssignment } = require('./ticketAssignment');
const { canView, canAct } = require('./ticketPolicy');
const {
  NotFoundError, ValidationError, ForbiddenError, BadRequestError, buildSearchClause, logger,
} = require('../../core');

/**
 * Service (ticket) business logic.
 *
 * @param {ReturnType<typeof import('./service.repository').createServiceRepository>} repository
 */
function createServiceService(repository) {
  const SORTABLE_FIELDS = Object.freeze([
    'created_at', 'ticket_id', 'company_name', 'issue_severity', 'status', 'ticket_type',
  ]);

  const SEARCHABLE_FIELDS = Object.freeze([
    'ticket_id', 'company_name', 'reported_by', 'issue_title',
  ]);

  /**
   * Records the assignee of a stage as a ticket participant, when the stage
   * resolved to a specific user. Participants keep view access for the ticket's
   * whole life. Group assignments (department / role) have no single user, so
   * nothing is recorded — those members see the ticket only while it is with
   * them, via the current-assignment match.
   *
   * @param {number} ticketId
   * @param {object} assignment The resolved assignment fields.
   * @param {string} stageLabel The stage name.
   */
  async function recordParticipant(ticketId, assignment, stageLabel) {
    if (!assignment.assigned_user_id) return;
    await repository.addParticipant(
      ticketId, assignment.assigned_user_id, assignment.assigned_to_name, stageLabel
    );
  }

  /**
   * Attaches next-stage info to a single-ticket payload so the UI can render a
   * stage-appropriate action (and whether it is ready). Only used on the detail
   * / action responses, not on list rows.
   *
   * @param {object|null} ticket
   * @returns {Promise<object|null>}
   */
  async function withNextStage(ticket) {
    if (!ticket) return ticket;
    const info = await ticketAssignment.peekNext(ticket);
    return { ...ticket, ...info };
  }

  return {
    SORTABLE_FIELDS,

    /**
     * @param {import('../../core/http/queryOptions').ListQuery} query
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const where = { ...query.filters, ...(search || {}) };

      return repository.findPage({
        where,
        orderBy: query.orderBy,
        skip: query.skip,
        take: query.take,
      });
    },

    /**
     * @param {number} id
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async getById(id) {
      const ticket = await repository.findById(id);
      if (!ticket) throw new NotFoundError('Ticket');
      return ticket;
    },

    /**
     * Loads a ticket for a specific user, enforcing record-level view access.
     *
     * A non-viewer gets a 404 rather than a 403 so the endpoint does not reveal
     * that a ticket they cannot see exists.
     *
     * @param {number} id
     * @param {object} user The acting user (req.user / actor context).
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async getForUser(id, user) {
      const ticket = await repository.findById(id);
      if (!ticket || !canView(user, ticket)) throw new NotFoundError('Ticket');
      return withNextStage(ticket);
    },

    /**
     * Tickets assigned to the user — the "My Tickets" inbox. Requires no service
     * permission; assignment alone grants visibility.
     *
     * @param {object} user
     * @param {import('../../core/http/queryOptions').ListQuery} query
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async inbox(user, query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const where = { ...query.filters, ...(search || {}) };
      return repository.findInbox(user, {
        where, orderBy: query.orderBy, skip: query.skip, take: query.take,
      });
    },

    /**
     * Customer confirmation: the creator records that the customer is satisfied.
     * The ticket enters an observation window (ON_OBSERVATION) for `days` days,
     * staying with the creator, who later closes it (or reopens on recurrence).
     * Only valid at the customer-confirm stage.
     *
     * @param {number} id
     * @param {object} user
     * @param {number} [days] Observation window length (default 7).
     * @returns {Promise<object>}
     */
    async confirm(id, user, days = 7) {
      const ticket = await repository.findById(id);
      if (!ticket || !canView(user, ticket)) throw new NotFoundError('Ticket');
      if (!canAct(user, ticket)) throw new ForbiddenError('Only the current holder can confirm this ticket');

      const { stage } = await ticketAssignment.peekNext(ticket);
      if (stage?.assignee_type !== 'CREATOR') {
        throw new BadRequestError('This ticket is not awaiting customer confirmation');
      }

      const observation_until = new Date(Date.now() + Math.max(0, days) * 24 * 60 * 60 * 1000);
      await repository.update(id, {
        customer_confirmed: true,
        status: 'ON_OBSERVATION',
        observation_until,
        updated_by: user?.id ?? null,
      });

      await auditService.record({
        action: 'CONFIRMED', entity: 'ServiceTicket', entityId: id,
        actor: user, changes: { observation_days: days, observation_until },
      });
      return withNextStage(await repository.findById(id));
    },

    /**
     * Closes a ticket that has come through observation cleanly.
     *
     * @param {number} id
     * @param {object} user
     * @returns {Promise<object>}
     */
    async close(id, user) {
      const ticket = await repository.findById(id);
      if (!ticket || !canView(user, ticket)) throw new NotFoundError('Ticket');
      if (!canAct(user, ticket)) throw new ForbiddenError('Only the current holder can close this ticket');
      if (ticket.status !== 'ON_OBSERVATION') {
        throw new BadRequestError('Only a ticket under observation can be closed here');
      }

      await repository.update(id, { status: 'CLOSED', updated_by: user?.id ?? null });
      await auditService.record({ action: 'CLOSED', entity: 'ServiceTicket', entityId: id, actor: user, changes: {} });
      return withNextStage(await repository.findById(id));
    },

    /**
     * Reopens a ticket after the customer rejects the fix or the issue recurs.
     * The ticket re-enters its workflow at the top (re-triage by the PM), its
     * reopen count is incremented, and the reason is recorded. The finalised
     * resolution plan is left intact — the lead revises it (a new version) once
     * it is routed back to them.
     *
     * @param {number} id
     * @param {object} user
     * @param {string} reason
     * @returns {Promise<object>}
     */
    async reopen(id, user, reason) {
      const ticket = await repository.findById(id);
      if (!ticket || !canView(user, ticket)) throw new NotFoundError('Ticket');
      if (!canAct(user, ticket)) throw new ForbiddenError('Only the current holder can reopen this ticket');
      if (!ticket.workflow_id) throw new BadRequestError('This ticket is not part of a workflow');

      const { stage } = await ticketAssignment.peekNext(ticket);
      const reopenable = stage?.assignee_type === 'CREATOR' || ['ON_OBSERVATION', 'CLOSED'].includes(ticket.status);
      if (!reopenable) throw new BadRequestError('This ticket has not reached customer confirmation yet');

      const reentry = await ticketAssignment.reentryAssignment(ticket);
      if (!reentry) throw new BadRequestError('This ticket’s workflow has no stages to re-enter');

      await repository.update(id, {
        ...reentry.assignment,
        assigned_by_id:    user?.id ?? null,
        assigned_by_name:  user?.name ?? null,
        status:            'REOPENED',
        customer_confirmed: false,
        observation_until:  null,
        decline_reason:     reason,
        reopened_count:    { increment: 1 },
        updated_by:        user?.id ?? null,
      });
      await recordParticipant(id, reentry.assignment, `Re-triage (reopened)`);

      await auditService.record({
        action: 'REOPENED', entity: 'ServiceTicket', entityId: id,
        actor: user, changes: { reason, re_triaged_to: reentry.assignment.assigned_to_name },
      });
      return withNextStage(await repository.findById(id));
    },

    /**
     * Creates a ticket.
     *
     * @param {object} dto Validated fields.
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     * @returns {Promise<object>}
     */
    async create(dto, actor) {
      const ticket = await repository.create({
        ticket_type:       dto.ticket_type,
        source_details:    dto.ticket_type === 'OTHERS' ? (dto.source_details ?? null) : null,
        company_name:      dto.company_name,
        company_location:  dto.company_location ?? null,
        reported_by:       dto.reported_by,
        reported_by_phone: dto.reported_by_phone ?? null,
        reported_by_email: dto.reported_by_email ?? null,
        support_type:      dto.support_type ?? null,
        complaint_date:    dto.complaint_date ?? null,
        complaint_time:    dto.complaint_time ?? null,
        machine_project:   dto.machine_project ?? null,
        machine_serial_no: dto.machine_serial_no ?? null,
        issue_title:       dto.issue_title,
        issue_description: dto.issue_description,
        issue_severity:    dto.issue_severity,
        impact_details:    dto.impact_details ?? null,
        // Status is flow-driven, never set on intake.
        status:            'OPEN',
        created_by:        actor?.id ?? null,
        created_by_name:   actor?.name ?? null,
        updated_by:        actor?.id ?? null,
      });

      // Enter the active workflow (if any) and assign the first stage. Failure
      // here must not fail ticket creation — the ticket exists either way and
      // can be routed manually — so it is best-effort and logged, not thrown.
      let assigned = ticket;
      try {
        // The initiator (e.g. the salesperson who owns the customer relationship)
        // is a participant from the start, so they can track their ticket the
        // whole way even with only SERVICE_CREATE.
        if (ticket.created_by) {
          await repository.addParticipant(ticket.id, ticket.created_by, ticket.created_by_name, 'Initiated');
        }

        const init = await ticketAssignment.initialAssignment(ticket);
        if (init) {
          await repository.update(ticket.id, init.assignment);
          await recordParticipant(ticket.id, init.assignment, init.stageName);
        }
        assigned = await repository.findById(ticket.id);
      } catch (err) {
        logger.error({ err, ticketId: ticket.id }, 'Failed to assign ticket to workflow on create');
      }

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'ServiceTicket',
        entityId: ticket.id,
        actor,
        changes: {
          ticket_id: ticket.ticket_id,
          company_name: ticket.company_name,
          severity: ticket.issue_severity,
          type: ticket.ticket_type,
          assigned_to: assigned.assigned_to_name || null,
        },
      });

      return assigned;
    },

    /**
     * Updates a ticket. Only supplied fields change.
     *
     * @param {number} id
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async update(id, dto, actor) {
      const existing = await repository.findById(id);
      if (!existing) throw new NotFoundError('Ticket');

      // Record-level authorisation: a non-viewer gets 404 (no existence leak);
      // a viewer who is not the assignee and lacks SERVICE_EDIT gets 403.
      if (!canView(actor, existing)) throw new NotFoundError('Ticket');
      if (!canAct(actor, existing)) {
        throw new ForbiddenError('You do not have permission to edit this ticket');
      }

      // Validate the originating department when one is being set.
      if (dto.originating_department_id !== undefined && dto.originating_department_id !== null) {
        if (!(await repository.departmentExists(dto.originating_department_id))) {
          throw new ValidationError('Validation failed', [
            { field: 'originating_department_id', message: 'Selected department does not exist' },
          ]);
        }
      }

      /** @type {Record<string, unknown>} */
      const data = {};
      for (const field of [
        'ticket_type', 'source_details', 'company_name', 'company_location', 'reported_by',
        'complaint_date', 'complaint_time', 'machine_project', 'machine_serial_no',
        'issue_title', 'issue_description', 'issue_severity',
        // Classification
        'technical_category', 'originating_department_id',
        // Impact
        'impact_details',
        // Findings (support_type is intake-only; the plan + report are per
        // department task, not on the ticket).
        'site_visit_notes',
        // NOTE: status, customer_confirmed and observation_until are NOT here —
        // they are driven by the workflow actions (advance/confirm/close/reopen),
        // never set by a manual update.
      ]) {
        if (dto[field] !== undefined) data[field] = dto[field];
      }

      // Field-level ownership: classification (including support type) is a
      // triage responsibility. Once the ticket has been routed onward the
      // classification is frozen, so a later holder (the lead, the resolver)
      // cannot rewrite it. Admins excepted.
      const caps = await ticketAssignment.peekNext(existing);
      const mayClassify = actor?.is_system || !caps.stage || caps.stage.can_classify;
      if (!mayClassify) {
        for (const f of ['technical_category', 'originating_department_id']) delete data[f];
      }

      data.updated_by = actor?.id ?? null;

      const ticket = await repository.update(id, data);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'ServiceTicket',
        entityId: id,
        actor,
        changes: { fields: Object.keys(data).filter((k) => k !== 'updated_by') },
      });

      // Carry next-stage info (e.g. setting the originating department clears the
      // "requires_originating" block) so the UI's action button updates at once.
      return withNextStage(ticket);
    },

    /**
     * Soft-deletes a ticket.
     *
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     * @returns {Promise<void>}
     * @throws {NotFoundError}
     */
    async remove(id, actor) {
      if (!(await repository.existsById(id))) throw new NotFoundError('Ticket');

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'ServiceTicket',
        entityId: id,
        actor,
        changes: { soft_deleted: true },
      });
    },

    /**
     * Dashboard payload: totals, breakdowns, and recent activity.
     *
     * @returns {Promise<object>}
     */
    async getDashboard() {
      const [stats, recent] = await Promise.all([
        repository.stats(),
        repository.recent(5),
      ]);

      // Present a stable set of keys even when a bucket has no rows, so the UI
      // can render every status/severity without guarding each one. Covers the
      // full lifecycle — earlier this stopped at CLOSED and silently dropped
      // CONTACTED / ON_OBSERVATION / REOPENED tickets from the breakdown.
      const statusOrder   = ['OPEN', 'IN_PROGRESS', 'CONTACTED', 'RESOLVED', 'ON_OBSERVATION', 'CLOSED', 'REOPENED'];
      const severityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

      const fill = (map, keys) => Object.fromEntries(keys.map((k) => [k, map[k] || 0]));
      const by_status = fill(stats.byStatus, statusOrder);

      // Tickets that still need work vs. those parked awaiting the customer.
      const active = by_status.OPEN + by_status.IN_PROGRESS + by_status.CONTACTED + by_status.REOPENED;

      return {
        total: stats.total,
        by_status,
        by_severity: fill(stats.bySeverity, severityOrder),
        open: by_status.OPEN,
        active,
        on_observation: by_status.ON_OBSERVATION,
        recent,
      };
    },
  };
}

const serviceService = createServiceService(serviceRepository);

module.exports = { serviceService, createServiceService };
