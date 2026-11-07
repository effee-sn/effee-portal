-- Archive an enquiry (Sales → Archive, SALES_ARCHIVE): a duplicate or mistaken
-- enquiry leaves every list, count, report, reminder and flow, and stays
-- read-only until restored. The reason is mandatory; a duplicate may point to
-- the enquiry it duplicates. Given to no role: choose the people in Roles.
ALTER TABLE `Enquiry`
  ADD COLUMN `archived_at` DATETIME(3) NULL,
  ADD COLUMN `archived_by_id` INTEGER NULL,
  ADD COLUMN `archive_reason` VARCHAR(20) NULL,
  ADD COLUMN `archive_note` TEXT NULL,
  ADD COLUMN `duplicate_of_id` INTEGER NULL;

CREATE INDEX `Enquiry_archived_at_idx` ON `Enquiry`(`archived_at`);
CREATE INDEX `Enquiry_duplicate_of_id_idx` ON `Enquiry`(`duplicate_of_id`);

ALTER TABLE `Enquiry`
  ADD CONSTRAINT `Enquiry_archived_by_id_fkey` FOREIGN KEY (`archived_by_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Enquiry_duplicate_of_id_fkey` FOREIGN KEY (`duplicate_of_id`) REFERENCES `Enquiry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The ARCHIVE action must exist before a permission can use it.
ALTER TABLE `Permission` MODIFY `action` ENUM('CREATE', 'VIEW', 'EDIT', 'DELETE', 'APPROVE', 'FINANCE', 'EXPORT', 'REASSIGN', 'PUBLISH', 'ARCHIVE') NOT NULL;

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'ARCHIVE', 'SALES_ARCHIVE', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'sales'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'SALES_ARCHIVE');
