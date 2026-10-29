-- Flow engine: flows, their published versions, the event outbox, runs and steps.
CREATE TABLE `FlowDefinition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `module` VARCHAR(30) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    `draft_graph` LONGTEXT NULL,
    `live_version_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    INDEX `FlowDefinition_module_status_idx`(`module`, `status`),
    INDEX `FlowDefinition_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FlowVersion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `flow_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `graph` LONGTEXT NOT NULL,
    `trigger` VARCHAR(60) NOT NULL,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `published_by` INTEGER NULL,

    UNIQUE INDEX `FlowVersion_flow_id_version_key`(`flow_id`, `version`),
    INDEX `FlowVersion_trigger_idx`(`trigger`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FlowEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `module` VARCHAR(30) NOT NULL,
    `type` VARCHAR(60) NOT NULL,
    `entity_type` VARCHAR(40) NOT NULL,
    `entity_id` VARCHAR(40) NOT NULL,
    `payload` TEXT NULL,
    `actor_id` INTEGER NULL,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `origin_flow_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimed_at` DATETIME(3) NULL,
    `processed_at` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,

    INDEX `FlowEvent_processed_at_id_idx`(`processed_at`, `id`),
    INDEX `FlowEvent_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FlowRun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `flow_id` INTEGER NOT NULL,
    `version_id` INTEGER NOT NULL,
    `event_id` INTEGER NULL,
    `trigger` VARCHAR(60) NOT NULL,
    `entity_type` VARCHAR(40) NOT NULL,
    `entity_id` VARCHAR(40) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'RUNNING',
    `error` TEXT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,

    UNIQUE INDEX `FlowRun_flow_id_event_id_key`(`flow_id`, `event_id`),
    INDEX `FlowRun_flow_id_started_at_idx`(`flow_id`, `started_at`),
    INDEX `FlowRun_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FlowRunStep` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `run_id` INTEGER NOT NULL,
    `node_id` VARCHAR(60) NOT NULL,
    `node_type` VARCHAR(30) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `output` TEXT NULL,
    `error` TEXT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,

    INDEX `FlowRunStep_run_id_idx`(`run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FlowVersion` ADD CONSTRAINT `FlowVersion_flow_id_fkey` FOREIGN KEY (`flow_id`) REFERENCES `FlowDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FlowRun` ADD CONSTRAINT `FlowRun_flow_id_fkey` FOREIGN KEY (`flow_id`) REFERENCES `FlowDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FlowRun` ADD CONSTRAINT `FlowRun_version_id_fkey` FOREIGN KEY (`version_id`) REFERENCES `FlowVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FlowRunStep` ADD CONSTRAINT `FlowRunStep_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `FlowRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
