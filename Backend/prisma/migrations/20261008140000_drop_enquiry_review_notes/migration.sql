-- review_notes was superseded by the Review log (EnquiryActivity with
-- is_review = true: participants, MOM, next review). Unused and empty — drop it.
ALTER TABLE `Enquiry` DROP COLUMN `review_notes`;
