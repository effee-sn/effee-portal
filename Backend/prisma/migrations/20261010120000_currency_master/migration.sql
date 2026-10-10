-- Master Data → Currencies: currencies with a manually maintained rate history.

-- CreateTable
CREATE TABLE `Currency` (
    `code` VARCHAR(3) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(8) NOT NULL,
    `is_base` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `rate` DECIMAL(18, 6) NOT NULL,
    `rate_effective_from` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CurrencyRate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `currency_code` VARCHAR(3) NOT NULL,
    `rate` DECIMAL(18, 6) NOT NULL,
    `effective_from` DATE NOT NULL,
    `note` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` INTEGER NULL,

    INDEX `CurrencyRate_currency_code_effective_from_idx`(`currency_code`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CurrencyRate` ADD CONSTRAINT `CurrencyRate_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `Currency`(`code`) ON DELETE CASCADE ON UPDATE CASCADE;

-- The base currency. Every other currency is added (with its rate) by users.
INSERT INTO `Currency` (`code`, `name`, `symbol`, `is_base`, `rate`, `rate_effective_from`, `updated_at`)
VALUES ('INR', 'Indian Rupee', '₹', true, 1, CURRENT_DATE, CURRENT_TIMESTAMP(3));
