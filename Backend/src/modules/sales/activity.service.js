const { activityRepository } = require('./activity.repository');
const { enquiryService } = require('./enquiry.service');
const { auditService } = require('../audit/audit.service');
const { notificationService } = require('../notification/notification.service');
const { NotFoundError, ForbiddenError } = require('../../core');

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

  /** @throws {ForbiddenError} */
  function assertCanManage(enquiry, actor) {
    if (actor?.is_system) return;
    if (actor?.id && actor.id === enquiry.owner_id) return;
    throw new ForbiddenError('Only the assigned owner can log activity on this enquiry');
  }

  /** Parses the stored JSON participant ids back into an array for the API. */
  function mapRow(row) {
    if (!row) return row;
    let internal = [];
    try { internal = row.internal_participants ? JSON.parse(row.internal_participants) : []; }
    catch { internal = []; }
    return { ...row, internal_participants: internal };
  }

  /** Maps a validated DTO to writable columns (serialising participant ids). */
  function pickWritable(dto, data = {}) {
    for (const f of ['type', 'activity_at', 'duration_min', 'subject', 'minutes', 'outcome',
      'customer_participants', 'next_action', 'follow_up_at', 'next_medium', 'temperature',
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
    /** @param {number} enquiryId @param {boolean} [isReview] */
    async listForEnquiry(enquiryId, isReview) {
      await loadEnquiry(enquiryId);
      const rows = await repository.findByEnquiry(enquiryId, isReview);
      return rows.map(mapRow);
    },

    /**
     * @param {number} enquiryId
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async create(enquiryId, dto, actor) {
      const enquiry = await loadEnquiry(enquiryId);
      assertCanManage(enquiry, actor);

      const data = pickWritable(dto, {
        enquiry_id: enquiryId,
        stage: enquiry.stage, // stamp the stage this activity was logged in
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });
      const activity = await repository.create(data);
      if (dto.temperature !== undefined) await rollUpTemperature(enquiryId);

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
        entityType: 'Enquiry',
        entityId: String(enquiryId),
        link: `/dashboard/sales/enquiries/${enquiryId}`,
        actorId: actor?.id ?? null,
      });

      // An Incoming enquiry moves to Contacted on its first logged (non-review)
      // activity.
      if (!dto.is_review && enquiry.enquiry_type === 'INCOMING' && enquiry.stage === 'NEW') {
        try { await enquiryService.update(enquiryId, { stage: 'CONTACTED' }, actor); }
        catch { /* prerequisites not met yet — leave it at New */ }
      }

      // Flagging a follow-up for negotiation moves the deal into the
      // Negotiation stage (where a revised offer is added and re-sent). Allowed
      // from either follow-up: the Offer Released follow-up, or a later
      // Negotiation Follow-up round.
      if (!dto.is_review && dto.needs_negotiation
        && (enquiry.stage === 'FOLLOW_UP' || enquiry.stage === 'NEGOTIATION_FOLLOW_UP')) {
        await enquiryService.setStageAuto(enquiryId, 'NEGOTIATION', actor);
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
      assertCanManage(enquiry, actor);

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
        await enquiryService.setStageAuto(before.enquiry_id, 'NEGOTIATION', actor);
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
      assertCanManage(enquiry, actor);

      await repository.softDelete(id, actor?.id ?? null);
      await rollUpTemperature(before.enquiry_id);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'EnquiryActivity',
        entityId: id,
        actor,
        changes: { enquiry_id: before.enquiry_id, subject: before.subject, soft_deleted: true },
      });
    },
  };
}

const activityService = createActivityService(activityRepository);

module.exports = { activityService, createActivityService };
