const prisma = require('../../lib/prisma');

/**
 * Workflow assignment engine for service tickets.
 *
 * Resolves who a ticket is assigned to as it enters and moves through the
 * active workflow. Kept separate from the ticket CRUD service because it is the
 * one place that understands step assignee types and the dynamic routing rules.
 *
 * Assignment rules per step type:
 *   - USER            → that specific user
 *   - ROLE            → holders of that role
 *   - DEPARTMENT      → members of that department
 *   - DEPARTMENT_HEAD → the head of the step's department, or — when the step
 *                       has no fixed department — the head of the ticket's
 *                       ORIGINATING department (the "functional lead" routing).
 *                       Falls back to the department itself if no head is set.
 *   - MANUAL          → a user chosen by the previous stage's owner when advancing.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createTicketAssignment(db) {
  const stepInclude = {
    assignee_user:       { select: { id: true, name: true } },
    assignee_role:       { select: { id: true, name: true } },
    assignee_department: {
      select: { id: true, name: true, head_user_id: true, head: { select: { name: true } } },
    },
  };

  /** The active workflow for a module, with ordered steps. */
  function activeWorkflow(module = 'service') {
    return db.workflow.findFirst({
      where: { module, is_active: true, deleted_at: null },
      include: { steps: { orderBy: { step_order: 'asc' }, include: stepInclude } },
    });
  }

  /**
   * Resolves a step into ticket assignment fields.
   *
   * @param {object} step Workflow step with assignee relations included.
   * @param {{ originating_department_id: number|null }} ticket
   * @param {number|null} manualUserId Chosen assignee for a MANUAL step.
   * @returns {Promise<object>} Assignment fields to write onto the ticket.
   */
  async function resolveStep(step, ticket, manualUserId) {
    const out = {
      current_step_id: step.id,
      assigned_user_id: null,
      assigned_department_id: null,
      assigned_role_id: null,
      assigned_to_name: null,
    };

    switch (step.assignee_type) {
      case 'USER':
        out.assigned_user_id = step.assignee_user_id;
        out.assigned_to_name = step.assignee_user?.name ?? null;
        break;

      case 'ROLE':
        out.assigned_role_id = step.assignee_role_id;
        out.assigned_to_name = step.assignee_role ? `${step.assignee_role.name} (role)` : null;
        break;

      case 'DEPARTMENT':
        out.assigned_department_id = step.assignee_department_id;
        out.assigned_to_name = step.assignee_department ? `${step.assignee_department.name} (dept)` : null;
        break;

      case 'DEPARTMENT_HEAD': {
        let dept = step.assignee_department;
        // No fixed department on the step → route to the originating dept's head.
        if (!dept && ticket.originating_department_id) {
          dept = await db.department.findUnique({
            where: { id: ticket.originating_department_id },
            select: { id: true, name: true, head_user_id: true, head: { select: { name: true } } },
          });
        }
        if (dept?.head_user_id) {
          out.assigned_user_id = dept.head_user_id;
          out.assigned_to_name = `${dept.head?.name ?? 'Head'} (${dept.name} lead)`;
        } else if (dept) {
          // Head not configured — fall back to the department so it isn't lost.
          out.assigned_department_id = dept.id;
          out.assigned_to_name = `${dept.name} (no head set)`;
        }
        break;
      }

      case 'CREATOR':
        // The ticket's initiator (e.g. the salesperson who owns the customer
        // relationship). Resolved from the ticket's creator.
        if (ticket.created_by) {
          out.assigned_user_id = ticket.created_by;
          out.assigned_to_name = ticket.created_by_name
            ? `${ticket.created_by_name} (initiator)`
            : null;
        }
        break;

      case 'MANUAL':
        if (manualUserId) {
          const user = await db.user.findUnique({ where: { id: manualUserId }, select: { name: true } });
          out.assigned_user_id = manualUserId;
          out.assigned_to_name = user?.name ?? null;
        }
        break;

      default:
        break;
    }

    return out;
  }

  return {
    /**
     * Computes the initial assignment for a freshly created ticket: enter the
     * active workflow and resolve its first step.
     *
     * @param {{ id: number, originating_department_id: number|null }} ticket
     * @returns {Promise<{ assignment: object, stageName: string }|null>} Fields
     *   to write plus the stage name (for participant labelling), or null when
     *   there is no active flow.
     */
    async initialAssignment(ticket) {
      const workflow = await activeWorkflow('service');
      if (!workflow || workflow.steps.length === 0) return null;

      const first = workflow.steps[0];
      const assignment = await resolveStep(first, ticket, null);
      return { assignment: { workflow_id: workflow.id, ...assignment }, stageName: first.name };
    },

    /**
     * The ticket's workflow step that routes to the initiator (CREATOR) — the
     * customer-confirmation stage. Used to land a multi-department ticket at
     * confirmation once every department task is resolved.
     *
     * @param {{ workflow_id: number|null }} ticket
     * @returns {Promise<{ id: number, name: string }|null>}
     */
    async findCreatorStep(ticket) {
      if (!ticket?.workflow_id) return null;
      const workflow = await db.workflow.findFirst({
        where: { id: ticket.workflow_id },
        include: { steps: { orderBy: { step_order: 'asc' } } },
      });
      return workflow?.steps.find((s) => s.assignee_type === 'CREATOR') ?? null;
    },

    /**
     * Re-enters the ticket's OWN workflow at its first stage — used on reopen to
     * send the ticket back to the top (re-triage). Unlike `initialAssignment`
     * (which uses the currently-active workflow), this stays on whatever
     * workflow the ticket already belongs to.
     *
     * @param {{ workflow_id: number|null, originating_department_id: number|null, created_by: number|null, created_by_name: string|null }} ticket
     * @returns {Promise<{ assignment: object, stageName: string }|null>}
     */
    async reentryAssignment(ticket) {
      if (!ticket?.workflow_id) return null;
      const workflow = await db.workflow.findFirst({
        where: { id: ticket.workflow_id },
        include: { steps: { orderBy: { step_order: 'asc' }, include: stepInclude } },
      });
      if (!workflow || workflow.steps.length === 0) return null;

      const first = workflow.steps[0];
      const assignment = await resolveStep(first, ticket, null);
      return { assignment, stageName: first.name };
    },

    /**
     * Describes where the ticket is in its flow, for the UI and for field-level
     * authorisation:
     *   - `stage`: the current step and which parts of the ticket its holder
     *     owns — classification is a triage responsibility, the plan is the
     *     lead's. A ticket outside a workflow has no stage and nothing locked.
     *   - `next_stage`: who the next step assigns to and whether it is blocked
     *     on the originating department, so the client can label/disable the
     *     forward action.
     *
     * @param {{ workflow_id: number|null, current_step_id: number|null, originating_department_id: number|null }} ticket
     * @returns {Promise<{
     *   stage: { name: string, assignee_type: string, can_classify: boolean, can_plan: boolean }|null,
     *   next_stage: { name: string, assignee_type: string, requires_originating: boolean }|null,
     *   is_final: boolean,
     * }>}
     */
    async peekNext(ticket) {
      // Not in a workflow → no stage gating; the holder owns everything.
      if (!ticket?.workflow_id) return { stage: null, next_stage: null, is_final: true };

      const workflow = await db.workflow.findFirst({
        where: { id: ticket.workflow_id },
        include: { steps: { orderBy: { step_order: 'asc' }, include: stepInclude } },
      });
      if (!workflow) return { stage: null, next_stage: null, is_final: true };

      const index = workflow.steps.findIndex((s) => s.id === ticket.current_step_id);
      const cur = workflow.steps[index];

      const stage = cur
        ? {
          name: cur.name,
          assignee_type: cur.assignee_type,
          // Classification is set at triage (the first step) and frozen once the
          // ticket is routed onward.
          can_classify: index === 0,
          // The resolution plan belongs to the department lead's stage.
          can_plan: cur.assignee_type === 'DEPARTMENT_HEAD',
        }
        // Unknown current step (e.g. workflow edited) — lock the owned fields.
        : { name: null, assignee_type: null, can_classify: false, can_plan: false };

      const next = workflow.steps[index + 1];
      if (!next) return { stage, next_stage: null, is_final: true };

      const requires_originating =
        next.assignee_type === 'DEPARTMENT_HEAD' && !next.assignee_department_id && !ticket.originating_department_id;

      return {
        stage,
        next_stage: { name: next.name, assignee_type: next.assignee_type, requires_originating },
        is_final: false,
      };
    },
  };
}

const ticketAssignment = createTicketAssignment(prisma);

module.exports = { ticketAssignment, createTicketAssignment };
