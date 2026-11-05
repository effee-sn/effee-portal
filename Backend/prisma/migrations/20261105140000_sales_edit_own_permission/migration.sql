-- Two levels of Sales edit access, like View / View own:
--   Sales own → Edit (SALES_EDIT_OWN): your own enquiries, while they are with
--     you — what Sales → Edit allowed until now;
--   Sales → Edit (SALES_EDIT): edit all — any open enquiry's details,
--     documents and offer prices, whoever raised or holds it.
-- Every role that had Sales → Edit moves to Sales own → Edit, so nobody gains
-- access by this update; an administrator gives Sales → Edit in Roles.
UPDATE `Module` SET `description` = 'Sales — only your own enquiries' WHERE `slug` = 'sales-own';

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'EDIT', 'SALES_EDIT_OWN', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'sales-own'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'SALES_EDIT_OWN');

INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT `rp`.`role_id`, `own`.`id`, true
FROM `RolePermission` `rp`
JOIN `Permission` `all` ON `all`.`id` = `rp`.`permission_id` AND `all`.`code` = 'SALES_EDIT'
JOIN `Permission` `own` ON `own`.`code` = 'SALES_EDIT_OWN'
WHERE `rp`.`allowed` = true
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `rp`.`role_id` AND `x`.`permission_id` = `own`.`id`);

UPDATE `RolePermission` `rp`
JOIN `Permission` `all` ON `all`.`id` = `rp`.`permission_id` AND `all`.`code` = 'SALES_EDIT'
SET `rp`.`allowed` = false
WHERE `rp`.`allowed` = true;
