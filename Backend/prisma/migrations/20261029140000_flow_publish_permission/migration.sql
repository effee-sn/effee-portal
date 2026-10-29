-- Flow Builder → Publish (FLOW_PUBLISH): make a flow live, pause / resume it,
-- move current records after a change. Flow Builder → View / Create / Edit /
-- Delete already exist (view flows and run logs, build drafts, delete).
-- Given to no role: choose the one or two people in Roles (Super Admin always can).
INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'PUBLISH', 'FLOW_PUBLISH', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'flow'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'FLOW_PUBLISH');
