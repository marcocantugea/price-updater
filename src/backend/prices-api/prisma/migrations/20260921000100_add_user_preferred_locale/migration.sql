-- Per-user UI language (Phase 1 of agent/USER_LANGUAGE_I18N_PLAN.md).
--
-- Additive only: the NOT NULL DEFAULT covers every existing row in place, so no
-- backfill statement is needed and inserts that omit the column keep working.
-- VARCHAR(16) rather than an ENUM: the application owns the locale allowlist
-- (src/common/i18n/supported-locales.ts), so adding a language is a code change
-- instead of a schema migration.
--
-- Manual rollback (destructive, not executed automatically):
--   ALTER TABLE `users` DROP COLUMN `preferred_locale`;
ALTER TABLE `users`
  ADD COLUMN `preferred_locale` VARCHAR(16) NOT NULL DEFAULT 'es-419';
