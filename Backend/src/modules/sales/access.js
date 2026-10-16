const { ForbiddenError } = require('../../core');

/**
 * Who may change an enquiry — one rule set for enquiries, documents and
 * activities.
 *
 *   - **The flow gives access.** Whoever the enquiry is with right now (its
 *     handler — Field Sales at New/Contacted/Follow-up, Internal Sales from
 *     Review to Offer Released and in Negotiation) does that stage's work on
 *     their own data, with no extra permission: log activities and reviews,
 *     upload documents and replace their own, set the price of and send an
 *     offer, move the stage forward (gates still apply). When it moves on,
 *     they are read-only until the flow brings it back.
 *   - **Won:** only the person who raised it, while it is with them.
 *     **Lost:** whoever holds it — the raiser, or Internal Sales (e.g. not
 *     feasible).
 *   - **Sales → Edit** (SALES_EDIT) adds, while holding it: editing the
 *     enquiry's details (only the person who raised it) and deleting their
 *     own documents, activities and reviews.
 *   - **Your own data only:** a document is replaced or deleted, and an
 *     activity or review edited or deleted, only by whoever added it.
 *   - **Sales → Reassign** (SALES_REASSIGN): reassign, change the owner,
 *     reopen a closed enquiry.
 *   - System users (Super Admin): anything, any time — they fix mistakes.
 */

/** @param {{ is_system?: boolean, permissions?: string[] }} [actor] */
const hasEdit = (actor) => Boolean(actor?.is_system || actor?.permissions?.includes('SALES_EDIT'));

/** The enquiry is with this person now (the workflow baton). */
const isHandler = (enquiry, actor) => Boolean(actor?.id) && actor.id === (enquiry.handler_id ?? enquiry.owner_id);

/** The person who raised it (or its field owner). */
const isCreator = (enquiry, actor) => Boolean(actor?.id)
  && (actor.id === enquiry.created_by || actor.id === enquiry.owner_id);

/** May reassign, change the owner or reopen: SALES_REASSIGN or a system user. */
const canReassign = (actor) => Boolean(actor?.is_system || actor?.permissions?.includes('SALES_REASSIGN'));

/**
 * The stage's work: the person holding the enquiry (or a system user).
 * @param {object} enquiry @param {object} [actor] @param {string} [what]
 * @throws {ForbiddenError}
 */
function assertFlowWork(enquiry, actor, what = 'do that') {
  if (actor?.is_system) return;
  if (isHandler(enquiry, actor)) return;
  throw new ForbiddenError(`This enquiry is not with you right now, so you cannot ${what}`);
}

/**
 * Editing beyond the stage's work: Sales → Edit and holding it.
 * @throws {ForbiddenError}
 */
function assertFullEdit(enquiry, actor, what = 'update this enquiry') {
  if (actor?.is_system) return;
  if (!hasEdit(actor)) throw new ForbiddenError(`You need Sales edit access to ${what}`);
  assertFlowWork(enquiry, actor, what);
}

/**
 * The enquiry's details: only the person who raised it, with Sales → Edit,
 * while it is with them (or a system user).
 * @throws {ForbiddenError}
 */
function assertDetailsEdit(enquiry, actor) {
  if (actor?.is_system) return;
  assertFullEdit(enquiry, actor, 'edit this enquiry');
  if (!isCreator(enquiry, actor)) {
    throw new ForbiddenError('Only the person who raised this enquiry can change its details');
  }
}

/**
 * Something someone added (a document, an activity, a review): only they may
 * change or remove it (or a system user).
 * @param {{ created_by?: number|null }} item @param {object} [actor] @param {string} what
 * @throws {ForbiddenError}
 */
function assertOwnItem(item, actor, what) {
  if (actor?.is_system) return;
  if (item?.created_by && actor?.id === item.created_by) return;
  throw new ForbiddenError(`Only the person who added it can ${what}`);
}

/** Won: the person who raised it, while it is with them. @throws {ForbiddenError} */
function assertCanWin(enquiry, actor) {
  if (actor?.is_system) return;
  assertFlowWork(enquiry, actor, 'mark it won');
  if (!isCreator(enquiry, actor)) throw new ForbiddenError('Only the person who raised this enquiry can mark it won');
}

/** Lost: whoever holds it (the raiser, or Internal Sales). @throws {ForbiddenError} */
function assertCanLose(enquiry, actor) {
  assertFlowWork(enquiry, actor, 'mark it lost');
}

module.exports = {
  hasEdit, isHandler, isCreator, canReassign,
  assertFlowWork, assertFullEdit, assertDetailsEdit, assertOwnItem, assertCanWin, assertCanLose,
  // Earlier name for the flow check, still used by callers.
  assertCreatorWork: assertFlowWork,
};
