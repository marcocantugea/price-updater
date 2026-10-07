-- Tenant-safe per-user price-list access assignments.
ALTER TABLE `users`
  ADD UNIQUE INDEX `users_tenant_id_id_key` (`tenant_id`, `id`);

CREATE TABLE `user_price_list_access` (
    `tenant_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `price_list_id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,

    PRIMARY KEY (`tenant_id`, `user_id`, `price_list_id`),
    INDEX `user_price_list_access_tenant_id_user_id_idx` (`tenant_id`, `user_id`),
    INDEX `user_price_list_access_tenant_id_price_list_id_idx` (`tenant_id`, `price_list_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_price_list_access`
  ADD CONSTRAINT `user_price_list_access_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `user_price_list_access_tenant_id_user_id_fkey`
    FOREIGN KEY (`tenant_id`, `user_id`) REFERENCES `users`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `user_price_list_access_tenant_id_price_list_id_fkey`
    FOREIGN KEY (`tenant_id`, `price_list_id`) REFERENCES `price_lists`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `export_requests` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `requested_by_user_id` VARCHAR(36) NOT NULL,
    `price_list_id` VARCHAR(36) NOT NULL,
    `marketplace_id` VARCHAR(36) NOT NULL,
    `format` ENUM('csv', 'json', 'txt') NOT NULL,
    `filters` JSON NULL,
    `status` ENUM('queued', 'processing', 'completed', 'failed', 'expired') NOT NULL DEFAULT 'queued',
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 3,
    `locked_at` DATETIME(3) NULL,
    `locked_by` VARCHAR(100) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `storage_key` VARCHAR(500) NULL,
    `file_name` VARCHAR(255) NULL,
    `content_type` VARCHAR(120) NULL,
    `byte_size` INTEGER NULL,
    `checksum` VARCHAR(128) NULL,
    `error_code` VARCHAR(80) NULL,
    `error_message` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,

    PRIMARY KEY (`id`),
    INDEX `export_requests_status_created_at_idx` (`status`, `created_at`),
    INDEX `export_requests_tenant_id_requested_by_user_id_created_at_idx` (`tenant_id`, `requested_by_user_id`, `created_at`),
    INDEX `export_requests_expires_at_idx` (`expires_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `export_requests`
  ADD CONSTRAINT `export_requests_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `export_requests_tenant_id_requested_by_user_id_fkey`
    FOREIGN KEY (`tenant_id`, `requested_by_user_id`) REFERENCES `users`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `export_requests_tenant_id_price_list_id_fkey`
    FOREIGN KEY (`tenant_id`, `price_list_id`) REFERENCES `price_lists`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `export_requests_tenant_id_marketplace_id_fkey`
    FOREIGN KEY (`tenant_id`, `marketplace_id`) REFERENCES `marketplaces`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
