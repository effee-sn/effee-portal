-- Rename enum values and the source-detail column to match the UI, preserving
-- existing data. Enum values can't be renamed in place safely (MySQL matches by
-- string, not position), so each is: add the new value, migrate rows, drop the
-- old value. Table name is PascalCase (ServiceTicket) for case-sensitive MySQL.

-- ticket_type: DC -> OTHERS
ALTER TABLE `ServiceTicket` MODIFY `ticket_type` ENUM('CALL', 'EMAIL', 'DC', 'OTHERS') NOT NULL;
UPDATE `ServiceTicket` SET `ticket_type` = 'OTHERS' WHERE `ticket_type` = 'DC';
ALTER TABLE `ServiceTicket` MODIFY `ticket_type` ENUM('CALL', 'EMAIL', 'OTHERS') NOT NULL;

-- support_type: ON_SITE -> AT_EFFEE
ALTER TABLE `ServiceTicket` MODIFY `support_type` ENUM('REMOTE', 'SITE_VISIT', 'ON_SITE', 'AT_EFFEE') NULL;
UPDATE `ServiceTicket` SET `support_type` = 'AT_EFFEE' WHERE `support_type` = 'ON_SITE';
ALTER TABLE `ServiceTicket` MODIFY `support_type` ENUM('REMOTE', 'SITE_VISIT', 'AT_EFFEE') NULL;

-- dc_number -> source_details (CHANGE renames the column and keeps its data)
ALTER TABLE `ServiceTicket` CHANGE `dc_number` `source_details` VARCHAR(191) NULL;
