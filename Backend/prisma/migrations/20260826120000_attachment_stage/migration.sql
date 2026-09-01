-- Stamp the enquiry's stage on each uploaded document, so an offer version
-- added at Offer Released is distinguishable from one added during Negotiation.
ALTER TABLE `EnquiryAttachment`
  ADD COLUMN `stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'WON', 'LOST') NULL;
