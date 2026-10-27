-- The first release of a drawing (Administrator → Configuration → Revisions):
-- ORIGINAL = just the drawing no., labelled "Original"; the first change is Rev A / 01.
ALTER TABLE `CompanySettings`
    ADD COLUMN `revision_first_release` VARCHAR(10) NOT NULL DEFAULT 'ORIGINAL',
    ADD COLUMN `revision_original_label` VARCHAR(10) NOT NULL DEFAULT 'Original';

-- Existing subassembly revisions follow that rule: the first release becomes
-- "Original" and each later one moves down a letter (B → A) or number (01 stays 01).
UPDATE `SubassemblyRevision` `r`
SET `r`.`rev` = CASE
    WHEN `r`.`seq` = 1 THEN 'Original'
    WHEN (SELECT `s`.`revision_scheme` FROM `CompanySettings` `s` ORDER BY `s`.`id` LIMIT 1) = 'NUMBERS' THEN LPAD(`r`.`seq` - 1, 2, '0')
    WHEN `r`.`seq` - 1 <= 26 THEN CHAR(64 + `r`.`seq` - 1)
    ELSE CONCAT(CHAR(64 + FLOOR((`r`.`seq` - 2) / 26)), CHAR(65 + MOD(`r`.`seq` - 2, 26)))
END;

UPDATE `ProjectBomItem` `i`
JOIN `SubassemblyRevision` `r` ON `r`.`id` = `i`.`revision_id`
SET `i`.`rev` = `r`.`rev`
WHERE `i`.`is_subassembly` = true;

-- CreateTable
CREATE TABLE `MaterialRevision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `material_id` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `rev` VARCHAR(10) NOT NULL,
    `status` ENUM('DRAFT', 'RELEASED', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `change_note` TEXT NULL,
    `description` TEXT NOT NULL,
    `technical_spec` TEXT NOT NULL,
    `material_text` VARCHAR(191) NOT NULL,
    `released_at` DATETIME(3) NULL,
    `released_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `MaterialRevision_material_id_seq_key`(`material_id`, `seq`),
    INDEX `MaterialRevision_material_id_status_idx`(`material_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MaterialRevision` ADD CONSTRAINT `MaterialRevision_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `Material`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing Finished part (not a subassembly's item) gets its Original, released, as it is now.
INSERT INTO `MaterialRevision` (`material_id`, `seq`, `rev`, `status`, `change_note`, `description`, `technical_spec`, `material_text`, `released_at`, `released_by`, `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT `m`.`id`, 1, 'Original', 'RELEASED', 'First release', `m`.`description`, `m`.`technical_spec`, `m`.`material`, `m`.`created_at`, `m`.`created_by`, `m`.`created_at`, CURRENT_TIMESTAMP(3), `m`.`created_by`, `m`.`created_by`
FROM `Material` `m`
WHERE `m`.`material_type` = 'FINISHED'
  AND `m`.`deleted_at` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `Subassembly` `s` WHERE `s`.`material_id` = `m`.`id`);

-- Lines hold a Finished part at a drawing revision: existing ones at its Original.
ALTER TABLE `SubassemblyItem` ADD COLUMN `part_revision_id` INTEGER NULL;
CREATE INDEX `SubassemblyItem_part_revision_id_idx` ON `SubassemblyItem`(`part_revision_id`);
ALTER TABLE `SubassemblyItem` ADD CONSTRAINT `SubassemblyItem_part_revision_id_fkey` FOREIGN KEY (`part_revision_id`) REFERENCES `MaterialRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE `SubassemblyItem` `i`
JOIN `MaterialRevision` `mr` ON `mr`.`material_id` = `i`.`material_id` AND `mr`.`seq` = 1
SET `i`.`part_revision_id` = `mr`.`id`;

ALTER TABLE `ProjectBomLine` ADD COLUMN `part_revision_id` INTEGER NULL;
CREATE INDEX `ProjectBomLine_part_revision_id_idx` ON `ProjectBomLine`(`part_revision_id`);
ALTER TABLE `ProjectBomLine` ADD CONSTRAINT `ProjectBomLine_part_revision_id_fkey` FOREIGN KEY (`part_revision_id`) REFERENCES `MaterialRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE `ProjectBomLine` `l`
JOIN `MaterialRevision` `mr` ON `mr`.`material_id` = `l`.`material_id` AND `mr`.`seq` = 1
SET `l`.`part_revision_id` = `mr`.`id`;

-- Locked tags record the part's drawing revision too.
ALTER TABLE `ProjectBomItem` ADD COLUMN `part_revision_id` INTEGER NULL;
UPDATE `ProjectBomItem` `i`
JOIN `MaterialRevision` `mr` ON `mr`.`material_id` = `i`.`material_id` AND `mr`.`seq` = 1
SET `i`.`part_revision_id` = `mr`.`id`, `i`.`rev` = `mr`.`rev`
WHERE `i`.`is_subassembly` = false;

-- Releasing a part's drawing revision: Materials → Approve. Given to the roles
-- that can release subassemblies, so the same people release both for now.
INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'APPROVE', 'MATERIAL_APPROVE', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'material'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'MATERIAL_APPROVE');

INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT `rp`.`role_id`, `ap`.`id`, true
FROM `RolePermission` `rp`
JOIN `Permission` `sp` ON `sp`.`id` = `rp`.`permission_id` AND `sp`.`code` = 'SUBASSEMBLY_APPROVE'
JOIN `Permission` `ap` ON `ap`.`code` = 'MATERIAL_APPROVE'
WHERE `rp`.`allowed` = true
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `rp`.`role_id` AND `x`.`permission_id` = `ap`.`id`);
