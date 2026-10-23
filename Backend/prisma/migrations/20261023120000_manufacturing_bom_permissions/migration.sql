-- Manufacturing: the BOM (bill of materials) permission module and its
-- VIEW / CREATE / EDIT / DELETE permissions. The seed defines them too; this
-- way an existing database gets them without re-running the seed.

INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'BOM', 'bom', 'Manufacturing — bills of materials', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'bom');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, `p`.`action`, `p`.`code`, CURRENT_TIMESTAMP(3)
FROM `Module` `m`
JOIN (
  SELECT 'VIEW' AS `action`, 'BOM_VIEW' AS `code`
  UNION ALL SELECT 'CREATE', 'BOM_CREATE'
  UNION ALL SELECT 'EDIT', 'BOM_EDIT'
  UNION ALL SELECT 'DELETE', 'BOM_DELETE'
) `p`
WHERE `m`.`slug` = 'bom'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = `p`.`code`);
