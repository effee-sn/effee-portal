-- Projects module: a standalone project record with an optional reference to
-- the sales enquiry it originated from.
CREATE TABLE `Project` (
  `id`          INTEGER NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(191) NOT NULL,
  `name`        VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status`      ENUM('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNING',
  `enquiry_id`  INTEGER NULL,
  `owner_id`    INTEGER NULL,
  `start_date`  DATETIME(3) NULL,
  `end_date`    DATETIME(3) NULL,
  `created_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3) NOT NULL,
  `deleted_at`  DATETIME(3) NULL,
  `created_by`  INTEGER NULL,
  `updated_by`  INTEGER NULL,

  UNIQUE INDEX `Project_code_key`(`code`),
  INDEX `Project_status_idx`(`status`),
  INDEX `Project_enquiry_id_idx`(`enquiry_id`),
  INDEX `Project_owner_id_idx`(`owner_id`),
  INDEX `Project_deleted_at_idx`(`deleted_at`),
  INDEX `Project_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Project`
  ADD CONSTRAINT `Project_enquiry_id_fkey` FOREIGN KEY (`enquiry_id`) REFERENCES `Enquiry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Project_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
