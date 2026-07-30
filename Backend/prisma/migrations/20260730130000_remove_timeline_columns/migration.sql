-- AlterTable
ALTER TABLE `ServiceTicket` DROP COLUMN `acknowledged_at`,
    DROP COLUMN `first_response_at`,
    DROP COLUMN `machine_restore_at`;

