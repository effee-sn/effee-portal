-- Refurbishment enquiries skip the Concept stage (Review -> Costing).

-- AlterTable
ALTER TABLE `Enquiry` ADD COLUMN `is_refurbishment` BOOLEAN NOT NULL DEFAULT false;
