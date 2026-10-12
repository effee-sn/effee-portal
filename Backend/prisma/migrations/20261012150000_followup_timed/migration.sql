-- Follow-ups with a time of day are reminded ahead of time; date-only ones in
-- the morning.

-- AlterTable
ALTER TABLE `EnquiryActivity` ADD COLUMN `follow_up_timed` BOOLEAN NOT NULL DEFAULT false;

-- Review next-dates were always entered with a time.
UPDATE `EnquiryActivity` SET `follow_up_timed` = true
WHERE `is_review` = true AND `follow_up_at` IS NOT NULL;

-- Date-only follow-ups were stored at midnight UTC (05:30 IST). Move the ones
-- still waiting to 09:00 IST (03:30 UTC) the same day, the new morning reminder.
UPDATE `EnquiryActivity`
SET `follow_up_at` = DATE_ADD(DATE(`follow_up_at`), INTERVAL 210 MINUTE)
WHERE `is_review` = false AND `follow_up_at` IS NOT NULL AND `reminded_at` IS NULL
  AND TIME(`follow_up_at`) = '00:00:00';
