-- BOM (Master Data → BOM): subassemblies built from the material master.

-- CreateTable
CREATE TABLE `Subassembly` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `drawing_no` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    INDEX `Subassembly_drawing_no_idx`(`drawing_no`),
    INDEX `Subassembly_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubassemblyItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subassembly_id` INTEGER NOT NULL,
    `material_id` INTEGER NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 1,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `SubassemblyItem_material_id_idx`(`material_id`),
    UNIQUE INDEX `SubassemblyItem_subassembly_id_material_id_key`(`subassembly_id`, `material_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SubassemblyItem` ADD CONSTRAINT `SubassemblyItem_subassembly_id_fkey` FOREIGN KEY (`subassembly_id`) REFERENCES `Subassembly`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubassemblyItem` ADD CONSTRAINT `SubassemblyItem_material_id_fkey` FOREIGN KEY (`material_id`) REFERENCES `Material`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
