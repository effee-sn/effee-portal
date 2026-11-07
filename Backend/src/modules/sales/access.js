const { ForbiddenError, NotFoundError } = require('../../core');

/**
 * Who may change an enquiry — one rule set for enquiries, documents and
 * activities.
 *
 *   - **The flow gives access.** Whoever the enquiry is with right now (its
 *     handler — Field Sales at New/Contacted/Follow-up, Internal Sales from
 *     Review to Offer and in Negotiation) does that stage's work on
 *     their own data, with no extra permission: log activities and reviews,
 *     upload documents and replace their own, set the price of and send an
 *     offer, move the stage forward (gates still apply). When it moves on,
 *     they are read-only until the flow brings it back.
 *   - **Won:** only the person who raised it, while it is with them.
 *     **Lost:** whoever holds it — the raiser, or Internal Sales (e.g. not
 *     feasible).
 *   - **Sales own → Edit** (SALES_EDIT_OWN) adds, while holding it: editing
 *     the enquiry's details (only the person who raised it) and deleting their
 *     own documents.
 *   - **Sales → Edit** (SALES_EDIT) — edit all: on any open enquiry, whoever
 *     raised or holds it, edit its details, upload / replace / delete anyone's
 *     documents and set an offer's price (until it is sent or awaits
 *     approval). Moving the stage, marking offers sent and Won / Lost stay the
 *     holder's; Won / Lost enquiries are reopened first.
 *   - **Your own data only:** a document is replaced or deleted (unless with
 *     Sales → Edit), and an activity or review edited or deleted, only by
 *     whoever added it — editing your own activities and reviews needs Sales
 *     activity → Edit, deleting them Sales → Delete.
 *   - **Sales → Reassign** (SALES_REASSIGN): reassign, change the owner,
 *     reopen a closed enquiry.
 *   - **Archived** (Sales → Archive, SALES_ARCHIVE): read-only for everyone,
 *     system users too, until someone with Sales → Archive restores it.
 *   - **Seeing enquiries:** Sales → View shows all of them. Sales own → View
 *     (SALES_VIEW_OWN) shows only your own — ones you raised, own, or that
 *     are with you now in the flow; others read as not found.
 *   - System users (Super Admin): anything, any time — they fix mistakes.
 */

/** Sales → Edit: edit all (system users too). @param {{ is_system?: boolean, permissions?: string[] }} [actor] */
const hasEditAll = (actor) => Boolean(actor?.is_system || actor?.permissions?.includes('SALES_EDIT'));
/** Sales own → Edit, or edit all. @param {{ is_system?: boolean, permissions?: string[] }} [actor] */
const hasEdit = (actor) => hasEditAll(actor) || Boolean(actor?.permissions?.includes('SALES_EDIT_OWN'));
/** Won and Lost enquiries are closed: reopen them to change anything. */
const isOpen = (enquiry) => !enquiry?.archived_at && !['WON', 'LOST'].includes(enquiry?.stage);

/** May archive and restore enquiries: Sales → Archive (system users too). */
const canArchive = (actor) => Boolean(actor?.is_system || actor?.permissions?.includes('SALES_ARCHIVE'));

/**
 * An archived enquiry is read-only for everyone until it is restored.
 * @param {{ archived_at?: Date|string|null }|null} [enquiry]
 * @throws {ForbiddenError}
 */
function assertNotArchived(enquiry) {
  if (enquiry?.archived_at) throw new ForbiddenError('This enquiry is archived — restore it first');
}
/** Edit all applies here: Sales → Edit on an open enquiry. */
const editsAll = (enquiry, actor) => hasEditAll(actor) && isOpen(enquiry);

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
  assertNotArchived(enquiry);
  if (actor?.is_system) return;
  if (isHandler(enquiry, actor)) return;
  throw new ForbiddenError(`This enquiry is not with you right now, so you cannot ${what}`);
}

/**
 * Documents and offer prices: whoever holds the enquiry, or Sales → Edit on
 * any open one.
 * @throws {ForbiddenError}
 */
function assertDocumentWork(enquiry, actor, what = 'do that') {
  assertNotArchived(enquiry);
  if (editsAll(enquiry, actor)) return;
  assertFlowWork(enquiry, actor, what);
}

/**
 * Editing beyond the stage's work: Sales → Edit on any open enquiry, or
 * Sales own → Edit while holding it.
 * @throws {ForbiddenError}
 */
function assertFullEdit(enquiry, actor, what = 'update this enquiry') {
  assertNotArchived(enquiry);
  if (actor?.is_system || editsAll(enquiry, actor)) return;
  if (!hasEdit(actor)) throw new ForbiddenError(`You need Sales edit access to ${what}`);
  assertFlowWork(enquiry, actor, what);
}

/**
 * The enquiry's details: Sales → Edit on any open enquiry; with Sales own →
 * Edit, only the person who raised it, while it is with them (or a system user).
 * @throws {ForbiddenError}
 */
function assertDetailsEdit(enquiry, actor) {
  assertNotArchived(enquiry);
  if (actor?.is_system || editsAll(enquiry, actor)) return;
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

/** A document: its uploader — or anyone with Sales → Edit on an open enquiry. @throws {ForbiddenError} */
function assertOwnDocument(item, enquiry, actor, what) {
  assertNotArchived(enquiry);
  if (editsAll(enquiry, actor)) return;
  assertOwnItem(item, actor, what);
}

/** Won: the person who raised it, while it is with them. @throws {ForbiddenError} */
function assertCanWin(enquiry, actor) {
  assertNotArchived(enquiry);
  if (actor?.is_system) return;
  assertFlowWork(enquiry, actor, 'mark it won');
  if (!isCreator(enquiry, actor)) throw new ForbiddenError('Only the person who raised this enquiry can mark it won');
}

/** Lost: whoever holds it (the raiser, or Internal Sales). @throws {ForbiddenError} */
function assertCanLose(enquiry, actor) {
  assertFlowWork(enquiry, actor, 'mark it lost');
}

/**
 * Which enquiries this person may see, as a Prisma `where` to add — null for
 * all (Sales → View), their own for Sales own → View, none otherwise. Without
 * an actor (the system itself — jobs, emails, other services) nothing is limited.
 * @param {object} [actor]
 */
function enquiryScope(actor) {
  if (!actor || actor.is_system || actor?.permissions?.includes('SALES_VIEW')) return null;
  if (actor?.id && actor.permissions?.includes('SALES_VIEW_OWN')) {
    return { OR: [{ created_by: actor.id }, { owner_id: actor.id }, { handler_id: actor.id }] };
  }
  return { id: -1 };
}

/** May see this enquiry: Sales → View, or Sales own → View and it is theirs (raised, owned or with them). */
function canSeeEnquiry(enquiry, actor) {
  if (!actor || actor.is_system || actor?.permissions?.includes('SALES_VIEW')) return true;
  return Boolean(actor?.id && actor.permissions?.includes('SALES_VIEW_OWN')
    && [enquiry.created_by, enquiry.owner_id, enquiry.handler_id].includes(actor.id));
}

/** Someone else's enquiry reads as not found to those who may see only their own. @throws {NotFoundError} */
function assertCanSeeEnquiry(enquiry, actor) {
  if (!canSeeEnquiry(enquiry, actor)) throw new NotFoundError('Enquiry');
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
  assertNotArchived(enquiry);
  if (actor?.is_system) return;
  if (action === 'log') {
    if (enquiry && CLOSED_STAGES.includes(enquiry.stage)) {
      throw new ForbiddenError(`This enquiry is ${enquiry.stage === 'WON' ? 'won' : 'lost'} — no new activities or reviews (reopen it first)`);
    }
    if (!enquiry || !canSeeEnquiry(enquiry, actor)) {
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

/** REVIEW → "Review", COSTING_REVIEW → "Costing review"; OFFER_RELEASED is shown as "Offer". */
const stageName = (s) => (s === 'OFFER_RELEASED' ? 'Offer' : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '));

module.exports = {
  assertActivityAccess, enquiryScope, canSeeEnquiry, assertCanSeeEnquiry,
  hasEdit, hasEditAll, isHandler, isCreator, canReassign, canArchive, assertNotArchived,
  assertFlowWork, assertDocumentWork, assertFullEdit, assertDetailsEdit, assertOwnItem, assertOwnDocument, assertCanWin, assertCanLose,
  // Earlier name for the flow check, still used by callers.
  assertCreatorWork: assertFlowWork,
};
