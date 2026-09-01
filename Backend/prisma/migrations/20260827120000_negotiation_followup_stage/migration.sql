-- Add a distinct Negotiation Follow-up stage: sending a revised offer during
-- Negotiation moves forward to its own follow-up (not back to the Offer
-- Released follow-up), and from there ticking "needs negotiation" loops back to
-- Negotiation for another round.
ALTER TABLE `Enquiry`
  MODIFY COLUMN `stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST') NOT NULL DEFAULT 'NEW';
ALTER TABLE `EnquiryStageEvent`
  MODIFY COLUMN `from_stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST') NULL;
ALTER TABLE `EnquiryStageEvent`
  MODIFY COLUMN `to_stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST') NOT NULL;
ALTER TABLE `EnquiryActivity`
  MODIFY COLUMN `stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST') NULL;
ALTER TABLE `EnquiryAttachment`
  MODIFY COLUMN `stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST') NULL;
