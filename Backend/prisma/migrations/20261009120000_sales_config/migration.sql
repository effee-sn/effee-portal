-- Sales → Configuration: applications list + per-stage win probability.

-- CreateTable
CREATE TABLE `SalesApplication` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `SalesApplication_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesStageProbability` (
    `stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST') NOT NULL,
    `probability` INTEGER NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` INTEGER NULL,

    PRIMARY KEY (`stage`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Enquiry` ADD COLUMN `application_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Enquiry_application_id_idx` ON `Enquiry`(`application_id`);

-- AddForeignKey
ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `SalesApplication`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Default probabilities (editable in Sales → Configuration).
INSERT INTO `SalesStageProbability` (`stage`, `probability`, `updated_at`) VALUES
    ('NEW', 10, CURRENT_TIMESTAMP(3)),
    ('CONTACTED', 15, CURRENT_TIMESTAMP(3)),
    ('REVIEW', 20, CURRENT_TIMESTAMP(3)),
    ('CONCEPT', 30, CURRENT_TIMESTAMP(3)),
    ('COSTING', 40, CURRENT_TIMESTAMP(3)),
    ('COSTING_REVIEW', 45, CURRENT_TIMESTAMP(3)),
    ('OFFER_RELEASED', 50, CURRENT_TIMESTAMP(3)),
    ('FOLLOW_UP', 60, CURRENT_TIMESTAMP(3)),
    ('NEGOTIATION', 75, CURRENT_TIMESTAMP(3)),
    ('NEGOTIATION_FOLLOW_UP', 80, CURRENT_TIMESTAMP(3)),
    ('WON', 100, CURRENT_TIMESTAMP(3)),
    ('LOST', 0, CURRENT_TIMESTAMP(3));

-- Starter applications (editable / removable in Sales → Configuration).
INSERT INTO `SalesApplication` (`name`, `sort_order`, `updated_at`) VALUES
    ('Annealing', 1, CURRENT_TIMESTAMP(3)),
    ('Hardening', 2, CURRENT_TIMESTAMP(3));
