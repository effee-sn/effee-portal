-- CreateTable
CREATE TABLE `Role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `Role_name_key`(`name`),
    UNIQUE INDEX `Role_slug_key`(`slug`),
    INDEX `Role_deleted_at_idx`(`deleted_at`),
    INDEX `Role_is_system_idx`(`is_system`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `role_id` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `department_id` INTEGER NULL,
    `designation` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_phone_key`(`phone`),
    INDEX `User_status_idx`(`status`),
    INDEX `User_deleted_at_idx`(`deleted_at`),
    INDEX `User_created_at_idx`(`created_at`),
    INDEX `User_status_deleted_at_created_at_idx`(`status`, `deleted_at`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Department` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `head_user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `Department_name_key`(`name`),
    INDEX `Department_deleted_at_idx`(`deleted_at`),
    INDEX `Department_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Workflow` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `module` VARCHAR(191) NOT NULL DEFAULT 'service',
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,

    INDEX `Workflow_module_idx`(`module`),
    INDEX `Workflow_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowStep` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workflow_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `step_order` INTEGER NOT NULL,
    `assignee_type` ENUM('USER', 'ROLE', 'DEPARTMENT', 'DEPARTMENT_HEAD', 'CREATOR', 'MANUAL') NOT NULL,
    `assignee_user_id` INTEGER NULL,
    `assignee_role_id` INTEGER NULL,
    `assignee_department_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkflowStep_workflow_id_idx`(`workflow_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Module` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Module_name_key`(`name`),
    UNIQUE INDEX `Module_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `module_id` INTEGER NOT NULL,
    `action` ENUM('CREATE', 'VIEW', 'EDIT', 'DELETE', 'APPROVE', 'FINANCE') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Permission_code_key`(`code`),
    UNIQUE INDEX `Permission_module_id_action_key`(`module_id`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,
    `allowed` BOOLEAN NOT NULL DEFAULT false,

    INDEX `RolePermission_role_id_allowed_idx`(`role_id`, `allowed`),
    UNIQUE INDEX `RolePermission_role_id_permission_id_key`(`role_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanySettings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_name` VARCHAR(191) NOT NULL DEFAULT 'Effee Portal',
    `company_logo` VARCHAR(191) NULL,
    `company_address` TEXT NULL,
    `company_phone` VARCHAR(191) NULL,
    `company_email` VARCHAR(191) NULL,
    `company_website` VARCHAR(191) NULL,
    `company_gstin` VARCHAR(191) NULL,
    `smtp_host` VARCHAR(191) NULL,
    `smtp_port` INTEGER NOT NULL DEFAULT 587,
    `smtp_user` VARCHAR(191) NULL,
    `smtp_pass` TEXT NULL,
    `smtp_from_name` VARCHAR(191) NULL,
    `smtp_from_email` VARCHAR(191) NULL,
    `email_notifications` BOOLEAN NOT NULL DEFAULT false,
    `login_max_attempts` INTEGER NOT NULL DEFAULT 5,
    `login_window_minutes` INTEGER NOT NULL DEFAULT 15,
    `max_upload_mb` INTEGER NOT NULL DEFAULT 5,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_token_key`(`token`),
    INDEX `PasswordResetToken_user_id_used_idx`(`user_id`, `used`),
    INDEX `PasswordResetToken_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actor_id` INTEGER NULL,
    `actor_email` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `changes` TEXT NULL,
    `ip` VARCHAR(191) NULL,
    `user_agent` TEXT NULL,
    `request_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entity_entity_id_idx`(`entity`, `entity_id`),
    INDEX `AuditLog_actor_id_idx`(`actor_id`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceTicket` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` VARCHAR(191) NOT NULL,
    `ticket_type` ENUM('CALL', 'EMAIL') NOT NULL,
    `company_name` VARCHAR(191) NOT NULL,
    `company_location` VARCHAR(191) NULL,
    `reported_by` VARCHAR(191) NOT NULL,
    `reported_by_phone` VARCHAR(191) NULL,
    `reported_by_email` VARCHAR(191) NULL,
    `complaint_date` DATETIME(3) NULL,
    `complaint_time` VARCHAR(191) NULL,
    `machine_project` VARCHAR(191) NULL,
    `machine_serial_no` VARCHAR(191) NULL,
    `issue_title` VARCHAR(191) NOT NULL,
    `issue_description` TEXT NOT NULL,
    `issue_severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `technical_category` VARCHAR(191) NULL,
    `originating_department_id` INTEGER NULL,
    `production_impact` BOOLEAN NOT NULL DEFAULT false,
    `production_impact_details` TEXT NULL,
    `customer_impact` BOOLEAN NOT NULL DEFAULT false,
    `customer_impact_details` TEXT NULL,
    `safety_impact` BOOLEAN NOT NULL DEFAULT false,
    `safety_impact_details` TEXT NULL,
    `support_type` ENUM('REMOTE', 'SITE_VISIT') NULL,
    `site_visit_notes` TEXT NULL,
    `acknowledged_at` DATETIME(3) NULL,
    `first_response_at` DATETIME(3) NULL,
    `machine_restore_at` DATETIME(3) NULL,
    `customer_confirmed` BOOLEAN NULL,
    `observation_until` DATETIME(3) NULL,
    `reopened_count` INTEGER NOT NULL DEFAULT 0,
    `workflow_id` INTEGER NULL,
    `current_step_id` INTEGER NULL,
    `assigned_user_id` INTEGER NULL,
    `assigned_department_id` INTEGER NULL,
    `assigned_role_id` INTEGER NULL,
    `assigned_to_name` VARCHAR(191) NULL,
    `assigned_by_id` INTEGER NULL,
    `assigned_by_name` VARCHAR(191) NULL,
    `decline_reason` TEXT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'CONTACTED', 'RESOLVED', 'ON_OBSERVATION', 'CLOSED', 'REOPENED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_by_name` VARCHAR(191) NULL,
    `updated_by` INTEGER NULL,

    UNIQUE INDEX `ServiceTicket_ticket_id_key`(`ticket_id`),
    INDEX `ServiceTicket_status_idx`(`status`),
    INDEX `ServiceTicket_issue_severity_idx`(`issue_severity`),
    INDEX `ServiceTicket_ticket_type_idx`(`ticket_type`),
    INDEX `ServiceTicket_company_name_idx`(`company_name`),
    INDEX `ServiceTicket_deleted_at_idx`(`deleted_at`),
    INDEX `ServiceTicket_created_at_idx`(`created_at`),
    INDEX `ServiceTicket_status_deleted_at_created_at_idx`(`status`, `deleted_at`, `created_at`),
    INDEX `ServiceTicket_assigned_user_id_idx`(`assigned_user_id`),
    INDEX `ServiceTicket_assigned_department_id_idx`(`assigned_department_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketParticipant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `user_name` VARCHAR(191) NULL,
    `stage_label` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketParticipant_user_id_idx`(`user_id`),
    UNIQUE INDEX `TicketParticipant_ticket_id_user_id_key`(`ticket_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResolutionPlan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `dept_task_id` INTEGER NULL,
    `title` VARCHAR(191) NULL,
    `content_json` JSON NULL,
    `content_text` TEXT NULL,
    `status` ENUM('DRAFT', 'FINAL', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 1,
    `parent_plan_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_by_name` VARCHAR(191) NULL,
    `finalized_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `ResolutionPlan_ticket_id_idx`(`ticket_id`),
    INDEX `ResolutionPlan_dept_task_id_idx`(`dept_task_id`),
    INDEX `ResolutionPlan_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketDepartmentTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `department_id` INTEGER NOT NULL,
    `department_name` VARCHAR(191) NULL,
    `technical_category` VARCHAR(191) NULL,
    `issue_note` TEXT NOT NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'DECLINED') NOT NULL DEFAULT 'OPEN',
    `lead_user_id` INTEGER NULL,
    `lead_name` VARCHAR(191) NULL,
    `assigned_user_id` INTEGER NULL,
    `assigned_to_name` VARCHAR(191) NULL,
    `resolver_user_id` INTEGER NULL,
    `resolver_name` VARCHAR(191) NULL,
    `awaiting_validation` BOOLEAN NOT NULL DEFAULT false,
    `resolution_note` TEXT NULL,
    `resolution_note_json` JSON NULL,
    `decline_reason` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `resolved_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `TicketDepartmentTask_ticket_id_idx`(`ticket_id`),
    INDEX `TicketDepartmentTask_assigned_user_id_idx`(`assigned_user_id`),
    INDEX `TicketDepartmentTask_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_head_user_id_fkey` FOREIGN KEY (`head_user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `Workflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_assignee_user_id_fkey` FOREIGN KEY (`assignee_user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_assignee_role_id_fkey` FOREIGN KEY (`assignee_role_id`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_assignee_department_id_fkey` FOREIGN KEY (`assignee_department_id`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Permission` ADD CONSTRAINT `Permission_module_id_fkey` FOREIGN KEY (`module_id`) REFERENCES `Module`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `Permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceTicket` ADD CONSTRAINT `ServiceTicket_originating_department_id_fkey` FOREIGN KEY (`originating_department_id`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketParticipant` ADD CONSTRAINT `TicketParticipant_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `ServiceTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResolutionPlan` ADD CONSTRAINT `ResolutionPlan_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `ServiceTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResolutionPlan` ADD CONSTRAINT `ResolutionPlan_dept_task_id_fkey` FOREIGN KEY (`dept_task_id`) REFERENCES `TicketDepartmentTask`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketDepartmentTask` ADD CONSTRAINT `TicketDepartmentTask_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `ServiceTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

