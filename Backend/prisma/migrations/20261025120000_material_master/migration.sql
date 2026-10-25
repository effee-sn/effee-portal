-- Material master (Master Data → Materials) and its IMM code prefixes
-- (Administrator → Material Codes), plus their permissions.

-- CreateTable
CREATE TABLE `ImmPrefix` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prefix` VARCHAR(20) NOT NULL,
    `separator` VARCHAR(1) NOT NULL DEFAULT '',
    `digits` INTEGER NOT NULL DEFAULT 5,
    `next_number` INTEGER NOT NULL DEFAULT 1,
    `description` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `ImmPrefix_prefix_key`(`prefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Material` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `imm_code` VARCHAR(40) NOT NULL,
    `prefix_id` INTEGER NOT NULL,
    `drawing_no` VARCHAR(100) NULL,
    `item_name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `technical_spec` TEXT NOT NULL,
    `material_type` ENUM('FINISHED', 'BOUGHT_OUT', 'CONSUMABLE') NOT NULL,
    `material` VARCHAR(191) NOT NULL,
    `remarks` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `Material_imm_code_key`(`imm_code`),
    INDEX `Material_prefix_id_idx`(`prefix_id`),
    INDEX `Material_item_name_idx`(`item_name`),
    INDEX `Material_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_prefix_id_fkey` FOREIGN KEY (`prefix_id`) REFERENCES `ImmPrefix`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions: Materials (MATERIAL_*) and their code settings (MATERIAL_CONFIG_*).
INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'MATERIAL', 'material', 'Master data — materials', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'material');

INSERT INTO `Module` (`name`, `slug`, `description`, `created_at`, `updated_at`)
SELECT 'MATERIAL_CONFIG', 'material-config', 'Material code prefixes and numbering', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `Module` WHERE `slug` = 'material-config');

INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, `p`.`action`, `p`.`code`, CURRENT_TIMESTAMP(3)
FROM `Module` `m`
JOIN (
  SELECT 'material' AS `slug`, 'VIEW' AS `action`, 'MATERIAL_VIEW' AS `code`
  UNION ALL SELECT 'material', 'CREATE', 'MATERIAL_CREATE'
  UNION ALL SELECT 'material', 'EDIT', 'MATERIAL_EDIT'
  UNION ALL SELECT 'material', 'DELETE', 'MATERIAL_DELETE'
  UNION ALL SELECT 'material-config', 'VIEW', 'MATERIAL_CONFIG_VIEW'
  UNION ALL SELECT 'material-config', 'CREATE', 'MATERIAL_CONFIG_CREATE'
  UNION ALL SELECT 'material-config', 'EDIT', 'MATERIAL_CONFIG_EDIT'
  UNION ALL SELECT 'material-config', 'DELETE', 'MATERIAL_CONFIG_DELETE'
) `p` ON `p`.`slug` = `m`.`slug`
WHERE NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = `p`.`code`);
