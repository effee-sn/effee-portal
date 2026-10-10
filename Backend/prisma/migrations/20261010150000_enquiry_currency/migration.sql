-- Currency on enquiries, and a default currency for new records.

-- AlterTable
ALTER TABLE `Currency` ADD COLUMN `is_default` BOOLEAN NOT NULL DEFAULT false;
UPDATE `Currency` SET `is_default` = true WHERE `code` = 'INR';

-- AlterTable
ALTER TABLE `Enquiry`
    ADD COLUMN `currency_code` VARCHAR(3) NOT NULL DEFAULT 'INR',
    ADD COLUMN `order_fx_rate` DECIMAL(18, 6) NULL;

-- Existing won orders were recorded in rupees.
UPDATE `Enquiry` SET `order_fx_rate` = 1 WHERE `stage` = 'WON';

-- CreateIndex
CREATE INDEX `Enquiry_currency_code_idx` ON `Enquiry`(`currency_code`);

-- AddForeignKey
ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `Currency`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;
