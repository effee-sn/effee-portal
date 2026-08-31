-- Richer close-out data: a Won order captures a declaration and agreed terms &
-- conditions; a Lost deal captures who it went to.
ALTER TABLE `Enquiry`
  ADD COLUMN `won_declaration` TEXT NULL,
  ADD COLUMN `won_terms` TEXT NULL,
  ADD COLUMN `lost_to` VARCHAR(191) NULL;
