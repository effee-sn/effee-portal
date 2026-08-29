-- Increment B: follow-up fields on the enquiry activity trail.
-- Hand-written (local MariaDB segfaults on Prisma's live-DB introspection).

ALTER TABLE `EnquiryActivity`
  ADD COLUMN `next_medium` ENUM('CALL', 'MEETING', 'TEAMS', 'SITE_VISIT', 'EMAIL') NULL,
  ADD COLUMN `temperature` ENUM('HOT', 'WARM', 'COLD') NULL,
  ADD COLUMN `follow_up_ended` BOOLEAN NOT NULL DEFAULT false;
