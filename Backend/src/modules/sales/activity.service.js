const { activityRepository } = require('./activity.repository');
const { enquiryService } = require('./enquiry.service');
const { auditService } = require('../audit/audit.service');
const { notificationService } = require('../notification/notification.service');
const config = require('../../config/env');
const { zonedTime } = require('../../lib/timezone');
const { NotFoundError, ForbiddenError, ConflictError } = require('../../core');
const { assertActivityAccess, isHandler, assertCanSeeEnquiry } = require('./access');
const { stageName } = require('./emailDetails');

const MEDIUM = Object.freeze({ CALL: 'Call', MEETING: 'Meeting', TEAMS: 'Teams', SITE_VISIT: 'Site visit', EMAIL: 'Email' });

/**
 * Enquiry activity business logic — the interaction trail used for INCOMING
 * intake and post-offer follow-ups. Writing an activity is stage work, so it's
 * gated to the enquiry's assigned owner (or a system user). The newest
 * temperature-bearing entry rolls up to Enquiry.current_temperature.
 *
 * @param {ReturnType<typeof import('./activity.repository').createActivityRepository>} repository
 */
function createActivityService(repository) {
  /** @throws {NotFoundError} */
  async function loadEnquiry(enquiryId) {
    const enquiry = await repository.findEnquiry(enquiryId);
    if (!enquiry) throw new NotFoundError('Enquiry');
    return enquiry;
  }

  /**
   * "Needs negotiation" moves the enquiry to Negotiation — moving stages is
   * the work of whoever holds it, so only they (or a system user) may flag it.
   * @throws {ForbiddenError}
   */
  function assertMayFlagNegotiation(enquiry, dto, actor) {
    if (!dto.needs_negotiation || actor?.is_system || isHandler(enquiry, actor)) return;
    throw new ForbiddenError('Only the person the enquiry is with can mark it as needing negotiation');
  }

  /** Parses the stored JSON participant ids back into an array for the API. */
  function mapRow(row) {
    if (!row) return row;
    let internal = [];
    try { internal = row.internal_participants ? JSON.parse(row.internal_participants) : []; }
    catch { internal = []; }
    return { ...row, internal_participants: internal };
  }

  /**
   * Maps a validated DTO to writable columns (serialising participant ids).
   *
   * Follow-up timing: an exact date-time is reminded at the kind's configured
   * times before it (Sales → Configuration); a day ('YYYY-MM-DD') is stored at
   * the morning reminder time in the business timezone. Any new follow-up date
   * re-arms all its reminders.
   */
  function pickWritable(dto, data = {}) {
    if (dto.follow_up_at !== undefined) {
      if (typeof dto.follow_up_at === 'string') {
        data.follow_up_at = zonedTime(dto.follow_up_at, config.FOLLOWUP_REMINDER.DAY_TIME, config.APP_TIMEZONE);
        data.follow_up_timed = false;
      } else {
        data.follow_up_at = dto.follow_up_at;
        data.follow_up_timed = true;
      }
      data.reminded_at = null;
      data.reminder_offset_sent = null;
      data.reminders_armed_at = new Date();
    } else if (dto.next_medium !== undefined || dto.is_review !== undefined) {
      // Another kind means other reminder times; ones already past don't fire late.
      data.reminders_armed_at = new Date();
    }
    for (const f of ['type', 'activity_at', 'duration_min', 'subject', 'minutes', 'outcome',
      'customer_participants', 'next_action', 'next_medium', 'temperature',
      'follow_up_ended', 'needs_negotiation', 'is_review']) {
      if (dto[f] !== undefined) data[f] = dto[f];
    }
    if (dto.internal_participants !== undefined) {
      data.internal_participants = JSON.stringify(dto.internal_participants);
    }
    return data;
  }

  /** Recomputes the enquiry's denormalised current temperature. */
  async function rollUpTemperature(enquiryId) {
    const temp = await repository.latestTemperature(enquiryId);
    await repository.setEnquiryTemperature(enquiryId, temp);
    return temp;
  }

  return {
    /**
     * An enquiry's activities (or reviews), each with who logged it and — when
     * it was corrected later — who last edited it and when.
     * @param {number} enquiryId @param {boolean} [isReview]
     */
    async listForEnquiry(enquiryId, isReview, actor) {
      assertCanSeeEnquiry(await loadEnquiry(enquiryId), actor);
      const rows = await repository.findByEnquiry(enquiryId, isReview);
      const edits = await repository.lastEdits(rows.map((r) => r.id));
      const names = await repository.userNames([...rows.map((r) => r.created_by), ...[...edits.values()].map((e) => e.actor_id)]);
      return rows.map((r) => {
        const edit = edits.get(r.id);
        return {
          ...mapRow(r),
          created_by_name: names.get(r.created_by) ?? null,
          edited_at: edit?.at ?? null,
          edited_by_name: edit ? names.get(edit.actor_id) ?? null : null,
        };
      });
    },

    /**
     * @param {number} enquiryId
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async create(enquiryId, dto, actor) {
      const enquiry = await loadEnquiry(enquiryId);
      // Open at every stage until Won / Lost: Sales → View + Create, or View while it is with you.
      assertActivityAccess('log', actor, null, enquiry);
      assertMayFlagNegotiation(enquiry, dto, actor);

      const data = pickWritable(dto, {
        enquiry_id: enquiryId,
        stage: enquiry.stage, // stamp the stage this activity was logged in
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });
      const activity = await repository.create(data);
      if (dto.temperature !== undefined) await rollUpTemperature(enquiryId);
      // This entry is the follow-up having happened: the same person's earlier
      // open follow-ups on the enquiry are done.
      await repository.closeEarlierFollowUps(activity);

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'EnquiryActivity',
        entityId: activity.id,
        actor,
        changes: { enquiry_id: enquiryId, type: activity.type, subject: activity.subject },
      });

      // Tell the owner (unless they logged it themselves).
      notificationService.notify({
        userIds: [enquiry.owner_id],
        type: notificationService.Type.ACTIVITY_FOLLOWUP,
        title: `Activity on ${enquiry.ref_no}`,
        body: `${activity.subject}${activity.follow_up_at ? ' — follow-up scheduled' : ''}`,
        email: {
          intro: `${activity.is_review ? 'An internal review' : 'A customer interaction'} was logged on your enquiry.`,
          details: [
            ['Enquiry', `${enquiry.ref_no} — ${enquiry.title}`],
            ['Stage', stageName(enquiry.stage)],
            [activity.is_review ? 'Review' : MEDIUM[activity.type] || 'Activity', activity.subject],
            ['Outcome', activity.outcome],
            ['Next follow-up', activity.follow_up_at
              ? new Date(activity.follow_up_at).toLocaleString('en-IN', activity.follow_up_timed
                ? { timeZone: config.APP_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }
                : { timeZone: config.APP_TIMEZONE, dateStyle: 'medium' })
              : null],
          ],
        },
        entityType: 'Enquiry',
        entityId: String(enquiryId),
        link: `/dashboard/sales/enquiries/${enquiryId}`,
        actorId: actor?.id ?? null,
      });

      // An Incoming enquiry moves to Contacted on its first logged (non-review)
      // activity — that activity is the contact, so it is recorded under
      // Contacted (and stays editable there).
      if (!dto.is_review && enquiry.enquiry_type === 'INCOMING' && enquiry.stage === 'NEW') {
        let moved = false;
        try { await enquiryService.update(enquiryId, { stage: 'CONTACTED' }, actor); moved = true; }
        catch { /* prerequisites not met yet — leave it at New */ }
        if (moved) return mapRow(await repository.update(activity.id, { stage: 'CONTACTED' }));
      }

      // Flagging a follow-up for negotiation moves the deal into the
      // Negotiation stage (where a revised offer is added and re-sent). Allowed
      // from either follow-up: the Offer follow-up, or a later
      // Negotiation Follow-up round.
      if (!dto.is_review && dto.needs_negotiation
        && (enquiry.stage === 'FOLLOW_UP' || enquiry.stage === 'NEGOTIATION_FOLLOW_UP')) {
        await enquiryService.setStageAuto(enquiryId, 'NEGOTIATION', actor, {
          note: 'negotiation requested — please prepare and send a revised offer',
        });
      }

      return mapRow(activity);
    },

    /**
     * @param {number} id
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Activity');
      const enquiry = await loadEnquiry(before.enquiry_id);
      assertCanSeeEnquiry(enquiry, actor);
      assertActivityAccess('edit', actor, before, enquiry); // own entry, still in its stage
      assertMayFlagNegotiation(enquiry, dto, actor);

      const data = pickWritable(dto, { updated_by: actor?.id ?? null });
      const activity = await repository.update(id, data);
      await rollUpTemperature(before.enquiry_id);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'EnquiryActivity',
        entityId: id,
        actor,
        changes: auditService.diff(before, data, ['internal_participants']),
      });

      // Flagging a follow-up for negotiation moves either follow-up →
      // Negotiation.
      if (!before.is_review && dto.needs_negotiation
        && (enquiry.stage === 'FOLLOW_UP' || enquiry.stage === 'NEGOTIATION_FOLLOW_UP')) {
        await enquiryService.setStageAuto(before.enquiry_id, 'NEGOTIATION', actor, {
          note: 'negotiation requested — please prepare and send a revised offer',
        });
      }

      return mapRow(activity);
    },

    /**
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async remove(id, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Activity');
      const enquiry = await loadEnquiry(before.enquiry_id);
      assertActivityAccess('delete', actor, before);

      await repository.softDelete(id, actor?.id ?? null);
      await repository.reopenFollowUpsDoneBy(id);
      await rollUpTemperature(before.enquiry_id);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'EnquiryActivity',
        entityId: id,
        actor,
        changes: { enquiry_id: before.enquiry_id, subject: before.subject, soft_deleted: true },
      });
    },

    /**
     * Marks a follow-up done without a new entry (e.g. handled by someone else,
     * no longer needed): the person who added it, or Sales → Edit.
     * @param {number} id @param {{ note?: string|null }} dto
     */
    async markFollowUpDone(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Activity');
      const enquiry = await loadEnquiry(before.enquiry_id);
      assertCanSeeEnquiry(enquiry, actor);
      const mayClose = actor?.is_system || (actor?.id != null && actor.id === before.created_by) || actor?.permissions?.includes('SALES_EDIT');
      if (!mayClose) throw new ForbiddenError('Only the person who added this follow-up (or Sales → Edit) can mark it done');
      if (!before.follow_up_at || before.follow_up_ended) throw new ConflictError('This entry has no follow-up to mark done');
      if (before.follow_up_done_at) throw new ConflictError('This follow-up is already done');
      const note = (dto?.note || '').trim();
      const activity = await repository.markFollowUpDone(id, actor?.id ?? null, note);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'EnquiryActivity', entityId: id, actor,
        changes: { follow_up_done: { from: false, to: true }, ...(note ? { note } : {}) },
      });
      return mapRow(activity);
    },
  };
}

const activityService = createActivityService(activityRepository);

module.exports = { activityService, createActivityService };
