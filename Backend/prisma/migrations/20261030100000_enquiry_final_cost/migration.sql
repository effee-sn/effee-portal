-- The final costing value of an enquiry (its currency), entered from Costing
-- Review on, so each offer shows its margin. Optional.
ALTER TABLE `Enquiry` ADD COLUMN `final_cost` DECIMAL(14, 2) NULL;
