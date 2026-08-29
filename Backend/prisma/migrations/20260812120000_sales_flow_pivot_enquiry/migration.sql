-- Sales flow pivot (Increment A): enquiry type + revised stages.
-- Hand-written because the local MariaDB segfaults on Prisma's live-DB
-- introspection; the changes are enum/column-only. Keeps the DB in step with
-- schema.prisma.

-- Drop the old origin field (replaced by enquiry_type; medium now lives on the
-- activity trail).
ALTER TABLE `Enquiry` DROP COLUMN `source`;

-- New origin classification: field-sales-generated vs inbound.
ALTER TABLE `Enquiry`
  ADD COLUMN `enquiry_type` ENUM('GENERATED', 'INCOMING') NOT NULL DEFAULT 'INCOMING';

-- Latest follow-up temperature, denormalised onto the enquiry.
ALTER TABLE `Enquiry`
  ADD COLUMN `current_temperature` ENUM('HOT', 'WARM', 'COLD') NULL;

-- Revised pipeline stages. Round-trip through VARCHAR so existing rows on the
-- old stage names are remapped rather than coerced to an empty enum value.
ALTER TABLE `Enquiry` MODIFY COLUMN `stage` VARCHAR(20) NOT NULL;

UPDATE `Enquiry` SET `stage` = CASE `stage`
  WHEN 'QUALIFIED'   THEN 'REVIEW'
  WHEN 'QUOTATION'   THEN 'OFFER_RELEASED'
  WHEN 'NEGOTIATION' THEN 'FOLLOW_UP'
  WHEN 'ON_HOLD'     THEN 'REVIEW'
  ELSE `stage`
END;

ALTER TABLE `Enquiry`
  MODIFY COLUMN `stage` ENUM('NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'OFFER_RELEASED', 'FOLLOW_UP', 'WON', 'LOST') NOT NULL DEFAULT 'NEW';

-- Index the new filter column.
CREATE INDEX `Enquiry_enquiry_type_idx` ON `Enquiry`(`enquiry_type`);
