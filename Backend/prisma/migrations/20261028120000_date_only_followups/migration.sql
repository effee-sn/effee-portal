-- A follow-up given a date but no time was saved as "timed" at midnight UTC
-- (05:30 IST) since 12 Oct 2026: the date-only check never matched. Such
-- entries become date-only again, stored at the morning reminder time (09:00
-- Asia/Kolkata = 03:30 UTC, the defaults of FOLLOWUP_REMINDER_DAY_TIME and
-- APP_TIMEZONE). Future ones get their morning reminder re-armed; past ones
-- are left as reminded.
UPDATE `EnquiryActivity`
SET `reminded_at` = NULL, `reminder_offset_sent` = NULL, `reminders_armed_at` = CURRENT_TIMESTAMP(3)
WHERE `follow_up_timed` = true AND TIME(`follow_up_at`) = '00:00:00'
  AND `follow_up_at` > CURRENT_TIMESTAMP(3) AND `deleted_at` IS NULL;

UPDATE `EnquiryActivity`
SET `follow_up_timed` = false,
    `follow_up_at` = TIMESTAMPADD(MINUTE, 210, DATE(`follow_up_at`))
WHERE `follow_up_timed` = true AND TIME(`follow_up_at`) = '00:00:00' AND `deleted_at` IS NULL;
