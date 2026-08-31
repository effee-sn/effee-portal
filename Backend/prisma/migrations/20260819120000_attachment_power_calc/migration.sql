-- Add POWER_CALC document kind (costing & power source calculation, Excel).
ALTER TABLE `EnquiryAttachment` MODIFY COLUMN `kind` ENUM('FORMAT_PDF', 'FORMAT_EXCEL', 'CONCEPT', 'POWER_CALC', 'COSTING', 'OFFER') NOT NULL;
