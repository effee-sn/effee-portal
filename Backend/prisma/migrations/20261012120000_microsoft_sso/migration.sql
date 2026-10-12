-- Microsoft sign-in (SSO): administrator switches + in-flight sign-in state.

-- AlterTable
ALTER TABLE `CompanySettings`
    ADD COLUMN `sso_microsoft_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sso_password_login` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `sso_auto_create` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sso_default_role_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `SsoLoginState` (
    `state` VARCHAR(64) NOT NULL,
    `nonce` VARCHAR(64) NOT NULL,
    `code_verifier` VARCHAR(128) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SsoLoginState_created_at_idx`(`created_at`),
    PRIMARY KEY (`state`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
