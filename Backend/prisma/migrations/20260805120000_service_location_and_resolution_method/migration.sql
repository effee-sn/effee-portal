-- Split "support type" into two concepts:
--   * a ticket-level SERVICE LOCATION, chosen at intake by the initiator;
--   * a per-department RESOLUTION METHOD, chosen by each lead at the plan stage.

-- 1. New columns.
ALTER TABLE `ServiceTicket` ADD COLUMN `service_location` ENUM('AT_CUSTOMER', 'AT_EFFEE') NULL;
ALTER TABLE `TicketDepartmentTask` ADD COLUMN `resolution_method` ENUM('REMOTE', 'SITE_VISIT') NULL;

-- 2. Backfill the ticket's service location from the old support type:
--    "At Effee" stays; a remote/site-visit ticket implies the machine is at the
--    customer.
UPDATE `ServiceTicket` SET `service_location` = 'AT_EFFEE'    WHERE `support_type` = 'AT_EFFEE';
UPDATE `ServiceTicket` SET `service_location` = 'AT_CUSTOMER' WHERE `support_type` IN ('REMOTE', 'SITE_VISIT');

-- 3. Carry the old method (remote / site visit) onto each of that ticket's
--    department tasks, so historical work keeps its method where it applied.
UPDATE `TicketDepartmentTask` `t`
  JOIN `ServiceTicket` `s` ON `s`.`id` = `t`.`ticket_id`
  SET `t`.`resolution_method` = `s`.`support_type`
  WHERE `s`.`support_type` IN ('REMOTE', 'SITE_VISIT');

-- 4. Drop the old support-type column (replaced by service_location above and,
--    per department, resolution_method). site_visit_notes is retained.
ALTER TABLE `ServiceTicket` DROP COLUMN `support_type`;
