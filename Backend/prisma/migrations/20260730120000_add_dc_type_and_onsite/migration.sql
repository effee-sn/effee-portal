-- AlterTable
ALTER TABLE `serviceticket` ADD COLUMN `dc_number` VARCHAR(191) NULL,
    MODIFY `ticket_type` ENUM('CALL', 'EMAIL', 'DC') NOT NULL,
    MODIFY `support_type` ENUM('REMOTE', 'SITE_VISIT', 'ON_SITE') NULL;

