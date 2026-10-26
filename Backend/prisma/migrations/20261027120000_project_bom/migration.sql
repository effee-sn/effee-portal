-- CreateTable
CREATE TABLE `ProjectBom` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `rev` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'RELEASED', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `change_note` TEXT NULL,
    `locked_at` DATETIME(3) NULL,
    `locked_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    INDEX `ProjectBom_project_id_status_idx`(`project_id`, `status`),
    UNIQUE INDEX `ProjectBom_project_id_rev_key`(`project_id`, `rev`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectBomLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bom_id` INTEGER NOT NULL,
    `machine_id` INTEGER NOT NULL,
    `material_id` INTEGER NOT NULL,
    `child_revision_id` INTEGER NULL,
    `department_id` INTEGER NULL,
    `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 1,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProjectBomLine_machine_id_idx`(`machine_id`),
    INDEX `ProjectBomLine_material_id_idx`(`material_id`),
    INDEX `ProjectBomLine_child_revision_id_idx`(`child_revision_id`),
    INDEX `ProjectBomLine_department_id_idx`(`department_id`),
    UNIQUE INDEX `ProjectBomLine_bom_id_machine_id_material_id_key`(`bom_id`, `machine_id`, `material_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectBomItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bom_id` INTEGER NOT NULL,
    `machine_id` INTEGER NOT NULL,
    `tag` VARCHAR(255) NOT NULL,
    `parent_tag` VARCHAR(255) NULL,
    `level` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `material_id` INTEGER NOT NULL,
    `is_subassembly` BOOLEAN NOT NULL DEFAULT false,
    `revision_id` INTEGER NULL,
    `rev` VARCHAR(10) NULL,
    `imm_code` VARCHAR(40) NOT NULL,
    `item_name` VARCHAR(191) NOT NULL,
    `drawing_no` VARCHAR(100) NULL,
    `material_type` ENUM('FINISHED', 'BOUGHT_OUT', 'CONSUMABLE') NOT NULL,
    `material_text` VARCHAR(191) NOT NULL,
    `technical_spec` TEXT NULL,
    `uom` VARCHAR(20) NOT NULL,
    `dept_no` INTEGER NOT NULL,
    `department` VARCHAR(120) NULL,
    `qty_per_parent` DECIMAL(12, 3) NOT NULL,
    `quantity` DECIMAL(16, 3) NOT NULL,

    INDEX `ProjectBomItem_bom_id_machine_id_idx`(`bom_id`, `machine_id`),
    INDEX `ProjectBomItem_material_id_idx`(`material_id`),
    UNIQUE INDEX `ProjectBomItem_bom_id_tag_key`(`bom_id`, `tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectBom` ADD CONSTRAINT `ProjectBom_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectBomLine` ADD CONSTRAINT `ProjectBomLine_bom_id_fkey` FOREIGN KEY (`bom_id`) REFERENCES `ProjectBom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectBomLine` ADD CONSTRAINT `ProjectBomLine_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `ProjectMachine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectBomLine` ADD CONSTRAINT `ProjectBomLine_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `Material`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectBomLine` ADD CONSTRAINT `ProjectBomLine_child_revision_id_fkey` FOREIGN KEY (`child_revision_id`) REFERENCES `SubassemblyRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectBomLine` ADD CONSTRAINT `ProjectBomLine_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectBomItem` ADD CONSTRAINT `ProjectBomItem_bom_id_fkey` FOREIGN KEY (`bom_id`) REFERENCES `ProjectBom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectBomItem` ADD CONSTRAINT `ProjectBomItem_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `ProjectMachine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectBomItem` ADD CONSTRAINT `ProjectBomItem_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `Material`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permissions: project BOMs — BOM_VIEW / BOM_EDIT / BOM_APPROVE (lock). ("BOM"
-- was Master Data's earlier name for Subassemblies; those are SUBASSEMBLY_* now.)
INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'BOM', 'bom', 'Project BOMs', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'bom');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, `p`.`action`, `p`.`code`, CURRENT_TIMESTAMP(3)
FROM `Module` `m`
JOIN (
  SELECT 'bom' AS `slug`, 'VIEW' AS `action`, 'BOM_VIEW' AS `code`
  UNION ALL SELECT 'bom', 'EDIT', 'BOM_EDIT'
  UNION ALL SELECT 'bom', 'APPROVE', 'BOM_APPROVE'
) `p` ON `p`.`slug` = `m`.`slug`
WHERE NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = `p`.`code`);

-- Who sees projects sees their BOM; who edits projects drafts it; Admin also locks.
INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT DISTINCT `rp`.`role_id`, `bp`.`id`, true
FROM `RolePermission` `rp`
JOIN `Permission` `pp` ON `pp`.`id` = `rp`.`permission_id`
JOIN `Permission` `bp` ON (`pp`.`code` = 'PROJECT_VIEW' AND `bp`.`code` = 'BOM_VIEW') OR (`pp`.`code` = 'PROJECT_EDIT' AND `bp`.`code` = 'BOM_EDIT')
WHERE `rp`.`allowed` = true
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `rp`.`role_id` AND `x`.`permission_id` = `bp`.`id`);

INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT `r`.`id`, `p`.`id`, true
FROM `Role` `r`
JOIN `Permission` `p` ON `p`.`code` IN ('BOM_VIEW', 'BOM_EDIT', 'BOM_APPROVE')
WHERE `r`.`slug` = 'admin'
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `r`.`id` AND `x`.`permission_id` = `p`.`id`);
