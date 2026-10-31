-- Flow Builder → Publish (FLOW_PUBLISH): make a flow live, pause / resume it,
-- move current records after a change. Flow Builder → View / Create / Edit /
-- Delete already exist (view flows and run logs, build drafts, delete).
-- Given to no role: choose the one or two people in Roles (Super Admin always can).
-- The PUBLISH action must exist first (a strict-mode database refuses an unknown
-- enum value; a lenient one would silently store an empty action).
ALTER TABLE `Permission` MODIFY `action` ENUM('CREATE', 'VIEW', 'EDIT', 'DELETE', 'APPROVE', 'FINANCE', 'EXPORT', 'REASSIGN', 'PUBLISH') NOT NULL;

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'PUBLISH', 'FLOW_PUBLISH', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'flow'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'FLOW_PUBLISH');
