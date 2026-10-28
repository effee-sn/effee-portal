-- Sales → Follow-ups (the follow-ups page):
--   Follow-ups → View      (SALES_FOLLOWUP_VIEW)      everyone's follow-ups;
--   Follow-ups own → View  (SALES_FOLLOWUP_VIEW_OWN)  only the ones you added.
-- Given to the roles that see all enquiries / only their own now, so the page
-- opens for the same people (change it per role in Roles).
INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'SALES_FOLLOWUP', 'sales-followup', 'Sales — follow-ups of everyone', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'sales-followup');

INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'SALES_FOLLOWUP_OWN', 'sales-followup-own', 'Sales — only the follow-ups you added', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'sales-followup-own');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'VIEW', 'SALES_FOLLOWUP_VIEW', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'sales-followup'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'SALES_FOLLOWUP_VIEW');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'VIEW', 'SALES_FOLLOWUP_VIEW_OWN', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'sales-followup-own'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'SALES_FOLLOWUP_VIEW_OWN');

INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT `rp`.`role_id`, `np`.`id`, true
FROM `RolePermission` `rp`
JOIN `Permission` `sp` ON `sp`.`id` = `rp`.`permission_id` AND `sp`.`code` = 'SALES_VIEW'
JOIN `Permission` `np` ON `np`.`code` = 'SALES_FOLLOWUP_VIEW'
WHERE `rp`.`allowed` = true
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `rp`.`role_id` AND `x`.`permission_id` = `np`.`id`);

INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT `rp`.`role_id`, `np`.`id`, true
FROM `RolePermission` `rp`
JOIN `Permission` `sp` ON `sp`.`id` = `rp`.`permission_id` AND `sp`.`code` = 'SALES_VIEW_OWN'
JOIN `Permission` `np` ON `np`.`code` = 'SALES_FOLLOWUP_VIEW_OWN'
WHERE `rp`.`allowed` = true
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `rp`.`role_id` AND `x`.`permission_id` = `np`.`id`);
