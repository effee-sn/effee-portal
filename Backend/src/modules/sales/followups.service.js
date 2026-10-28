const { followupsRepository } = require('./followups.repository');
const { auditService } = require('../audit/audit.service');
const { ForbiddenError } = require('../../core');

/**
 * Sales → Follow-ups: every customer follow-up (an activity's next date) in
 * one place, by state.
 *
 *   - **Overdue** — not done, its day has passed;
 *   - **Today** — due today, not done;
 *   - **Upcoming** — from tomorrow on, not done;
 *   - **Done** — acted on: the same person logged a later entry, it was marked
 *     done, or the enquiry was won or lost (see EnquiryActivity.follow_up_done_*).
 *     A Super Admin can mark many done at once (clearing old ones).
 *
 * Who sees what: Follow-ups → View — everyone's; Follow-ups own → View — only
 * the ones they added. Reviews' next dates are not follow-ups (they live on the
 * enquiry's Reviews), and a "no further follow-up" entry has none.
 *
 * @param {ReturnType<typeof import('./followups.repository').createFollowupsRepository>} repository
 */
function createFollowupsService(repository) {
  const TABS = Object.freeze(['overdue', 'today', 'upcoming', 'done', 'all']);
  const DAY_MS = 24 * 60 * 60 * 1000;

  const can = (actor, code) => Boolean(actor?.is_system || actor?.permissions?.includes(code));

  /** The follow-ups an actor may see at all. @throws {ForbiddenError} */
  function scopeFor(actor) {
    if (can(actor, 'SALES_FOLLOWUP_VIEW')) return { all: true, where: {} };
    if (can(actor, 'SALES_FOLLOWUP_VIEW_OWN') && actor?.id != null) return { all: false, where: { created_by: actor.id } };
    throw new ForbiddenError('You don\'t have access to follow-ups');
  }

  /** Each tab's condition, against the start and end of today. */
  function tabWhere(tab, startOfToday, endOfToday) {
    const open = { follow_up_done_at: null };
    switch (tab) {
      case 'overdue': return { ...open, follow_up_at: { lt: startOfToday } };
      case 'today': return { ...open, follow_up_at: { gte: startOfToday, lt: endOfToday } };
      case 'upcoming': return { ...open, follow_up_at: { gte: endOfToday } };
      case 'done': return { follow_up_done_at: { not: null } };
      default: return {};
    }
  }

  const ORDER = Object.freeze({
    overdue: [{ follow_up_at: 'asc' }, { id: 'asc' }],
    today: [{ follow_up_at: 'asc' }, { id: 'asc' }],
    upcoming: [{ follow_up_at: 'asc' }, { id: 'asc' }],
    done: [{ follow_up_done_at: 'desc' }, { id: 'desc' }],
    all: [{ follow_up_at: 'asc' }, { id: 'asc' }],
  });

  return {
    TABS,

    /**
     * Super Admin: marks these follow-ups done at once (e.g. old ones never
     * closed), with one optional note. Ones already done are left as they are.
     * @param {{ ids: number[], note?: string|null }} dto
     * @returns {Promise<{ done: number }>}
     */
    async markDone(dto, actor) {
      if (!actor?.is_system) throw new ForbiddenError('Only a Super Admin can mark several follow-ups done at once');
      const ids = [...new Set(dto.ids)];
      const note = (dto.note || '').trim();
      const done = await repository.markDone(ids, actor?.id ?? null, note);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'EnquiryActivity', entityId: 'bulk', actor,
        changes: { follow_up_done: { ids, done }, ...(note ? { note } : {}) },
      });
      return { done };
    },

    /**
     * A page of follow-ups for a tab, with every tab's count (same filters).
     * @param {{ tab?: string, from?: Date, to?: Date, added_by?: number, stage?: string, medium?: string,
     *   search?: string, page?: number, limit?: number }} q
     */
    async list(q, actor) {
      const scope = scopeFor(actor);
      const tab = TABS.includes(q.tab) ? q.tab : 'overdue';
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday.getTime() + DAY_MS);

      const term = (q.search || '').trim();
      const filters = {
        deleted_at: null,
        is_review: false,
        follow_up_at: { not: null },
        follow_up_ended: false,
        ...scope.where,
        // Someone else's follow-ups only with Follow-ups → View.
        ...(scope.all && q.added_by ? { created_by: q.added_by } : {}),
        ...(q.medium ? { next_medium: q.medium } : {}),
        enquiry: {
          deleted_at: null,
          ...(q.stage ? { stage: q.stage } : {}),
        },
        ...(term ? {
          OR: [
            { subject: { contains: term } },
            { next_action: { contains: term } },
            { enquiry: { ref_no: { contains: term } } },
            { enquiry: { title: { contains: term } } },
            { enquiry: { customer: { name: { contains: term } } } },
          ],
        } : {}),
      };
      // A date range (the calendar, or narrowing a tab) on the follow-up's date.
      const range = q.from || q.to ? {
        follow_up_at: { not: null, ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: new Date(new Date(q.to).getTime() + DAY_MS) } : {}) },
      } : null;
      const where = (t) => ({ AND: [filters, tabWhere(t, startOfToday, endOfToday), ...(range ? [range] : [])] });

      const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500);
      const page = Math.max(Number(q.page) || 1, 1);
      const [{ items, total }, ...counts] = await Promise.all([
        repository.findPage({ where: where(tab), orderBy: ORDER[tab], skip: (page - 1) * limit, take: limit }),
        ...['overdue', 'today', 'upcoming', 'done'].map((t) => repository.count({ AND: [filters, tabWhere(t, startOfToday, endOfToday)] })),
      ]);

      const [names, doneBy] = await Promise.all([
        repository.userNames(items.flatMap((i) => [i.created_by, i.follow_up_done_by, i.enquiry?.owner_id, i.enquiry?.handler_id])),
        repository.doneBy(items.map((i) => i.follow_up_done_activity_id).filter(Boolean)),
      ]);
      const status = (i) => {
        if (i.follow_up_done_at) return 'DONE';
        const at = new Date(i.follow_up_at);
        if (at < startOfToday) return 'OVERDUE';
        return at < endOfToday ? 'TODAY' : 'UPCOMING';
      };

      return {
        tab,
        scope: scope.all ? 'all' : 'own',
        counts: { overdue: counts[0], today: counts[1], upcoming: counts[2], done: counts[3] },
        total, page, limit,
        items: items.map((i) => ({
          ...i,
          status: status(i),
          days_overdue: status(i) === 'OVERDUE' ? Math.floor((startOfToday - new Date(new Date(i.follow_up_at).setHours(0, 0, 0, 0))) / DAY_MS) : null,
          created_by_name: names.get(i.created_by) ?? null,
          done_by_name: names.get(i.follow_up_done_by) ?? null,
          owner_name: names.get(i.enquiry?.owner_id) ?? null,
          handler_name: names.get(i.enquiry?.handler_id ?? i.enquiry?.owner_id) ?? null,
          done_entry: i.follow_up_done_activity_id ? doneBy.get(i.follow_up_done_activity_id) ?? null : null,
        })),
      };
    },
  };
}

const followupsService = createFollowupsService(followupsRepository);

module.exports = { followupsService, createFollowupsService };
