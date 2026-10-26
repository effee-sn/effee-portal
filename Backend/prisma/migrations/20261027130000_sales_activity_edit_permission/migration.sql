-- Sales activity → Edit (SALES_ACTIVITY_EDIT): edit the activities and reviews
-- you logged yourself (never anyone else's). Given to every role that can view
-- Sales, so nothing changes until an administrator takes it away in Roles.
INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'SALES_ACTIVITY', 'sales-activity', 'Sales — edit the activities and reviews you logged', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'sales-activity');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'EDIT', 'SALES_ACTIVITY_EDIT', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'sales-activity'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'SALES_ACTIVITY_EDIT');

INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT `rp`.`role_id`, `ap`.`id`, true
FROM `RolePermission` `rp`
JOIN `Permission` `vp` ON `vp`.`id` = `rp`.`permission_id` AND `vp`.`code` = 'SALES_VIEW'
JOIN `Permission` `ap` ON `ap`.`code` = 'SALES_ACTIVITY_EDIT'
WHERE `rp`.`allowed` = true
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `rp`.`role_id` AND `x`.`permission_id` = `ap`.`id`);
