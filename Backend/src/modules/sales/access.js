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
 *   - System users (Super Admin): anything, any time.
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

module.exports = { CREATOR_STAGES, hasEdit, isHandler, isCreator, creatorMayWork, assertFullEdit, assertCreatorWork };
