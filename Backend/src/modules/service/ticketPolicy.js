/**
 * Record-level (per-ticket) authorisation for service tickets.
 *
 * This is the second authorisation layer, layered on top of static role
 * permissions. It answers "may THIS user act on THIS specific ticket", which
 * route middleware cannot decide because it depends on the ticket's current
 * assignment.
 *
 * Two ways to gain access:
 *   1. A global service permission (SERVICE_VIEW / SERVICE_EDIT) or is_system —
 *      the oversight tier: browse and manage every ticket.
 *   2. Being the ticket's current assignee — the scoped tier: a person with no
 *      service permission at all can still see and work the ticket the flow
 *      handed them, and nothing else.
 *
 * Pure functions — no database, no HTTP — so they are trivially testable and
 * usable anywhere the ticket and the acting user are both in hand.
 */

/**
 * Whether a user is the ticket's current assignee — directly, through their
 * department, or through their role.
 *
 * @param {{ id: number, department_id?: number|null, role_id?: number|null }} user
 * @param {{ assigned_user_id?: number|null, assigned_department_id?: number|null, assigned_role_id?: number|null }} ticket
 * @returns {boolean}
 */
function isAssignee(user, ticket) {
  if (!user || !ticket) return false;

  if (ticket.assigned_user_id && ticket.assigned_user_id === user.id) return true;
  if (ticket.assigned_department_id && user.department_id && ticket.assigned_department_id === user.department_id) return true;
  if (ticket.assigned_role_id && user.role_id && ticket.assigned_role_id === user.role_id) return true;

  return false;
}

/**
 * Whether the user is a recorded participant of the ticket — someone who has
 * been on it at any stage. Participants keep VIEW access after the ticket moves
 * past their stage, so e.g. the PM keeps tracking a ticket they routed onward.
 *
 * @param {{ id: number }} user
 * @param {{ participants?: Array<{ user_id: number }> }} ticket
 * @returns {boolean}
 */
function isParticipant(user, ticket) {
  if (!user || !Array.isArray(ticket?.participants)) return false;
  return ticket.participants.some((p) => p.user_id === user.id);
}

/**
 * @param {object} user
 * @param {string} code
 * @returns {boolean}
 */
function hasPermission(user, code) {
  return Boolean(user?.is_system) || (Array.isArray(user?.permissions) && user.permissions.includes(code));
}

/**
 * May the user view this ticket?
 *
 * Grantable three ways: a global permission, being the current assignee, or
 * having been a participant at any earlier stage.
 *
 * @param {object} user
 * @param {object} ticket
 * @returns {boolean}
 */
function canView(user, ticket) {
  return hasPermission(user, 'SERVICE_VIEW') || isAssignee(user, ticket) || isParticipant(user, ticket);
}

/**
 * May the user act on (update / advance) this ticket?
 *
 * @param {object} user
 * @param {object} ticket
 * @returns {boolean}
 */
function canAct(user, ticket) {
  return hasPermission(user, 'SERVICE_EDIT') || isAssignee(user, ticket);
}

module.exports = { isAssignee, isParticipant, canView, canAct, hasPermission };
