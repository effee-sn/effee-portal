const fs = require('fs');
const path = require('path');

const { attachmentRepository } = require('./attachment.repository');
const { storageDir } = require('./attachment.upload');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ForbiddenError, BadRequestError, ConflictError } = require('../../core');

// Kinds that hold a single live document (re-uploading replaces it). OFFER is
// the exception — it keeps every revision.
const SINGLE_KINDS = new Set(['FORMAT_PDF', 'FORMAT_EXCEL', 'CONCEPT', 'POWER_CALC', 'COSTING']);

/**
 * Enquiry attachment business logic. Uploading/removing/marking-sent is stage
 * work, gated to the assigned owner (or a system user). Downloading is open to
 * any viewer (the route enforces SALES_VIEW).
 *
 * @param {ReturnType<typeof import('./attachment.repository').createAttachmentRepository>} repository
 */
function createAttachmentService(repository) {
  async function loadEnquiry(enquiryId) {
    const enquiry = await repository.findEnquiry(enquiryId);
    if (!enquiry) throw new NotFoundError('Enquiry');
    return enquiry;
  }

  function assertCanManage(enquiry, actor) {
    if (actor?.is_system) return;
    if (actor?.id && actor.id === enquiry.owner_id) return;
    throw new ForbiddenError('Only the assigned owner can manage documents on this enquiry');
  }

  /** Best-effort removal of an orphaned upload when the request is rejected. */
  function discard(file) {
    if (file?.path) fs.promises.unlink(file.path).catch(() => {});
  }

  return {
    /** @param {number} enquiryId */
    async listForEnquiry(enquiryId) {
      await loadEnquiry(enquiryId);
      return repository.findByEnquiry(enquiryId);
    },

    /**
     * Records an uploaded file against an enquiry.
     * @param {number} enquiryId
     * @param {Express.Multer.File} file
     * @param {{ kind: string, note?: string }} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async record(enquiryId, file, dto, actor) {
      if (!file) throw new BadRequestError('No file uploaded');
      let enquiry;
      try {
        enquiry = await loadEnquiry(enquiryId);
        assertCanManage(enquiry, actor);
      } catch (err) {
        discard(file); // don't leave the multer-saved file behind
        throw err;
      }

      // Single-instance kinds replace the prior live doc.
      if (SINGLE_KINDS.has(dto.kind)) {
        await repository.softDeleteKind(enquiryId, dto.kind, actor?.id ?? null);
      }

      const attachment = await repository.create({
        enquiry_id: enquiryId,
        kind: dto.kind,
        file_name: file.originalname,
        stored_name: file.filename,
        mime_type: file.mimetype,
        size_bytes: file.size,
        note: dto.note ?? null,
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'EnquiryAttachment',
        entityId: attachment.id,
        actor,
        changes: { enquiry_id: enquiryId, kind: dto.kind, file_name: file.originalname },
      });

      return attachment;
    },

    /**
     * Resolves an attachment to an absolute on-disk path for streaming.
     * @param {number} id
     * @returns {Promise<{ absPath: string, file_name: string, mime_type: string }>}
     */
    async fileFor(id) {
      const row = await repository.findByIdWithFile(id);
      if (!row) throw new NotFoundError('Attachment');
      // stored_name is a server-generated random name; still guard against any
      // separator before joining, so a bad row can never escape the store.
      if (/[\\/]/.test(row.stored_name)) throw new NotFoundError('Attachment');
      const absPath = path.join(storageDir, row.stored_name);
      if (!fs.existsSync(absPath)) throw new NotFoundError('File');
      return { absPath, file_name: row.file_name, mime_type: row.mime_type };
    },

    /**
     * Marks (or unmarks) an OFFER document as sent to the customer.
     * @param {number} id
     * @param {boolean} sent
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async markSent(id, sent, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Attachment');
      if (before.kind !== 'OFFER') throw new ConflictError('Only offer documents can be marked as sent');
      const enquiry = await loadEnquiry(before.enquiry_id);
      assertCanManage(enquiry, actor);

      const attachment = await repository.update(id, {
        sent_at: sent ? new Date() : null,
        sent_by: sent ? (actor?.id ?? null) : null,
        updated_by: actor?.id ?? null,
      });

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'EnquiryAttachment',
        entityId: id,
        actor,
        changes: { sent: { from: Boolean(before.sent_at), to: sent } },
      });

      return attachment;
    },

    /**
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async remove(id, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Attachment');
      const enquiry = await loadEnquiry(before.enquiry_id);
      assertCanManage(enquiry, actor);

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'EnquiryAttachment',
        entityId: id,
        actor,
        changes: { enquiry_id: before.enquiry_id, kind: before.kind, file_name: before.file_name, soft_deleted: true },
      });
    },
  };
}

const attachmentService = createAttachmentService(attachmentRepository);

module.exports = { attachmentService, createAttachmentService };
