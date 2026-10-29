-- Department queue: an enquiry sent to a department waits for its head to
-- assign it to a member (the head holds it meanwhile).
ALTER TABLE `Enquiry` ADD COLUMN `queue_department_id` INTEGER NULL,
    ADD COLUMN `queued_at` DATETIME(3) NULL,
    ADD COLUMN `queue_reminded_at` DATETIME(3) NULL;

CREATE INDEX `Enquiry_queue_department_id_idx` ON `Enquiry`(`queue_department_id`);

ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_queue_department_id_fkey` FOREIGN KEY (`queue_department_id`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
