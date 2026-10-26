-- CreateTable
CREATE TABLE `UnitOfMeasure` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `UnitOfMeasure_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The starting list (editable in Administrator → Configuration → Units of Measure).
INSERT INTO `UnitOfMeasure` (`code`, `name`, `sort_order`, `updated_at`) VALUES
    ('Nos', 'Numbers', 1, CURRENT_TIMESTAMP(3)),
    ('Set', 'Set', 2, CURRENT_TIMESTAMP(3)),
    ('m', 'Metre', 3, CURRENT_TIMESTAMP(3)),
    ('mm', 'Millimetre', 4, CURRENT_TIMESTAMP(3)),
    ('kg', 'Kilogram', 5, CURRENT_TIMESTAMP(3)),
    ('g', 'Gram', 6, CURRENT_TIMESTAMP(3)),
    ('L', 'Litre', 7, CURRENT_TIMESTAMP(3)),
    ('sqm', 'Square metre', 8, CURRENT_TIMESTAMP(3));

-- Existing materials start as Nos.
ALTER TABLE `Material` ADD COLUMN `uom_id` INTEGER NULL;
UPDATE `Material` SET `uom_id` = (SELECT `id` FROM `UnitOfMeasure` WHERE `code` = 'Nos');
ALTER TABLE `Material` MODIFY `uom_id` INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX `Material_uom_id_idx` ON `Material`(`uom_id`);

-- AddForeignKey
ALTER TABLE `Material` ADD CONSTRAINT `Material_uom_id_fkey` FOREIGN KEY (`uom_id`) REFERENCES `UnitOfMeasure`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
