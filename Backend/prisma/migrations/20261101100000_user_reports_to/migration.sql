-- Reporting manager: who each user reports to (optional). With none, the
-- department head is their manager; the organisation chart follows that.
-- MySQL creates the index for the foreign key itself.
ALTER TABLE `User` ADD COLUMN `reports_to_id` INTEGER NULL;
ALTER TABLE `User` ADD CONSTRAINT `User_reports_to_id_fkey` FOREIGN KEY (`reports_to_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
