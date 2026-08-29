-- D3: follow-up reminder marker. Hand-written (local MariaDB segfaults on Prisma introspection).
ALTER TABLE `EnquiryActivity` ADD COLUMN `reminded_at` DATETIME(3) NULL;
