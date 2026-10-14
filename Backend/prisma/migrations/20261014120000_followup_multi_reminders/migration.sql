-- Several reminders per follow-up (e.g. a site visit 24 h, 3 h and 15 min
-- before), with the timings set per kind in Sales → Configuration.

-- AlterTable
ALTER TABLE `EnquiryActivity`
  ADD COLUMN `reminder_offset_sent` INTEGER NULL,
  ADD COLUMN `reminders_armed_at` DATETIME(3) NULL;

-- Follow-ups already scheduled count as armed now, so the deploy itself never
-- sends a burst of early reminders whose time has already passed.
UPDATE `EnquiryActivity` SET `reminders_armed_at` = CURRENT_TIMESTAMP(3)
WHERE `follow_up_at` IS NOT NULL AND `reminded_at` IS NULL;

-- CreateTable
CREATE TABLE `SalesReminderSchedule` (
    `kind` VARCHAR(20) NOT NULL,
    `offsets` VARCHAR(100) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` INTEGER NULL,

    PRIMARY KEY (`kind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
