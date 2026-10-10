-- Offer price on each offer revision, with the rupee rate locked when sent.

-- AlterTable
ALTER TABLE `EnquiryAttachment`
    ADD COLUMN `offer_value` DECIMAL(14, 2) NULL,
    ADD COLUMN `offer_fx_rate` DECIMAL(18, 6) NULL;
