const { ForbiddenError } = require('../../core');

/**
 * Who may change an enquiry — one rule set for enquiries, documents and
 * activities.
 *
 *   - **Sales → Edit** (SALES_EDIT): full editing of the enquiry — details,
 *     stage, documents (upload / replace / delete), activities, Won/Lost —
 *     while the enquiry is with them (they are the current handler).
 *   - **The creator without Edit** (raised it with SALES_CREATE): only while
 *     their enquiry is at New or Contacted — upload and replace documents, log
 *     activities, and send it on to Review. Never delete. Once it moves on,
 *     read-only until they are given Edit.
 *   - **Your own data only:** the enquiry's details (customer, contact, title,
 *     value, …) are edited only by the person who raised it; a document is
 *     replaced or deleted, and an activity or review edited or deleted, only by
 *     the person who added it. So Internal Sales works on their own documents,
 *     reviews and offers but cannot change what Field Sales entered.
 *   - **Reassign** (changing the owner or handler) needs SALES_REASSIGN.
 *   - System users (Super Admin): anything, any time — they fix mistakes.
 */

/** Stages where the creator may still work on their own enquiry. */
const CREATOR_STAGES = Object.freeze(['NEW', 'CONTACTED']);

/** @param {{ is_system?: boolean, permissions?: string[] }} [actor] */
const hasEdit = (actor) => Boolean(actor?.is_system || actor?.permissions?.includes('SALES_EDIT'));

/** The enquiry is with this person now (the workflow baton). */
const isHandler = (enquiry, actor) => Boolean(actor?.id) && actor.id === (enquiry.handler_id ?? enquiry.owner_id);

/** The person who raised it (or its field owner). */
const isCreator = (enquiry, actor) => Boolean(actor?.id)
  && (actor.id === enquiry.created_by || actor.id === enquiry.owner_id);

/** Creator-level work is allowed: their own enquiry, still at New / Contacted. */
const creatorMayWork = (enquiry, actor) => isCreator(enquiry, actor) && CREATOR_STAGES.includes(enquiry.stage);

/**
 * Full editing: SALES_EDIT and holding the enquiry (or a system user).
 * @param {object} enquiry @param {object} [actor] @param {string} [what] e.g. "update this enquiry"
 * @throws {ForbiddenError}
 */
function assertFullEdit(enquiry, actor, what = 'update this enquiry') {
  if (actor?.is_system) return;
  if (!hasEdit(actor)) throw new ForbiddenError(`You need Sales edit access to ${what}`);
  if (!isHandler(enquiry, actor)) throw new ForbiddenError(`Only the current handler can ${what}`);
}

/**
 * Creator-level work (upload / replace documents, log activities, send to
 * Review): full editors as above, or the creator while it is at New/Contacted.
 * @param {object} enquiry @param {object} [actor] @param {string} [what]
 * @throws {ForbiddenError}
 */
function assertCreatorWork(enquiry, actor, what = 'do that') {
  if (actor?.is_system) return;
  if (hasEdit(actor)) {
    if (isHandler(enquiry, actor)) return;
    throw new ForbiddenError(`Only the current handler can ${what}`);
  }
  if (creatorMayWork(enquiry, actor)) return;
  throw new ForbiddenError(isCreator(enquiry, actor)
    ? `This enquiry has moved on to Review — you need Sales edit access to ${what}`
    : `You need Sales edit access to ${what}`);
}

/**
 * The enquiry's details: only the person who raised it, with Sales edit and
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

/** May reassign (owner / handler): SALES_REASSIGN or a system user. */
const canReassign = (actor) => Boolean(actor?.is_system || actor?.permissions?.includes('SALES_REASSIGN'));

module.exports = {
  CREATOR_STAGES, hasEdit, isHandler, isCreator, creatorMayWork, canReassign,
  assertFullEdit, assertCreatorWork, assertDetailsEdit, assertOwnItem,
};
