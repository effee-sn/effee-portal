-- Drop the Follow-up stage (follow-ups are activities at Offer Released).
UPDATE `Enquiry` SET `stage` = 'OFFER_RELEASED' WHERE `stage` = 'FOLLOW_UP';
UPDATE `EnquiryStageEvent` SET `from_stage` = 'OFFER_RELEASED' WHERE `from_stage` = 'FOLLOW_UP';
UPDATE `EnquiryStageEvent` SET `to_stage` = 'OFFER_RELEASED' WHERE `to_stage` = 'FOLLOW_UP';
ALTER TABLE `Enquiry`
  MODIFY COLUMN `stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'WON', 'LOST') NOT NULL DEFAULT 'NEW';
ALTER TABLE `EnquiryStageEvent`
  MODIFY COLUMN `from_stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'WON', 'LOST') NULL;
ALTER TABLE `EnquiryStageEvent`
  MODIFY COLUMN `to_stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'WON', 'LOST') NOT NULL;
