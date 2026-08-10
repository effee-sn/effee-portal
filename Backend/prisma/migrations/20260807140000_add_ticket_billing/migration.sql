-- Billing classification on tickets (billable / non-billable + Tally cost centre).
ALTER TABLE `ServiceTicket` ADD COLUMN `billing_type` ENUM('BILLABLE', 'NON_BILLABLE') NULL;
ALTER TABLE `ServiceTicket` ADD COLUMN `cost_center` VARCHAR(191) NULL;
