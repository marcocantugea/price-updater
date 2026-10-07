-- Product specifications (TEC-17 .. TEC-25).
--
-- Additive only. Seven new tables are created; no existing table, column, index,
-- or row is altered. Every existing Product stays valid with zero related
-- records: the specification is optional, and presentations, identifiers, and
-- supplier links are simply absent until the aggregate is edited.
--
-- Ordering follows the aggregate: the global unit catalog first, then the
-- tenant-scoped Brand/Supplier catalogs, then the specification, its
-- presentations, their identifiers, and finally the supplier join.
--
-- Manual rollback (destructive, not executed automatically). Drop in this exact
-- order so the foreign keys never block each other:
--   DROP TABLE `product_identifiers`;
--   DROP TABLE `product_suppliers`;
--   DROP TABLE `product_presentations`;
--   DROP TABLE `product_specifications`;
--   DROP TABLE `brands`;
--   DROP TABLE `suppliers`;
--   DROP TABLE `unit_of_measures`;
-- Rolling the application back does NOT require dropping anything: the previous
-- backend simply ignores the extra tables.
--
-- MAINTENANCE NOTE: Prisma cannot express a CHECK constraint in schema.prisma,
-- so the constraints added at the end of this file are invisible to the schema.
-- A future `prisma migrate dev` may report them as drift and propose dropping
-- them — this is already the documented behaviour for
-- `products_cost_nonnegative` (see 20260929000100_add_product_cost). Keep them:
-- they are intentional defense in depth, and without them negative measurements,
-- half-filled value/unit pairs, and zero quantities could be written by anything
-- that bypasses the API validators.

-- CreateTable
CREATE TABLE `unit_of_measures` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(8) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `dimension` ENUM('count', 'mass', 'length') NOT NULL,
    `decimals` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `unit_of_measures_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brands` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `brands_tenant_id_name_key`(`tenant_id`, `name`),
    UNIQUE INDEX `brands_tenant_id_id_key`(`tenant_id`, `id`),
    INDEX `brands_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `suppliers_tenant_id_name_key`(`tenant_id`, `name`),
    UNIQUE INDEX `suppliers_tenant_id_id_key`(`tenant_id`, `id`),
    INDEX `suppliers_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_specifications` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `product_id` VARCHAR(36) NOT NULL,
    `brand_id` VARCHAR(36) NULL,
    `model` VARCHAR(150) NULL,
    `weight` DECIMAL(12, 3) NULL,
    `weight_unit_code` VARCHAR(8) NULL,
    `length` DECIMAL(12, 3) NULL,
    `length_unit_code` VARCHAR(8) NULL,
    `depth` DECIMAL(12, 3) NULL,
    `depth_unit_code` VARCHAR(8) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `product_specifications_tenant_id_product_id_key`(`tenant_id`, `product_id`),
    INDEX `product_specifications_tenant_id_idx`(`tenant_id`),
    INDEX `product_specifications_tenant_id_brand_id_idx`(`tenant_id`, `brand_id`),
    INDEX `product_specifications_weight_unit_code_idx`(`weight_unit_code`),
    INDEX `product_specifications_length_unit_code_idx`(`length_unit_code`),
    INDEX `product_specifications_depth_unit_code_idx`(`depth_unit_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
-- No permanent unique constraint on `name`: it would block recreating a
-- soft-deleted presentation. The service rejects an active duplicate name and
-- uses the active-row index below.
CREATE TABLE `product_presentations` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `product_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit_code` VARCHAR(8) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `product_presentations_tenant_id_product_id_id_key`(`tenant_id`, `product_id`, `id`),
    INDEX `product_presentations_tenant_id_product_id_deleted_at_idx`(`tenant_id`, `product_id`, `deleted_at`),
    INDEX `product_presentations_unit_code_idx`(`unit_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
-- `value` keeps the digits exactly as entered (leading zeroes included);
-- `normalized_value` is the left-padded GTIN-14. The unique constraint covers
-- soft-deleted rows too, which is deliberate: soft deletion never releases a
-- barcode. MySQL has no partial indexes, so this comes for free.
CREATE TABLE `product_identifiers` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `product_id` VARCHAR(36) NOT NULL,
    `presentation_id` VARCHAR(36) NOT NULL,
    `type` ENUM('ean_8', 'ean_13', 'upc_a', 'upc_e') NOT NULL,
    `value` VARCHAR(14) NOT NULL,
    `normalized_value` VARCHAR(14) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    UNIQUE INDEX `product_identifiers_tenant_id_normalized_value_key`(`tenant_id`, `normalized_value`),
    INDEX `product_identifiers_tenant_id_product_id_presentation_id_idx`(`tenant_id`, `product_id`, `presentation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
-- The natural triple is the primary key, so re-assigning a supplier revives the
-- existing soft-deleted link instead of inserting a duplicate.
CREATE TABLE `product_suppliers` (
    `tenant_id` VARCHAR(36) NOT NULL,
    `product_id` VARCHAR(36) NOT NULL,
    `supplier_id` VARCHAR(36) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_by_type` ENUM('user', 'api_key', 'system') NULL,
    `updated_by` VARCHAR(36) NULL,
    `updated_by_type` ENUM('user', 'api_key', 'system') NULL,

    INDEX `product_suppliers_tenant_id_supplier_id_idx`(`tenant_id`, `supplier_id`),
    PRIMARY KEY (`tenant_id`, `product_id`, `supplier_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- Every business foreign key carries `tenant_id`, so the database itself rejects
-- a cross-tenant reference even if the service check is ever bypassed.
ALTER TABLE `brands` ADD CONSTRAINT `brands_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_specifications` ADD CONSTRAINT `product_specifications_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_specifications` ADD CONSTRAINT `product_specifications_tenant_id_product_id_fkey` FOREIGN KEY (`tenant_id`, `product_id`) REFERENCES `products`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT, not Prisma's default SET NULL for an optional relation: MySQL rejects
-- "ON DELETE SET NULL" on `tenant_id`, which is NOT NULL. Brands are soft-deleted,
-- and soft-deleting one must not detach historical specifications.
ALTER TABLE `product_specifications` ADD CONSTRAINT `product_specifications_tenant_id_brand_id_fkey` FOREIGN KEY (`tenant_id`, `brand_id`) REFERENCES `brands`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- ON UPDATE RESTRICT on these three only (not the usual ON UPDATE CASCADE):
-- MySQL forbids a referential action on a column that a CHECK constraint reads
-- (error 3823), and the value/unit pair checks at the end of this file read
-- `weight_unit_code`, `length_unit_code`, and `depth_unit_code`. Unit codes are
-- immutable, so RESTRICT costs nothing.
ALTER TABLE `product_specifications` ADD CONSTRAINT `product_specifications_weight_unit_code_fkey` FOREIGN KEY (`weight_unit_code`) REFERENCES `unit_of_measures`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `product_specifications` ADD CONSTRAINT `product_specifications_length_unit_code_fkey` FOREIGN KEY (`length_unit_code`) REFERENCES `unit_of_measures`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `product_specifications` ADD CONSTRAINT `product_specifications_depth_unit_code_fkey` FOREIGN KEY (`depth_unit_code`) REFERENCES `unit_of_measures`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `product_presentations` ADD CONSTRAINT `product_presentations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_presentations` ADD CONSTRAINT `product_presentations_tenant_id_product_id_fkey` FOREIGN KEY (`tenant_id`, `product_id`) REFERENCES `products`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_presentations` ADD CONSTRAINT `product_presentations_unit_code_fkey` FOREIGN KEY (`unit_code`) REFERENCES `unit_of_measures`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_identifiers` ADD CONSTRAINT `product_identifiers_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- The identifier is a strict child of its presentation (as PriceHistory is of
-- Price), so it cascades instead of blocking a hard delete.
ALTER TABLE `product_identifiers` ADD CONSTRAINT `product_identifiers_tenant_id_product_id_presentation_id_fkey` FOREIGN KEY (`tenant_id`, `product_id`, `presentation_id`) REFERENCES `product_presentations`(`tenant_id`, `product_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_suppliers` ADD CONSTRAINT `product_suppliers_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_suppliers` ADD CONSTRAINT `product_suppliers_tenant_id_product_id_fkey` FOREIGN KEY (`tenant_id`, `product_id`) REFERENCES `products`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_suppliers` ADD CONSTRAINT `product_suppliers_tenant_id_supplier_id_fkey` FOREIGN KEY (`tenant_id`, `supplier_id`) REFERENCES `suppliers`(`tenant_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint (invisible to Prisma — see the MAINTENANCE NOTE above).
-- A captured measurement is strictly positive; "not captured" is NULL, never 0.
ALTER TABLE `product_specifications`
  ADD CONSTRAINT `product_specifications_weight_positive` CHECK (`weight` IS NULL OR `weight` > 0),
  ADD CONSTRAINT `product_specifications_length_positive` CHECK (`length` IS NULL OR `length` > 0),
  ADD CONSTRAINT `product_specifications_depth_positive` CHECK (`depth` IS NULL OR `depth` > 0);

-- AddCheckConstraint
-- Value and unit are either both present or both NULL. A value without a unit (or
-- the reverse) is meaningless and must not be storable.
ALTER TABLE `product_specifications`
  ADD CONSTRAINT `product_specifications_weight_unit_pair` CHECK ((`weight` IS NULL) = (`weight_unit_code` IS NULL)),
  ADD CONSTRAINT `product_specifications_length_unit_pair` CHECK ((`length` IS NULL) = (`length_unit_code` IS NULL)),
  ADD CONSTRAINT `product_specifications_depth_unit_pair` CHECK ((`depth` IS NULL) = (`depth_unit_code` IS NULL));

-- AddCheckConstraint
ALTER TABLE `product_presentations`
  ADD CONSTRAINT `product_presentations_quantity_positive` CHECK (`quantity` > 0);
