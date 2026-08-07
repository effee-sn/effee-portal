-- Reply threading for ticket comments (self-relation).
ALTER TABLE `TicketComment` ADD COLUMN `parent_id` INTEGER NULL;

CREATE INDEX `TicketComment_parent_id_idx` ON `TicketComment`(`parent_id`);

ALTER TABLE `TicketComment` ADD CONSTRAINT `TicketComment_parent_id_fkey`
    FOREIGN KEY (`parent_id`) REFERENCES `TicketComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
