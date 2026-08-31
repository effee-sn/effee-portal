-- Stamp the enquiry stage on each activity/review (for analysis).
ALTER TABLE `EnquiryActivity` ADD COLUMN `stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'WON', 'LOST') NULL;
