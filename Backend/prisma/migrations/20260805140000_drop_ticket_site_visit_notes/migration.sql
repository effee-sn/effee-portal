-- Remove the ticket-level findings box. Site findings are now captured per
-- department, in each department task's resolution plan / work report — the
-- single ticket-level field is redundant in the multi-department model.
ALTER TABLE `ServiceTicket` DROP COLUMN `site_visit_notes`;
