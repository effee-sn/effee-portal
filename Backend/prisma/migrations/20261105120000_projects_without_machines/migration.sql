-- Projects become simple for now: no machines, Machine ID numbering, project
-- BOMs or tags (to be redesigned later). A project gets its cost, entered on
-- the project. Department codes stay (Configuration → Department Codes).

-- Project BOMs and their tags (dependants first).
DROP TABLE `ProjectBomItem`;
DROP TABLE `ProjectBomLine`;
DROP TABLE `ProjectBom`;
DROP TABLE `ProjectMachine`;

-- Machine ID numbering.
ALTER TABLE `CompanySettings`
    DROP COLUMN `machine_prefix`,
    DROP COLUMN `machine_separator`,
    DROP COLUMN `machine_digits`,
    DROP COLUMN `machine_next`;

-- The BOM permissions (Project Config → View / Edit stay: Department Codes uses them).
DELETE `rp` FROM `RolePermission` `rp` JOIN `Permission` `p` ON `p`.`id` = `rp`.`permission_id` WHERE `p`.`code` IN ('BOM_VIEW', 'BOM_EDIT', 'BOM_APPROVE');
DELETE FROM `Permission` WHERE `code` IN ('BOM_VIEW', 'BOM_EDIT', 'BOM_APPROVE');
DELETE `m` FROM `Module` `m` WHERE `m`.`slug` = 'bom' AND NOT EXISTS (SELECT 1 FROM `Permission` `p` WHERE `p`.`module_id` = `m`.`id`);

-- The project cost.
ALTER TABLE `Project`
    ADD COLUMN `cost` DECIMAL(14, 2) NULL,
    ADD COLUMN `cost_currency` VARCHAR(3) NOT NULL DEFAULT 'INR';
