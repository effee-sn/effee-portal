-- Issues (the issue logger): anyone raises a question, request or problem for a
-- person or a department, from the record they are on; it is worked on in its
-- own conversation and closed by whoever raised it. Raising and working on your
-- own issues needs no permission. Issues → View sees every issue; Issues → Edit
-- manages any of them (reassign, close, cancel) — given to no role.

-- CreateTable
CREATE TABLE `Issue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ref_no` VARCHAR(20) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `priority` VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `due_date` DATE NULL,
    `module` VARCHAR(40) NULL,
    `entity_type` VARCHAR(40) NULL,
    `entity_id` VARCHAR(40) NULL,
    `entity_label` VARCHAR(255) NULL,
    `page_url` VARCHAR(500) NULL,
    `raised_by_id` INTEGER NOT NULL,
    `assignee_id` INTEGER NULL,
    `department_id` INTEGER NULL,
    `assigned_at` DATETIME(3) NULL,
    `resolution` TEXT NULL,
    `resolved_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `reopened_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Issue_ref_no_key`(`ref_no`),
    INDEX `Issue_status_idx`(`status`),
    INDEX `Issue_assignee_id_status_idx`(`assignee_id`, `status`),
    INDEX `Issue_department_id_status_idx`(`department_id`, `status`),
    INDEX `Issue_raised_by_id_status_idx`(`raised_by_id`, `status`),
    INDEX `Issue_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `Issue_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IssueWatcher` (
    `issue_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IssueWatcher_user_id_idx`(`user_id`),
    PRIMARY KEY (`issue_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IssueComment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issue_id` INTEGER NOT NULL,
    `author_id` INTEGER NULL,
    `kind` VARCHAR(10) NOT NULL DEFAULT 'COMMENT',
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IssueComment_issue_id_created_at_idx`(`issue_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IssueFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issue_id` INTEGER NOT NULL,
    `comment_id` INTEGER NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(150) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IssueFile_issue_id_idx`(`issue_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_raised_by_id_fkey` FOREIGN KEY (`raised_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_assignee_id_fkey` FOREIGN KEY (`assignee_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueWatcher` ADD CONSTRAINT `IssueWatcher_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueWatcher` ADD CONSTRAINT `IssueWatcher_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueComment` ADD CONSTRAINT `IssueComment_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueComment` ADD CONSTRAINT `IssueComment_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueFile` ADD CONSTRAINT `IssueFile_issue_id_fkey` FOREIGN KEY (`issue_id`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueFile` ADD CONSTRAINT `IssueFile_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `IssueComment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'ISSUE', 'issue', 'Issues — see and manage all issues', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'issue');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'VIEW', 'ISSUE_VIEW', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'issue'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'ISSUE_VIEW');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'EDIT', 'ISSUE_EDIT', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'issue'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'ISSUE_EDIT');
