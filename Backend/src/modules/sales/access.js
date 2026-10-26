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
 *     own documents.
 *   - **Your own data only:** a document is replaced or deleted, and an
 *     activity or review edited or deleted, only by whoever added it —
 *     editing your own activities and reviews needs Sales activity → Edit,
 *     deleting them Sales → Delete.
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

/** Closed: no new activities or reviews until it is reopened. */
const CLOSED_STAGES = Object.freeze(['WON', 'LOST']);

/** Holds a permission (system users hold all). */
const hasPerm = (actor, code) => Boolean(actor?.is_system || actor?.permissions?.includes(code));

/**
 * Activities and reviews are open at every stage until the enquiry is Won or
 * Lost, not only to the holder: logging needs Sales → View, plus either
 * Sales → Create or the enquiry being with you (the flow gives the holder —
 * e.g. Internal Sales at Review — access with View alone). An entry is
 * edited with **Sales activity → Edit** (SALES_ACTIVITY_EDIT) and only while
 * the enquiry is still in the stage it was logged in — once it moves on, that
 * stage's entries are its record (a review can't be changed later to meet a
 * gate). It is deleted with Sales → Delete. Both only by the person who
 * logged it (system users: any). The stage-moving side effect (needs
 * negotiation) stays the holder's.
 * @param {'log'|'edit'|'delete'} action
 * @param {{ created_by?: number|null, stage?: string|null }|null} item  the entry, for edit / delete
 * @param {{ stage: string, handler_id?: number|null, owner_id?: number|null }|null} enquiry  for log / edit
 * @throws {ForbiddenError}
 */
function assertActivityAccess(action, actor, item = null, enquiry = null) {
  if (actor?.is_system) return;
  if (action === 'log') {
    if (enquiry && CLOSED_STAGES.includes(enquiry.stage)) {
      throw new ForbiddenError(`This enquiry is ${enquiry.stage === 'WON' ? 'won' : 'lost'} — no new activities or reviews (reopen it first)`);
    }
    if (!hasPerm(actor, 'SALES_VIEW')) {
      throw new ForbiddenError('You need Sales view access to log activities and reviews');
    }
    if (hasPerm(actor, 'SALES_CREATE') || (enquiry && isHandler(enquiry, actor))) return;
    throw new ForbiddenError('You need Sales create access to log activities and reviews on an enquiry that is not with you');
  }
  const [code, name] = action === 'edit' ? ['SALES_ACTIVITY_EDIT', 'Sales activity edit'] : ['SALES_DELETE', 'Sales delete'];
  if (!hasPerm(actor, code)) {
    throw new ForbiddenError(`You need ${name} access to ${action} activities and reviews`);
  }
  assertOwnItem(item, actor, `${action} this entry`);
  if (action === 'edit' && enquiry && item?.stage !== enquiry.stage) {
    throw new ForbiddenError(item?.stage
      ? `This entry was logged at ${stageName(item.stage)}; the enquiry is now at ${stageName(enquiry.stage)}, so it can no longer be edited`
      : 'This entry is from before stages were recorded and can no longer be edited');
  }
}

/** REVIEW → "Review", OFFER_RELEASED → "Offer released". */
const stageName = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

module.exports = {
  assertActivityAccess,
  hasEdit, isHandler, isCreator, canReassign,
  assertFlowWork, assertFullEdit, assertDetailsEdit, assertOwnItem, assertCanWin, assertCanLose,
  // Earlier name for the flow check, still used by callers.
  assertCreatorWork: assertFlowWork,
};
