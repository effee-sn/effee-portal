-- Each user's screen theme: LIGHT, DARK or SYSTEM (follow the device).

-- AlterTable
ALTER TABLE `User` ADD COLUMN `theme` VARCHAR(10) NOT NULL DEFAULT 'SYSTEM';
