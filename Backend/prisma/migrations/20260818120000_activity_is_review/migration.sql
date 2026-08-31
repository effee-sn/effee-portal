-- is_review flag on the enquiry activity trail (internal review entries).
ALTER TABLE `EnquiryActivity` ADD COLUMN `is_review` BOOLEAN NOT NULL DEFAULT false;
