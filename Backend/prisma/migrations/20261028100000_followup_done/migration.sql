-- A follow-up is done once it has been acted on (see EnquiryActivity.follow_up_done_*).
ALTER TABLE `EnquiryActivity`
    ADD COLUMN `follow_up_done_at` DATETIME(3) NULL,
    ADD COLUMN `follow_up_done_by` INTEGER NULL,
    ADD COLUMN `follow_up_done_activity_id` INTEGER NULL,
    ADD COLUMN `follow_up_done_reason` VARCHAR(20) NULL,
    ADD COLUMN `follow_up_done_note` TEXT NULL;

-- Existing follow-ups the same person has since followed up (a later entry of
-- theirs on the same enquiry; reviews and customer interactions apart) are done
-- by that entry, at its time.
CREATE TEMPORARY TABLE `_followup_done` AS
SELECT `f`.`id` AS `fid`,
       (SELECT `n`.`id` FROM `EnquiryActivity` `n`
         WHERE `n`.`enquiry_id` = `f`.`enquiry_id`
           AND `n`.`created_by` <=> `f`.`created_by`
           AND `n`.`is_review` = `f`.`is_review`
           AND `n`.`deleted_at` IS NULL
           AND (`n`.`activity_at` > `f`.`activity_at` OR (`n`.`activity_at` = `f`.`activity_at` AND `n`.`id` > `f`.`id`))
         ORDER BY `n`.`activity_at`, `n`.`id`
         LIMIT 1) AS `nid`
FROM `EnquiryActivity` `f`
WHERE `f`.`deleted_at` IS NULL AND `f`.`follow_up_at` IS NOT NULL AND `f`.`follow_up_ended` = false;

UPDATE `EnquiryActivity` `f`
JOIN `_followup_done` `x` ON `x`.`fid` = `f`.`id`
JOIN `EnquiryActivity` `n` ON `n`.`id` = `x`.`nid`
SET `f`.`follow_up_done_at` = `n`.`activity_at`,
    `f`.`follow_up_done_by` = `n`.`created_by`,
    `f`.`follow_up_done_activity_id` = `n`.`id`,
    `f`.`follow_up_done_reason` = 'FOLLOWED_UP';

DROP TEMPORARY TABLE `_followup_done`;

-- Follow-ups still open on enquiries already won or lost are closed with them.
UPDATE `EnquiryActivity` `a`
JOIN `Enquiry` `e` ON `e`.`id` = `a`.`enquiry_id`
SET `a`.`follow_up_done_at` = COALESCE(`e`.`won_at`, `e`.`lost_at`, CURRENT_TIMESTAMP(3)),
    `a`.`follow_up_done_reason` = 'CLOSED'
WHERE `a`.`deleted_at` IS NULL AND `a`.`follow_up_at` IS NOT NULL AND `a`.`follow_up_ended` = false
  AND `a`.`follow_up_done_at` IS NULL AND `e`.`stage` IN ('WON', 'LOST');
