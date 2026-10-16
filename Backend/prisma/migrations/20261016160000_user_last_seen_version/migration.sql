-- The newest release whose "What's new" each user has seen. Existing users
-- start empty, so they see the next release's notes once.

-- AlterTable
ALTER TABLE `User` ADD COLUMN `last_seen_version` VARCHAR(20) NULL;
