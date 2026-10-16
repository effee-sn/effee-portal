-- Reassigning an enquiry (owner / handler) gets its own permission,
-- SALES_REASSIGN, granted per role in Administrator -> Roles.

-- AlterTable
ALTER TABLE `Permission` MODIFY `action` ENUM('CREATE', 'VIEW', 'EDIT', 'DELETE', 'APPROVE', 'FINANCE', 'EXPORT', 'REASSIGN') NOT NULL;

-- The permission row (the seed would add it too; this way no re-seed is needed).
INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'REASSIGN', 'SALES_REASSIGN', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'sales'
  AND NOT EXISTS (SELECT 1 FROM `Permission` WHERE `code` = 'SALES_REASSIGN');
