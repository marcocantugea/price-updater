ALTER TABLE `tenants`
  ADD COLUMN `time_zone` VARCHAR(64) NOT NULL DEFAULT 'UTC';

ALTER TABLE `prices`
  MODIFY `start_date` DATE NOT NULL,
  MODIFY `end_date` DATE NULL;

ALTER TABLE `discounts`
  MODIFY `start_date` DATE NOT NULL,
  MODIFY `end_date` DATE NULL;
