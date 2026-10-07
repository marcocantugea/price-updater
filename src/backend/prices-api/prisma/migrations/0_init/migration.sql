-- CreateTable
CREATE TABLE `currencies` (
    `id` VARCHAR(36) NOT NULL,
    `code` CHAR(3) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `decimals` INTEGER NOT NULL DEFAULT 2,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `currencies_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `permissions_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(36) NOT NULL,
    `commercial_name` VARCHAR(150) NOT NULL,
    `legal_name` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `default_currency` CHAR(3) NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    INDEX `roles_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `roles_tenant_id_slug_key`(`tenant_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` VARCHAR(36) NOT NULL,
    `permission_id` VARCHAR(36) NOT NULL,

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NULL,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role_id` VARCHAR(36) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `replaced_by_id` VARCHAR(36) NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `key_hash` VARCHAR(255) NOT NULL,
    `prefix` VARCHAR(16) NOT NULL,
    `scopes` JSON NOT NULL,
    `status` ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    INDEX `api_keys_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `base_price` DECIMAL(12, 2) NOT NULL,
    `currency_code` CHAR(3) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    INDEX `products_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `products_tenant_id_sku_key`(`tenant_id`, `sku`),
    UNIQUE INDEX `products_tenant_id_id_key`(`tenant_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marketplaces` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` ENUM('amazon', 'mercadolibre', 'own_store') NOT NULL,
    `config` JSON NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    INDEX `marketplaces_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `marketplaces_tenant_id_code_key`(`tenant_id`, `code`),
    UNIQUE INDEX `marketplaces_tenant_id_id_key`(`tenant_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `price_lists` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` VARCHAR(255) NULL,
    `currency_code` CHAR(3) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    INDEX `price_lists_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `price_lists_tenant_id_name_key`(`tenant_id`, `name`),
    UNIQUE INDEX `price_lists_tenant_id_id_key`(`tenant_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `price_list_products` (
    `price_list_id` VARCHAR(36) NOT NULL,
    `product_id` VARCHAR(36) NOT NULL,

    PRIMARY KEY (`price_list_id`, `product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `price_list_marketplaces` (
    `price_list_id` VARCHAR(36) NOT NULL,
    `marketplace_id` VARCHAR(36) NOT NULL,

    PRIMARY KEY (`price_list_id`, `marketplace_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prices` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `product_id` VARCHAR(36) NOT NULL,
    `price_list_id` VARCHAR(36) NOT NULL,
    `marketplace_id` VARCHAR(36) NOT NULL,
    `base_price` DECIMAL(12, 2) NOT NULL,
    `currency_code` CHAR(3) NOT NULL,
    `final_price` DECIMAL(12, 2) NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    INDEX `prices_tenant_id_idx`(`tenant_id`),
    INDEX `prices_tenant_id_product_id_idx`(`tenant_id`, `product_id`),
    UNIQUE INDEX `prices_tenant_id_product_id_price_list_id_marketplace_id_sta_key`(`tenant_id`, `product_id`, `price_list_id`, `marketplace_id`, `start_date`),
    UNIQUE INDEX `prices_tenant_id_id_key`(`tenant_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `price_history` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `price_id` VARCHAR(36) NOT NULL,
    `product_id` VARCHAR(36) NOT NULL,
    `old_base_price` DECIMAL(12, 2) NULL,
    `new_base_price` DECIMAL(12, 2) NULL,
    `old_final_price` DECIMAL(12, 2) NULL,
    `new_final_price` DECIMAL(12, 2) NULL,
    `changed_by_type` ENUM('user', 'api_key', 'system') NOT NULL,
    `changed_by_id` VARCHAR(36) NULL,
    `reason` VARCHAR(40) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `price_history_tenant_id_idx`(`tenant_id`),
    INDEX `price_history_tenant_id_price_id_idx`(`tenant_id`, `price_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discounts` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` ENUM('percentage', 'fixed') NOT NULL,
    `value` DECIMAL(12, 2) NOT NULL,
    `applies_to` ENUM('product', 'price_list', 'marketplace') NOT NULL,
    `product_id` VARCHAR(36) NULL,
    `price_list_id` VARCHAR(36) NULL,
    `marketplace_id` VARCHAR(36) NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NULL,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    INDEX `discounts_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `discounts_tenant_id_name_key`(`tenant_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenants` ADD CONSTRAINT `tenants_default_currency_fkey` FOREIGN KEY (`default_currency`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles` ADD CONSTRAINT `roles_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `marketplaces` ADD CONSTRAINT `marketplaces_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_lists` ADD CONSTRAINT `price_lists_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_lists` ADD CONSTRAINT `price_lists_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_list_products` ADD CONSTRAINT `price_list_products_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_list_products` ADD CONSTRAINT `price_list_products_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_list_marketplaces` ADD CONSTRAINT `price_list_marketplaces_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_list_marketplaces` ADD CONSTRAINT `price_list_marketplaces_marketplace_id_fkey` FOREIGN KEY (`marketplace_id`) REFERENCES `marketplaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prices` ADD CONSTRAINT `prices_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prices` ADD CONSTRAINT `prices_tenant_id_product_id_fkey` FOREIGN KEY (`tenant_id`, `product_id`) REFERENCES `products`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prices` ADD CONSTRAINT `prices_tenant_id_price_list_id_fkey` FOREIGN KEY (`tenant_id`, `price_list_id`) REFERENCES `price_lists`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prices` ADD CONSTRAINT `prices_tenant_id_marketplace_id_fkey` FOREIGN KEY (`tenant_id`, `marketplace_id`) REFERENCES `marketplaces`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prices` ADD CONSTRAINT `prices_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_tenant_id_price_id_fkey` FOREIGN KEY (`tenant_id`, `price_id`) REFERENCES `prices`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_tenant_id_product_id_fkey` FOREIGN KEY (`tenant_id`, `product_id`) REFERENCES `products`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discounts` ADD CONSTRAINT `discounts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discounts` ADD CONSTRAINT `discounts_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discounts` ADD CONSTRAINT `discounts_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discounts` ADD CONSTRAINT `discounts_marketplace_id_fkey` FOREIGN KEY (`marketplace_id`) REFERENCES `marketplaces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

