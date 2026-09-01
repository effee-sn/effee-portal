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
    sent_at: true,
    sent_by: true,
    created_at: true,
    created_by: true,
  });

  const active = (where = {}) => ({ ...where, deleted_at: null });

  return {
    attachmentSelect,
    active,

    findByEnquiry(enquiryId) {
      return db.enquiryAttachment.findMany({
        where: active({ enquiry_id: enquiryId }),
        select: attachmentSelect,
        orderBy: [{ kind: 'asc' }, { created_at: 'desc' }],
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

    /** Soft-deletes any existing live doc of a single-instance kind. */
    softDeleteKind(enquiryId, kind, actorId = null) {
      return db.enquiryAttachment.updateMany({
        where: active({ enquiry_id: enquiryId, kind }),
        data: { deleted_at: new Date(), updated_by: actorId },
      });
    },

    findEnquiry(enquiryId) {
      return db.enquiry.findFirst({
        where: active({ id: enquiryId }),
        select: { id: true, owner_id: true, ref_no: true, stage: true },
      });
    },
  };
}

const attachmentRepository = createAttachmentRepository(prisma);

module.exports = { attachmentRepository, createAttachmentRepository };
