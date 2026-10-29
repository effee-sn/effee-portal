-- Flow blocks: who held an enquiry as it entered each stage, and the
-- "turn by turn" position of each Assign block.
ALTER TABLE `EnquiryStageEvent` ADD COLUMN `handler_id` INTEGER NULL;
CREATE INDEX `EnquiryStageEvent_enquiry_id_to_stage_idx` ON `EnquiryStageEvent`(`enquiry_id`, `to_stage`);

CREATE TABLE `FlowAssignState` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `flow_id` INTEGER NOT NULL,
    `node_id` VARCHAR(60) NOT NULL,
    `last_user_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FlowAssignState_flow_id_node_id_key`(`flow_id`, `node_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
