-- One waiting request per flow block + action: set while PENDING, cleared when decided.
ALTER TABLE `ApprovalRequest` ADD COLUMN `open_key` VARCHAR(64) NULL;
CREATE UNIQUE INDEX `ApprovalRequest_open_key_key` ON `ApprovalRequest`(`open_key`);
