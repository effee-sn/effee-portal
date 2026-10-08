-- Marker for the stage-aging reminder: set when the "stuck in this stage"
-- reminder fires, so it is sent once per stage rather than on every sweep.
ALTER TABLE `Enquiry` ADD COLUMN `aging_reminded_at` DATETIME(3) NULL;
