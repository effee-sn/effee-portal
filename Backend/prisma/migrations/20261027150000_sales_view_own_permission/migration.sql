-- Sales own → View (SALES_VIEW_OWN): see only your own enquiries — ones you
-- raised, own, or that are with you now in the flow. Sales → View still shows
-- all of them. Given to no role here: an administrator chooses it in Roles
-- (typically instead of Sales → View for field sales).
INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'SALES_OWN', 'sales-own', 'Sales — see only your own enquiries', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'sales-own');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'VIEW', 'SALES_VIEW_OWN', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'sales-own'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'SALES_VIEW_OWN');
