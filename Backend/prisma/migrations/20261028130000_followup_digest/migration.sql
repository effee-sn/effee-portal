-- The daily overdue follow-ups email: one per person per day.
CREATE TABLE `FollowupDigest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FollowupDigest_user_id_day_key`(`user_id`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
