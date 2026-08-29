-- Increment C: enquiry document store (format PDF/Excel, concept, costing, offers).
-- Hand-written (local MariaDB segfaults on Prisma's live-DB introspection).

CREATE TABLE `EnquiryAttachment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enquiry_id` INTEGER NOT NULL,
    `kind` ENUM('FORMAT_PDF', 'FORMAT_EXCEL', 'CONCEPT', 'COSTING', 'OFFER') NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `stored_name` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `note` TEXT NULL,
    `sent_at` DATETIME(3) NULL,
    `sent_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `EnquiryAttachment_stored_name_key`(`stored_name`),
    INDEX `EnquiryAttachment_enquiry_id_idx`(`enquiry_id`),
    INDEX `EnquiryAttachment_kind_idx`(`kind`),
    INDEX `EnquiryAttachment_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EnquiryAttachment` ADD CONSTRAINT `EnquiryAttachment_enquiry_id_fkey` FOREIGN KEY (`enquiry_id`) REFERENCES `Enquiry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
