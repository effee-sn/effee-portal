-- A subassembly is itself an item of the material master.
ALTER TABLE `Subassembly` ADD COLUMN `material_id` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Subassembly_material_id_key` ON `Subassembly`(`material_id`);

-- AddForeignKey
ALTER TABLE `Subassembly` ADD CONSTRAINT `Subassembly_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `Material`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Master Data "BOM" is now "Subassemblies" (the BOM will be the project's):
-- the BOM_* permissions become SUBASSEMBLY_*, keeping every role's grants.
UPDATE `Module` SET `name` = 'SUBASSEMBLY', `slug` = 'subassembly', `description` = 'Master data — subassemblies', `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `slug` = 'bom';

UPDATE `Permission` SET `code` = CONCAT('SUBASSEMBLY_', SUBSTRING(`code`, 5))
WHERE `code` IN ('BOM_VIEW', 'BOM_CREATE', 'BOM_EDIT', 'BOM_DELETE');
