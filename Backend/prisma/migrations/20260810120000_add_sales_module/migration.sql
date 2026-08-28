-- CreateTable
CREATE TABLE `Customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `gstin` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `billing_address` TEXT NULL,
    `shipping_address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `state_code` VARCHAR(191) NULL,
    `pincode` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `owner_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    INDEX `Customer_owner_id_idx`(`owner_id`),
    INDEX `Customer_deleted_at_idx`(`deleted_at`),
    INDEX `Customer_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `designation` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    INDEX `Contact_customer_id_idx`(`customer_id`),
    INDEX `Contact_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `hsn_sac` VARCHAR(191) NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'Nos',
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `gst_rate` DECIMAL(5, 2) NOT NULL DEFAULT 18,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    INDEX `Product_is_active_idx`(`is_active`),
    INDEX `Product_deleted_at_idx`(`deleted_at`),
    INDEX `Product_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Enquiry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ref_no` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `contact_id` INTEGER NULL,
    `source` ENUM('CALL', 'EMAIL', 'WALK_IN', 'EXHIBITION', 'REFERRAL', 'WEBSITE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `stage` ENUM('NEW', 'QUALIFIED', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD') NOT NULL DEFAULT 'NEW',
    `description` TEXT NULL,
    `expected_value` DECIMAL(14, 2) NULL,
    `expected_close` DATETIME(3) NULL,
    `owner_id` INTEGER NOT NULL,
    `won_at` DATETIME(3) NULL,
    `order_no` VARCHAR(191) NULL,
    `order_value` DECIMAL(14, 2) NULL,
    `order_date` DATETIME(3) NULL,
    `lost_at` DATETIME(3) NULL,
    `lost_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `Enquiry_ref_no_key`(`ref_no`),
    INDEX `Enquiry_customer_id_idx`(`customer_id`),
    INDEX `Enquiry_owner_id_idx`(`owner_id`),
    INDEX `Enquiry_stage_idx`(`stage`),
    INDEX `Enquiry_deleted_at_idx`(`deleted_at`),
    INDEX `Enquiry_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EnquiryActivity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enquiry_id` INTEGER NOT NULL,
    `type` ENUM('CALL', 'MEETING', 'TEAMS', 'SITE_VISIT', 'EMAIL') NOT NULL,
    `activity_at` DATETIME(3) NOT NULL,
    `duration_min` INTEGER NULL,
    `subject` VARCHAR(191) NOT NULL,
    `minutes` TEXT NULL,
    `outcome` TEXT NULL,
    `internal_participants` TEXT NULL,
    `customer_participants` TEXT NULL,
    `next_action` TEXT NULL,
    `follow_up_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    INDEX `EnquiryActivity_enquiry_id_idx`(`enquiry_id`),
    INDEX `EnquiryActivity_follow_up_at_idx`(`follow_up_at`),
    INDEX `EnquiryActivity_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quotation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quote_no` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `enquiry_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `quote_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `valid_until` DATETIME(3) NULL,
    `is_inter_state` BOOLEAN NOT NULL DEFAULT false,
    `sub_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discount_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cgst_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `sgst_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `igst_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `grand_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `terms` TEXT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `Quotation_quote_no_key`(`quote_no`),
    INDEX `Quotation_enquiry_id_idx`(`enquiry_id`),
    INDEX `Quotation_customer_id_idx`(`customer_id`),
    INDEX `Quotation_status_idx`(`status`),
    INDEX `Quotation_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuotationItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quotation_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `description` VARCHAR(191) NOT NULL,
    `hsn_sac` VARCHAR(191) NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'Nos',
    `quantity` DECIMAL(12, 2) NOT NULL DEFAULT 1,
    `unit_rate` DECIMAL(14, 2) NOT NULL,
    `discount_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `taxable_value` DECIMAL(14, 2) NOT NULL,
    `gst_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `cgst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `sgst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `igst_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(14, 2) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `QuotationItem_quotation_id_idx`(`quotation_id`),
    INDEX `QuotationItem_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EnquiryActivity` ADD CONSTRAINT `EnquiryActivity_enquiry_id_fkey` FOREIGN KEY (`enquiry_id`) REFERENCES `Enquiry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_enquiry_id_fkey` FOREIGN KEY (`enquiry_id`) REFERENCES `Enquiry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

