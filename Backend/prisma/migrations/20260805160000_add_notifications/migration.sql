-- In-app notifications: one row per recipient.
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `entity_type` VARCHAR(191) NULL,
    `entity_id` VARCHAR(191) NULL,
    `link` VARCHAR(191) NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_user_id_read_at_idx`(`user_id`, `read_at`),
    INDEX `Notification_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
