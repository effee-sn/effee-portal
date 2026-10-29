-- Flow approvals: an action held until approved, and who approves it.
CREATE TABLE `ApprovalRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `module` VARCHAR(30) NOT NULL,
    `flow_id` INTEGER NOT NULL,
    `version_id` INTEGER NOT NULL,
    `node_id` VARCHAR(60) NOT NULL,
    `run_id` INTEGER NULL,
    `entity_type` VARCHAR(40) NOT NULL,
    `entity_id` VARCHAR(40) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `action_key` VARCHAR(100) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `summary` TEXT NULL,
    `link` VARCHAR(200) NULL,
    `payload` TEXT NULL,
    `mode` VARCHAR(5) NOT NULL DEFAULT 'ANY',
    `status` VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    `requested_by` INTEGER NULL,
    `decided_by` INTEGER NULL,
    `decided_at` DATETIME(3) NULL,
    `comment` TEXT NULL,
    `consumed_at` DATETIME(3) NULL,
    `remind_hours` INTEGER NOT NULL DEFAULT 4,
    `escalate_hours` INTEGER NOT NULL DEFAULT 24,
    `reminded_at` DATETIME(3) NULL,
    `escalated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ApprovalRequest_entity_type_entity_id_action_key_idx`(`entity_type`, `entity_id`, `action_key`),
    INDEX `ApprovalRequest_flow_id_node_id_idx`(`flow_id`, `node_id`),
    INDEX `ApprovalRequest_status_created_at_idx`(`status`, `created_at`),
    INDEX `ApprovalRequest_requested_by_idx`(`requested_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ApprovalApprover` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `decision` VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    `comment` TEXT NULL,
    `decided_at` DATETIME(3) NULL,
    `is_escalation` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApprovalApprover_request_id_user_id_key`(`request_id`, `user_id`),
    INDEX `ApprovalApprover_user_id_decision_idx`(`user_id`, `decision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ApprovalApprover` ADD CONSTRAINT `ApprovalApprover_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `ApprovalRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
