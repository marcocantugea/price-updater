-- Globalize the supplier catalog.
--
-- Before this migration a supplier belonged to one company (`suppliers.tenant_id`
-- plus `@@unique([tenant_id, name])`). Suppliers become a single catalog shared by
-- every company, like `unit_of_measures`: the column goes away, `name` is unique
-- globally, and the product link keeps its own `tenant_id` but references the
-- supplier through a single-column foreign key.
--
-- ## No data migration is performed on purpose
--
-- Two companies may have had a supplier with the same name, in which case
-- `CREATE UNIQUE INDEX suppliers_name_key` fails with ER_DUP_ENTRY (1062) and this
-- migration aborts **without touching a single row**. That is the intended
-- behaviour: merging those rows deletes duplicates irreversibly, so it is a
-- decision for whoever operates the database, not something to do silently.
--
-- If the index creation fails, list the collisions with:
--
--   SELECT name, COUNT(*) AS copies, COUNT(DISTINCT tenant_id) AS companies
--     FROM suppliers
--    GROUP BY name
--   HAVING COUNT(DISTINCT tenant_id) > 1;
--
-- then keep one row per name (the active one, oldest first), repoint
-- `product_suppliers.supplier_id` to the survivor — deduplicating the links,
-- because the primary key is `(tenant_id, product_id, supplier_id)` — delete the
-- leftovers, and run `npx prisma migrate deploy` again. Back up first: deleting
-- the duplicate rows is not reversible.
--
-- `name` is unique **including soft-deleted rows**. MySQL has no partial indexes,
-- and the global unique key is what keeps "creating a deleted name revives that
-- row" plus the field-level duplicate conflict working.

-- The composite (tenant-safe) foreign key from the product link no longer applies.
ALTER TABLE `product_suppliers` DROP FOREIGN KEY `product_suppliers_tenant_id_supplier_id_fkey`;

-- Unrelated to this change: the two indexes below exist in the database but are
-- not declared in `schema.prisma`, so `prisma migrate diff` proposes dropping
-- them. They are left alone here; removing them is a separate decision.

ALTER TABLE `suppliers` DROP FOREIGN KEY `suppliers_tenant_id_fkey`;

DROP INDEX `suppliers_tenant_id_id_key` ON `suppliers`;
DROP INDEX `suppliers_tenant_id_name_key` ON `suppliers`;

ALTER TABLE `suppliers` DROP COLUMN `tenant_id`;

-- Fails loudly (ER_DUP_ENTRY) when two companies share a supplier name; see the
-- header for the cleanup procedure.
CREATE UNIQUE INDEX `suppliers_name_key` ON `suppliers`(`name`);

-- The link is still tenant-scoped through `tenant_id`/`product_id`; only the
-- supplier reference becomes global.
ALTER TABLE `product_suppliers`
  ADD CONSTRAINT `product_suppliers_supplier_id_fkey`
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
