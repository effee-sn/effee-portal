-- How new subassembly revisions are labelled (Administrator → Configuration → Revisions).
ALTER TABLE `CompanySettings` ADD COLUMN `revision_scheme` VARCHAR(10) NOT NULL DEFAULT 'LETTERS';

-- CreateTable
CREATE TABLE `SubassemblyRevision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subassembly_id` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `rev` VARCHAR(10) NOT NULL,
    `status` ENUM('DRAFT', 'RELEASED', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `change_note` TEXT NULL,
    `released_at` DATETIME(3) NULL,
    `released_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `SubassemblyRevision_subassembly_id_seq_key`(`subassembly_id`, `seq`),
    INDEX `SubassemblyRevision_subassembly_id_status_idx`(`subassembly_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SubassemblyRevision` ADD CONSTRAINT `SubassemblyRevision_subassembly_id_fkey` FOREIGN KEY (`subassembly_id`) REFERENCES `Subassembly`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing subassembly becomes Rev A, released, with the lines it has now.
INSERT INTO `SubassemblyRevision` (`subassembly_id`, `seq`, `rev`, `status`, `change_note`, `released_at`, `released_by`, `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT `id`, 1, 'A', 'RELEASED', 'First revision (made before revisions existed)', `updated_at`, `updated_by`, `created_at`, CURRENT_TIMESTAMP(3), `created_by`, `updated_by`
FROM `Subassembly`;

-- Lines now belong to a revision, and hold a child subassembly at a revision.
ALTER TABLE `SubassemblyItem` ADD COLUMN `revision_id` INTEGER NULL, ADD COLUMN `child_revision_id` INTEGER NULL;

UPDATE `SubassemblyItem` `i`
JOIN `SubassemblyRevision` `r` ON `r`.`subassembly_id` = `i`.`subassembly_id`
SET `i`.`revision_id` = `r`.`id`;

UPDATE `SubassemblyItem` `i`
JOIN `Subassembly` `c` ON `c`.`material_id` = `i`.`material_id`
JOIN `SubassemblyRevision` `cr` ON `cr`.`subassembly_id` = `c`.`id`
SET `i`.`child_revision_id` = `cr`.`id`;

ALTER TABLE `SubassemblyItem` MODIFY `revision_id` INTEGER NOT NULL;

-- A material once per revision (was: once per subassembly). The new index on
-- subassembly_id keeps its foreign key indexed once the old unique one goes.
CREATE INDEX `SubassemblyItem_subassembly_id_idx` ON `SubassemblyItem`(`subassembly_id`);
DROP INDEX `SubassemblyItem_subassembly_id_material_id_key` ON `SubassemblyItem`;
CREATE UNIQUE INDEX `SubassemblyItem_revision_id_material_id_key` ON `SubassemblyItem`(`revision_id`, `material_id`);
CREATE INDEX `SubassemblyItem_child_revision_id_idx` ON `SubassemblyItem`(`child_revision_id`);

ALTER TABLE `SubassemblyItem` ADD CONSTRAINT `SubassemblyItem_revision_id_fkey` FOREIGN KEY (`revision_id`) REFERENCES `SubassemblyRevision`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SubassemblyItem` ADD CONSTRAINT `SubassemblyItem_child_revision_id_fkey` FOREIGN KEY (`child_revision_id`) REFERENCES `SubassemblyRevision`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Releasing a revision: Subassemblies → Approve. Given to the roles that can
-- edit subassemblies now, so nobody is stopped mid-work (remove it in Roles to
-- keep releasing to fewer people).
INSERT INTO `Permission` (`module_id`, `action`, `code`, `created_at`)
SELECT `m`.`id`, 'APPROVE', 'SUBASSEMBLY_APPROVE', CURRENT_TIMESTAMP(3)
FROM `Module` `m`
WHERE `m`.`slug` = 'subassembly'
  AND NOT EXISTS (SELECT 1 FROM `Permission` `x` WHERE `x`.`code` = 'SUBASSEMBLY_APPROVE');

INSERT INTO `RolePermission` (`role_id`, `permission_id`, `allowed`)
SELECT `rp`.`role_id`, `ap`.`id`, true
FROM `RolePermission` `rp`
JOIN `Permission` `ep` ON `ep`.`id` = `rp`.`permission_id` AND `ep`.`code` = 'SUBASSEMBLY_EDIT'
JOIN `Permission` `ap` ON `ap`.`code` = 'SUBASSEMBLY_APPROVE'
WHERE `rp`.`allowed` = true
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` `x` WHERE `x`.`role_id` = `rp`.`role_id` AND `x`.`permission_id` = `ap`.`id`);
