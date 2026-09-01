-- Sales workflow: a current-handler (baton) on the enquiry, and a single-row
-- config holding the selected Internal Sales handler.
ALTER TABLE `Enquiry`
  ADD COLUMN `handler_id` INT NULL,
  ADD INDEX `Enquiry_handler_id_idx` (`handler_id`),
  ADD CONSTRAINT `Enquiry_handler_id_fkey` FOREIGN KEY (`handler_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `SalesWorkflowConfig` (
  `id`               INT NOT NULL AUTO_INCREMENT,
  `internal_user_id` INT NULL,
  `created_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3) NOT NULL,
  `updated_by`       INT NULL,
  PRIMARY KEY (`id`),
  INDEX `SalesWorkflowConfig_internal_user_id_idx` (`internal_user_id`),
  CONSTRAINT `SalesWorkflowConfig_internal_user_id_fkey` FOREIGN KEY (`internal_user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
