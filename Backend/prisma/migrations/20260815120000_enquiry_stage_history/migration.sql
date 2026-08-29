-- D1: stage history + time-in-stage. Hand-written (local MariaDB segfaults on
-- Prisma's live-DB introspection).

ALTER TABLE `Enquiry` ADD COLUMN `stage_since` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
-- Backfill: treat the current stage as entered when the enquiry was created.
UPDATE `Enquiry` SET `stage_since` = `created_at`;

CREATE TABLE `EnquiryStageEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enquiry_id` INTEGER NOT NULL,
    `from_stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'OFFER_RELEASED', 'FOLLOW_UP', 'WON', 'LOST') NULL,
    `to_stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'OFFER_RELEASED', 'FOLLOW_UP', 'WON', 'LOST') NOT NULL,
    `changed_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EnquiryStageEvent_enquiry_id_idx`(`enquiry_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EnquiryStageEvent` ADD CONSTRAINT `EnquiryStageEvent_enquiry_id_fkey` FOREIGN KEY (`enquiry_id`) REFERENCES `Enquiry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
