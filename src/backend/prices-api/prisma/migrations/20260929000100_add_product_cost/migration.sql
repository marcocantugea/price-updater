-- Current product cost (TEC-28).
--
-- Additive only: the column is NULLable with no default, so every existing row
-- receives `cost = NULL` in place. There is deliberately NO backfill:
--
--   * `NULL` means "the cost has not been captured yet".
--   * `0` is a real, known zero cost. The two states must never be conflated,
--     so the migration must not infer a cost from `base_price`, copy a selling
--     price, or substitute zero. Doing so would fabricate financial data.
--
-- The cost is expressed in the product's own `currency_code`; there is no
-- `cost_currency_code` column and no conversion is performed by the API.
--
-- Manual rollback (destructive, not executed automatically):
--   ALTER TABLE `products` DROP CHECK `products_cost_nonnegative`;
--   ALTER TABLE `products` DROP COLUMN `cost`;
-- Rolling the application back does NOT require dropping the column: the
-- previous backend simply ignores the extra nullable column.
--
-- MAINTENANCE NOTE: Prisma cannot express a CHECK constraint in schema.prisma,
-- so this constraint is invisible to the schema. A future `prisma migrate dev`
-- may therefore report it as drift and propose dropping it. Keep the constraint:
-- it is intentional defense in depth, and removing it would silently allow
-- negative costs written by anything bypassing the API validators.
ALTER TABLE `products`
  ADD COLUMN `cost` DECIMAL(12, 2) NULL;

ALTER TABLE `products`
  ADD CONSTRAINT `products_cost_nonnegative`
  CHECK (`cost` IS NULL OR `cost` >= 0);
