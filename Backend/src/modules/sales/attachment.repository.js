const prisma = require('../../lib/prisma');

/**
 * Enquiry attachment data-access layer.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createAttachmentRepository(db) {
  const attachmentSelect = Object.freeze({
    id: true,
    enquiry_id: true,
    kind: true,
    file_name: true,
    mime_type: true,
    size_bytes: true,
    note: true,
    stage: true,
    version: true,
    superseded_at: true,
    sent_at: true,
    sent_by: true,
    created_at: true,
    created_by: true,
  });

  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    attachmentSelect,
    active,

    /** Every kept document — current and superseded — newest version first, with uploader names. */
    async findByEnquiry(enquiryId) {
      const rows = await db.enquiryAttachment.findMany({
        where: active({ enquiry_id: enquiryId }),
        select: attachmentSelect,
        orderBy: [{ kind: 'asc' }, { version: 'desc' }, { created_at: 'desc' }],
      });
      const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
      const users = ids.length
        ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
      return rows.map((r) => ({ ...r, uploaded_by: r.created_by ? names[r.created_by] ?? null : null }));
    },

    /** Highest kept version of a kind on an enquiry (0 when none). */
    async maxVersion(enquiryId, kind) {
      const agg = await db.enquiryAttachment.aggregate({
        where: active({ enquiry_id: enquiryId, kind }),
        _max: { version: true },
      });
      return agg._max.version ?? 0;
    },

    /** The newest superseded version of a kind — restored when the current one is deleted. */
    findLatestSuperseded(enquiryId, kind) {
      return db.enquiryAttachment.findFirst({
        where: active({ enquiry_id: enquiryId, kind, superseded_at: { not: null } }),
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        select: { id: true, version: true },
      });
    },

    /** Full row incl. stored_name — used by the download stream. */
    findByIdWithFile(id) {
      return db.enquiryAttachment.findFirst({
        where: active({ id }),
        select: { ...attachmentSelect, stored_name: true },
      });
    },

    findById(id) {
      return db.enquiryAttachment.findFirst({ where: active({ id }), select: attachmentSelect });
    },

    create(data) {
      return db.enquiryAttachment.create({ data, select: attachmentSelect });
    },

    update(id, data) {
      return db.enquiryAttachment.update({ where: { id }, data, select: attachmentSelect });
    },

    softDelete(id, actorId = null) {
      return db.enquiryAttachment.update({
        where: { id },
        data: { deleted_at: new Date(), updated_by: actorId },
        select: { id: true },
      });
    },

    /** Marks the current doc of a single-instance kind as superseded (kept as history). */
    supersedeCurrent(enquiryId, kind, actorId = null) {
      return db.enquiryAttachment.updateMany({
        where: active({ enquiry_id: enquiryId, kind, superseded_at: null }),
        data: { superseded_at: new Date(), updated_by: actorId },
      });
    },

    findEnquiry(enquiryId) {
      return db.enquiry.findFirst({
        where: active({ id: enquiryId }),
        select: { id: true, owner_id: true, handler_id: true, ref_no: true, stage: true },
      });
    },
  };
}

const attachmentRepository = createAttachmentRepository(prisma);

module.exports = { attachmentRepository, createAttachmentRepository };
