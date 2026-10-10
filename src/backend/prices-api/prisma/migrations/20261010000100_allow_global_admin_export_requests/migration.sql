-- Allow an export to be requested by a user who does not belong to the exported
-- company.
--
-- `export_requests` guards the requester with the composite foreign key
-- `(tenant_id, requested_by_user_id) -> users(tenant_id, id)`, which encodes
-- "the requesting user belongs to this company". A global administrator breaks
-- that assumption: `users.tenant_id` is NULL and the company is the one selected
-- in the `X-Tenant-Id` header, so the pair
-- `(selected tenant, global admin id)` matches no row in `users`. Every export
-- requested from a global-admin session failed with
-- `Foreign key constraint violated: tenant_id` (Prisma P2003) and surfaced as an
-- opaque 500.
--
-- Making the column nullable is the honest model: when the requester belongs to
-- the company the id is stored as before, and when it does not the column is
-- NULL and the audit columns (`created_by`/`created_by_type`) record the queued
-- request as `system`.
--
-- MySQL does not enforce a foreign key whose columns are all NULL, and the index
-- on `(tenant_id, requested_by_user_id, created_at)` is unaffected. No data
-- migration is required: existing rows keep their requester.
--
-- The worker reads `requested_by_user_id` to build its actor, so it must tolerate
-- NULL from this version on (see `ExportService.processPending`).

-- The column cannot be altered while the composite foreign key uses it.
ALTER TABLE `export_requests`
  DROP FOREIGN KEY `export_requests_tenant_id_requested_by_user_id_fkey`;

ALTER TABLE `export_requests`
  MODIFY `requested_by_user_id` VARCHAR(36) NULL;

-- Re-created unchanged: it still guarantees that a stored requester belongs to
-- the company that owns the export request.
ALTER TABLE `export_requests`
  ADD CONSTRAINT `export_requests_tenant_id_requested_by_user_id_fkey`
    FOREIGN KEY (`tenant_id`, `requested_by_user_id`) REFERENCES `users`(`tenant_id`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
