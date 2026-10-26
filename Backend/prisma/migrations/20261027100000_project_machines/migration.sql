-- Department numbers (for project tag numbers).
ALTER TABLE `Department` ADD COLUMN `dept_no` INTEGER NULL;
CREATE INDEX `Department_dept_no_idx` ON `Department`(`dept_no`);

-- The department a subassembly comes from.
ALTER TABLE `Subassembly` ADD COLUMN `department_id` INTEGER NULL;
CREATE INDEX `Subassembly_department_id_idx` ON `Subassembly`(`department_id`);
ALTER TABLE `Subassembly` ADD CONSTRAINT `Subassembly_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Machine ID numbering.
ALTER TABLE `CompanySettings`
    ADD COLUMN `machine_prefix` VARCHAR(20) NOT NULL DEFAULT 'M',
    ADD COLUMN `machine_separator` VARCHAR(1) NOT NULL DEFAULT '',
    ADD COLUMN `machine_digits` INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN `machine_next` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `ProjectMachine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `machine_no` VARCHAR(40) NOT NULL,
    `name` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `ProjectMachine_machine_no_key`(`machine_no`),
    INDEX `ProjectMachine_project_id_idx`(`project_id`),
    INDEX `ProjectMachine_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProjectMachine` ADD CONSTRAINT `ProjectMachine_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions: project settings (Machine ID numbering) — PROJECT_CONFIG_VIEW / EDIT,
-- given to the built-in Admin role (Super Admin has everything).
INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'PROJECT_CONFIG', 'project-config', 'Project settings (Machine ID numbering)', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'project-config');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, `p`.`action`, `p`.`code`, CURRENT_TIMESTAMP(3)
FROM `Module` `m`
JOIN (
  SELECT 'project-config' AS `slug`, 'VIEW' AS `action`, 'PROJECT_CONFIG_VIEW' AS `code`
  UNION ALL SELECT 'project-config', 'EDIT', 'PROJECT_CONFIG_EDIT'
) `p` ON `p`.`slug` = `m`.`slug`
WHERE NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = `p`.`code`);

INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT `r`.`id`, `p`.`id`, true
FROM `Role` `r`
JOIN `Permission` `p` ON `p`.`code` IN ('PROJECT_CONFIG_VIEW', 'PROJECT_CONFIG_EDIT')
WHERE `r`.`slug` = 'admin'
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `r`.`id` AND `x`.`permission_id` = `p`.`id`);
