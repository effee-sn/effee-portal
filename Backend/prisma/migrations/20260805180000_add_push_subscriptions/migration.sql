-- Web Push subscriptions: one row per browser/device that opted in.
CREATE TABLE `PushSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` TEXT NOT NULL,
    `auth` TEXT NOT NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`),
    INDEX `PushSubscription_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
