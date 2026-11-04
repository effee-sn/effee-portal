-- Subassemblies are identified by their drawing no.: a subassembly's own item
-- carries it as its code, with no IMM prefix. Codes and BOM tags grow to fit
-- drawing numbers (up to 100 characters).

ALTER TABLE `Material` DROP FOREIGN KEY `Material_prefix_id_fkey`;
ALTER TABLE `Material` MODIFY `imm_code` VARCHAR(100) NOT NULL, MODIFY `prefix_id` INTEGER NULL;
ALTER TABLE `Material` ADD CONSTRAINT `Material_prefix_id_fkey` FOREIGN KEY (`prefix_id`) REFERENCES `ImmPrefix`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ProjectBomItem` MODIFY `imm_code` VARCHAR(100) NOT NULL, MODIFY `tag` VARCHAR(500) NOT NULL, MODIFY `parent_tag` VARCHAR(500) NULL;

-- Live subassemblies' items: code = drawing no., no prefix. (Deleted ones keep
-- their old IMM codes, so their drawing numbers stay free to reuse.)
UPDATE `Material` m
  JOIN `Subassembly` s ON s.`material_id` = m.`id`
  SET m.`imm_code` = s.`drawing_no`, m.`prefix_id` = NULL
  WHERE s.`deleted_at` IS NULL;
