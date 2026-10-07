-- Backfill relation ownership from the owning price list before making it required.
ALTER TABLE `price_list_products` ADD COLUMN `tenant_id` VARCHAR(36) NULL;
UPDATE `price_list_products` AS `link`
INNER JOIN `price_lists` AS `price_list` ON `price_list`.`id` = `link`.`price_list_id`
SET `link`.`tenant_id` = `price_list`.`tenant_id`;
ALTER TABLE `price_list_products` MODIFY `tenant_id` VARCHAR(36) NOT NULL;

ALTER TABLE `price_list_products` DROP FOREIGN KEY `price_list_products_price_list_id_fkey`;
ALTER TABLE `price_list_products` DROP FOREIGN KEY `price_list_products_product_id_fkey`;
ALTER TABLE `price_list_products` DROP PRIMARY KEY;
ALTER TABLE `price_list_products` ADD PRIMARY KEY (`tenant_id`, `price_list_id`, `product_id`);
ALTER TABLE `price_list_products` ADD INDEX `price_list_products_tenant_id_product_id_idx` (`tenant_id`, `product_id`);
ALTER TABLE `price_list_products`
  ADD CONSTRAINT `price_list_products_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `price_list_products_tenant_id_price_list_id_fkey`
    FOREIGN KEY (`tenant_id`, `price_list_id`) REFERENCES `price_lists`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `price_list_products_tenant_id_product_id_fkey`
    FOREIGN KEY (`tenant_id`, `product_id`) REFERENCES `products`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `price_list_marketplaces` ADD COLUMN `tenant_id` VARCHAR(36) NULL;
UPDATE `price_list_marketplaces` AS `link`
INNER JOIN `price_lists` AS `price_list` ON `price_list`.`id` = `link`.`price_list_id`
SET `link`.`tenant_id` = `price_list`.`tenant_id`;
ALTER TABLE `price_list_marketplaces` MODIFY `tenant_id` VARCHAR(36) NOT NULL;

ALTER TABLE `price_list_marketplaces` DROP FOREIGN KEY `price_list_marketplaces_price_list_id_fkey`;
ALTER TABLE `price_list_marketplaces` DROP FOREIGN KEY `price_list_marketplaces_marketplace_id_fkey`;
ALTER TABLE `price_list_marketplaces` DROP PRIMARY KEY;
ALTER TABLE `price_list_marketplaces` ADD PRIMARY KEY (`tenant_id`, `price_list_id`, `marketplace_id`);
ALTER TABLE `price_list_marketplaces` ADD INDEX `price_list_marketplaces_tenant_id_marketplace_id_idx` (`tenant_id`, `marketplace_id`);
ALTER TABLE `price_list_marketplaces`
  ADD CONSTRAINT `price_list_marketplaces_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `price_list_marketplaces_tenant_id_price_list_id_fkey`
    FOREIGN KEY (`tenant_id`, `price_list_id`) REFERENCES `price_lists`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `price_list_marketplaces_tenant_id_marketplace_id_fkey`
    FOREIGN KEY (`tenant_id`, `marketplace_id`) REFERENCES `marketplaces`(`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
