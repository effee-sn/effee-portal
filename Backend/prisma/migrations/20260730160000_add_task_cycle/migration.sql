-- Track which reopen round a department task belongs to (0 = original,
-- 1 = after the first reopen, …). Existing tasks default to the original round.
ALTER TABLE `TicketDepartmentTask` ADD COLUMN `cycle` INTEGER NOT NULL DEFAULT 0;
