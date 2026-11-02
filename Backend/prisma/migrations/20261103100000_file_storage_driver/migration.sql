-- Where uploaded files are kept: LOCAL (server folders) or BLOB (Azure Blob
-- Storage), and the progress of the last transfer between them.
ALTER TABLE `CompanySettings` ADD COLUMN `storage_driver` VARCHAR(10) NOT NULL DEFAULT 'LOCAL';
ALTER TABLE `CompanySettings` ADD COLUMN `storage_transfer` TEXT NULL;
