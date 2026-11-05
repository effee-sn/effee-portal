-- Material types become configurable (Administrator → Configuration → Material
-- Types), with what used to be hard-coded on "Finished" as settings on the
-- type: drawing revisions, a tag per piece in project BOMs, default make/buy.
-- Each IMM prefix can belong to a type; the revision maker-checker switch is
-- added to the revision settings. Behaviour is unchanged after this migration.

CREATE TABLE `MaterialType` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `has_revisions` BOOLEAN NOT NULL DEFAULT false,
    `tag_each_piece` BOOLEAN NOT NULL DEFAULT false,
    `default_make_buy` VARCHAR(12) NOT NULL DEFAULT 'BUY',
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `MaterialType_code_key`(`code`),
    UNIQUE INDEX `MaterialType_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The three types so far, behaving exactly as before; and the built-in type of
-- a subassembly's own item (revised on its subassembly, one tag per piece).
INSERT INTO `MaterialType` (`code`, `name`, `has_revisions`, `tag_each_piece`, `default_make_buy`, `is_system`, `sort_order`, `updated_at`) VALUES
  ('FINISHED',    'Finished',    true,  true,  'MAKE', false, 1, CURRENT_TIMESTAMP(3)),
  ('BOUGHT_OUT',  'Bought-out',  false, false, 'BUY',  false, 2, CURRENT_TIMESTAMP(3)),
  ('CONSUMABLE',  'Consumables', false, false, 'BUY',  false, 3, CURRENT_TIMESTAMP(3)),
  ('SUBASSEMBLY', 'Subassembly', false, true,  'MAKE', true,  99, CURRENT_TIMESTAMP(3));

-- Materials: the fixed list becomes a link to the type's code.
ALTER TABLE `Material` MODIFY `material_type` VARCHAR(30) NOT NULL;
UPDATE `Material` m JOIN `Subassembly` s ON s.`material_id` = m.`id` SET m.`material_type` = 'SUBASSEMBLY';
CREATE INDEX `Material_material_type_idx` ON `Material`(`material_type`);
ALTER TABLE `Material` ADD CONSTRAINT `Material_material_type_fkey` FOREIGN KEY (`material_type`) REFERENCES `MaterialType`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Locked project BOMs keep the type's code as a snapshot.
ALTER TABLE `ProjectBomItem` MODIFY `material_type` VARCHAR(30) NOT NULL;
UPDATE `ProjectBomItem` SET `material_type` = 'SUBASSEMBLY' WHERE `is_subassembly` = true;

-- Prefixes: the type their materials are. Set where all of a prefix's live
-- materials are of one type; left open otherwise.
ALTER TABLE `ImmPrefix` ADD COLUMN `type_code` VARCHAR(30) NULL;
CREATE INDEX `ImmPrefix_type_code_idx` ON `ImmPrefix`(`type_code`);
UPDATE `ImmPrefix` p
  JOIN (
    SELECT `prefix_id`, MIN(`material_type`) AS `t`
    FROM `Material`
    WHERE `deleted_at` IS NULL AND `prefix_id` IS NOT NULL
    GROUP BY `prefix_id`
    HAVING COUNT(DISTINCT `material_type`) = 1
  ) one ON one.`prefix_id` = p.`id`
  SET p.`type_code` = one.`t`;
ALTER TABLE `ImmPrefix` ADD CONSTRAINT `ImmPrefix_type_code_fkey` FOREIGN KEY (`type_code`) REFERENCES `MaterialType`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Revisions: maker-checker (off — as before).
ALTER TABLE `CompanySettings` ADD COLUMN `revision_maker_checker` BOOLEAN NOT NULL DEFAULT false;
