-- Document versioning for enquiry attachments: a version number per
-- enquiry + kind, and "superseded" (replaced, kept as history) as a state
-- separate from "deleted".

-- AlterTable
ALTER TABLE `EnquiryAttachment`
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `superseded_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `EnquiryAttachment_enquiry_id_kind_idx` ON `EnquiryAttachment`(`enquiry_id`, `kind`);

-- Recover history: before this change, re-uploading a single-document kind
-- soft-deleted the old file in the same request that created the new one. A
-- soft-deleted row with a same-kind upload created within seconds of its
-- deletion was therefore *replaced*, not deleted — restore it as a superseded
-- version. (Offers were never replaced, so they are left alone.)
UPDATE `EnquiryAttachment` AS old_doc
JOIN `EnquiryAttachment` AS new_doc
  ON  new_doc.`enquiry_id` = old_doc.`enquiry_id`
  AND new_doc.`kind` = old_doc.`kind`
  AND new_doc.`id` > old_doc.`id`
  AND ABS(TIMESTAMPDIFF(SECOND, old_doc.`deleted_at`, new_doc.`created_at`)) <= 5
SET old_doc.`superseded_at` = old_doc.`deleted_at`,
    old_doc.`deleted_at` = NULL
WHERE old_doc.`deleted_at` IS NOT NULL
  AND old_doc.`kind` <> 'OFFER';

-- Number every kept document in upload order within its enquiry + kind.
UPDATE `EnquiryAttachment` AS a
JOIN (
    SELECT `id`,
           ROW_NUMBER() OVER (PARTITION BY `enquiry_id`, `kind` ORDER BY `created_at`, `id`) AS rn
    FROM `EnquiryAttachment`
    WHERE `deleted_at` IS NULL
) AS v ON v.`id` = a.`id`
SET a.`version` = v.rn;
