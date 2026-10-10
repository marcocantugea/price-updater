# `POST /api/v1/price-catalog/exports` returns 500 (Prisma P2003) for a Global Administrator — price catalog export is impossible with a global-admin session

## Summary

Clicking **Exportar** in *Catálogo de precios* fails with `500 INTERNAL_ERROR` when the signed-in
account is a **Global Administrator** (a user whose `users.tenant_id` is `NULL`, e.g.
`global.admin@pricesgrid.local`).

The row renders, the price list and the marketplace are selectable, the permission guard passes
(`price-catalog:export` is granted), the payload validates — and then the insert aborts on a
composite foreign key:

```
Foreign key constraint violated: `tenant_id`
PrismaClientKnownRequestError (P2003), modelName: "ExportRequest", field_name: "tenant_id"
```

The export pipeline itself is healthy: the same request issued by a **company-scoped** user
(`tenant.admin@pricesgrid.local`) returns `202 Accepted` and the worker completes the file a few
seconds later. The failure is specific to the global-admin session.

## Environment

| Item | Value |
| --- | --- |
| Deployment | `deployment/docker-compose.yml` (published images `marcocantugea/price-updater-api:1.0.0`, `...-web:1.0.0`) |
| API | `NODE_ENV=production`, `http://localhost:3000` |
| Web | `http://localhost:4200` |
| Database | MySQL 8.0 (container `price-updater-db-1`) |
| Prisma Client | 5.22.0 |
| Build | commit `dbf91df` (branch `marco/linkedin-carrusel`); the export code is unchanged since the initial commit `ee86b49` |
| Account | Global Administrator — `global.admin@pricesgrid.local`, `users.tenant_id = NULL` |
| Company selected in the header | Demo Company — `0f83ed74-e9d8-49b4-bdcc-ba97b0b9034f` |

## Steps to reproduce

1. Log in as `global.admin@pricesgrid.local`.
2. Pick a company in the header (Demo Company) so `X-Tenant-Id` is sent.
3. Go to **Catálogo de precios**, choose a price list and a marketplace (rows load correctly).
4. Press **Exportar**.
5. Observe `POST /api/v1/price-catalog/exports` → `500`.

Minimal reproduction without the UI (the body is byte-for-byte the one the web client sends, 124
bytes, exactly matching the failing request in the container logs):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"global.admin@pricesgrid.local","password":"ChangeMe!123"}' \
  | jq -r .accessToken)

curl -i -X POST http://localhost:3000/api/v1/price-catalog/exports \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Tenant-Id: 0f83ed74-e9d8-49b4-bdcc-ba97b0b9034f' \
  -H 'Content-Type: application/json' \
  -d '{"priceListId":"a09a75ae-484d-49ed-9cc5-547cd00743c2","marketplaceId":"8ebe47d5-6e8d-4ac5-a735-a088f32997da","format":"csv"}'
```

Result:

```
HTTP/1.1 500 Internal Server Error
{"statusCode":500,"code":"INTERNAL_ERROR","message":"Unexpected error",
 "traceId":"7ef26b46-391a-499f-8291-a18276251a11",
 "timestamp":"2026-10-10T02:28:09.499Z"}
```

## Expected behaviour

`202 Accepted` with the queued `ExportRequest`, and the CSV/JSON/TXT produced by the worker — the
same result a company-scoped user gets. A global administrator is explicitly allowed to browse and
export the catalog (`price-catalog:read-all` + `price-catalog:export`, and
`PriceListAccessService.canReadAll()` short-circuits for `isGlobalAdmin`), so this path is meant to
work.

## Actual behaviour

| Actor | `users.tenant_id` | Result |
| --- | --- | --- |
| `tenant.admin@pricesgrid.local` | `0f83ed74-…` | `202 Accepted` → worker → `status=completed`, 413-byte CSV |
| `global.admin@pricesgrid.local` | `NULL` | `500 INTERNAL_ERROR` — Prisma `P2003` on `export_requests` |

## Root cause

`export_requests` is guarded by four **composite** foreign keys, and every one of them
includes `tenant_id`:

```sql
-- prisma/migrations/20260919000200_add_catalog_access_and_exports/migration.sql
ADD CONSTRAINT `export_requests_tenant_id_requested_by_user_id_fkey`
  FOREIGN KEY (`tenant_id`, `requested_by_user_id`) REFERENCES `users`(`tenant_id`, `id`),
ADD CONSTRAINT `export_requests_tenant_id_price_list_id_fkey`
  FOREIGN KEY (`tenant_id`, `price_list_id`) REFERENCES `price_lists`(`tenant_id`, `id`),
ADD CONSTRAINT `export_requests_tenant_id_marketplace_id_fkey`
  FOREIGN KEY (`tenant_id`, `marketplace_id`) REFERENCES `marketplaces`(`tenant_id`, `id`)
```

A global administrator has `tenant_id = NULL`, but the composite key
`(tenant_id, requested_by_user_id)` is built from the **tenant selected in the header** plus the
**global user id**:

`src/backend/prices-api/src/services/export.service.ts`

```ts
async request(tenantId: string, user: AuthUser, input: ExportInput, actor: ActorContext) {
  await this.catalog.assertExportInput(tenantId, user, input.priceListId, input.marketplaceId);
  return this.prisma.exportRequest.create({
    data: {
      ...
      tenantId,                // 0f83ed74-… (company chosen in the header)
      requestedByUserId: user.id, // 7c3c7943-… (a user whose own tenant_id is NULL)
      ...
```

No row in `users` matches `(tenant_id = '0f83ed74-…', id = '7c3c7943-…')`, so MySQL rejects the
insert. Prisma reports the violation against `tenant_id` because that is the leading column of the
offending composite key.

`PriceListAccessService.assertVisible()` passes for the same reason the insert fails: it only
requires a *price list* of that tenant to exist, and it never checks that the requesting user
belongs to the tenant:

```ts
async canReadAll(user: AuthUser): Promise<boolean> {
  return user.isGlobalAdmin || user.permissions.includes('price-catalog:read-all');
}

async assertVisible(tenantId: string, user: AuthUser, priceListId: string): Promise<void> {
  if (await this.canReadAll(user)) {
    const list = await this.prisma.priceList.findFirst({ where: { tenantId, id: priceListId, deletedAt: null } });
    ...
```

Verified with a direct probe inside the running API container — every referenced row **does** exist,
which rules out stale data and confirms the requester is the broken reference:

```
tenant: [{"id":"0f83ed74-…","commercial_name":"Demo Company"}]
user:   [{"id":"7c3c7943-…","tenant_id":null,"email":"global.admin@pricesgrid.local"}]
list:   [{"id":"a09a75ae-…","tenant_id":"0f83ed74-…","name":"Marketplace"}]
market: [{"id":"8ebe47d5-…","tenant_id":"0f83ed74-…","name":"Tienda propia"}]
INSERT_ERR P2003 {"modelName":"ExportRequest","field_name":"tenant_id"}
```

Server log (production, `request_failed`):

```json
{"level":"error","time":"2026-10-10T02:28:09.499Z","service":"prices-api","env":"production",
 "err":{"type":"PrismaClientKnownRequestError",
        "message":"Invalid `prisma.exportRequest.create()` invocation:\n\nForeign key constraint violated: `tenant_id`",
        "code":"P2003","clientVersion":"5.22.0",
        "meta":{"modelName":"ExportRequest","field_name":"tenant_id"}},
 "traceId":"7ef26b46-391a-499f-8291-a18276251a11",
 "method":"POST","path":"/api/v1/price-catalog/exports",
 "statusCode":500,"code":"INTERNAL_ERROR","msg":"request_failed"}
```

## Secondary observations (same root cause / adjacent)

1. **`createdBy` breaks for the same reason.** `createdBy: actor.id` is also a bare user id, and for
   a global admin there is no user row in that tenant. If solution A below is not chosen, this column
   should be persisted as `NULL` with `createdByType: 'system'` for global admins — `ActorContext.id`
   is already declared `string | null` and `SYSTEM_ACTOR` exists in `src/backend/prices-api/src/types/index.ts`.
2. **Raw 500 instead of a typed error.** `error-handler.ts` only maps `AppError`, `ZodError`,
   `SyntaxError` and Prisma `P2002` (unique). `P2003` (foreign key) still falls through to
   `500 INTERNAL_ERROR`, and in production the message is redacted to `"Unexpected error"`, so the UI
   shows a generic toast and the user gets no actionable feedback. Consider mapping `P2003` to a
   `422` with a `code` such as `INVALID_REFERENCE`.
3. **The worker dereferences the nullable requester.** `ExportService.processPending()` builds its
   synthetic user from the row:
   `const workerUser: AuthUser = { id: job.requestedByUserId, … }`. Any fix that makes
   `requested_by_user_id` nullable must teach the worker to handle `null` (it already sets
   `isGlobalAdmin: true` and `permissions: ['price-catalog:read-all']`, so `assertVisible()` will
   still short-circuit, but the object needs a non-null `id` or the field must tolerate `null`).
4. **Front end offers an action that cannot succeed.** `price-catalog.component.ts` gates the export
   button on `canExport()` (the `price-catalog:export` permission only), so a global-admin session is
   invited to press a button that is guaranteed to fail. Either fix the backend, or hide/disable the
   action when no tenant can be resolved.

## Suggested fix

Make the requester reference optional for global administrators and persist the audit actor as the
system when the user has no tenant. Roughly:

- `prisma/schema.prisma`: `requestedByUserId String? @map("requested_by_user_id") @db.VarChar(36)`
  and `requestedByUser User? @relation(fields: [tenantId, requestedByUserId], …)` (migration required).
- `export.service.ts` `request()`: pass `requestedByUserId: user.tenantId ? user.id : null`, and
  `createdBy: user.tenantId ? actor.id : null` with `createdByType: user.tenantId ? actor.type : 'system'`.
- `processPending()`: tolerate a null `requestedByUserId` when building `workerUser`.
- Add a regression test: a global admin with a selected tenant can queue an export.

An alternative that avoids the migration is to store the requesting global admin's own id only when
it belongs to the tenant, and otherwise record the request as tenant-owned/system-audited — but the
nullable column is the honest model, because the requester genuinely has no tenant.

## Acceptance criteria

- [x] A global administrator with a company selected can export the price catalog (CSV, JSON, TXT)
      and receives `202 Accepted`.
- [x] The worker completes the job and the file is downloadable from *Mis exportaciones*.
- [x] A company-scoped user's export keeps working unchanged.
- [x] A regression test covers the global-admin export path.
- [x] Foreign-key violations are no longer surfaced as a bare `500 INTERNAL_ERROR`.

## Status: fixed

Branch `fix/price-catalog-export-global-admin`.

| File | Change |
| --- | --- |
| `src/backend/prices-api/prisma/schema.prisma` | `ExportRequest.requestedByUserId` is now `String?` and `requestedByUser` an optional relation |
| `src/backend/prices-api/prisma/migrations/20261010000100_allow_global_admin_export_requests/migration.sql` | Drops the composite FK, makes the column nullable, re-creates the FK unchanged |
| `src/backend/prices-api/src/services/export.service.ts` | `requesterFields()` stores the requester only when they belong to the company, otherwise `NULL` + `system` audit; `list`/`get` also expose company-owned rows to readers holding `price-catalog:read-all`; the worker no longer dereferences the nullable requester |
| `src/backend/prices-api/src/services/price-catalog.service.ts` | Exposes `canReadAll()` so the export visibility filter shares the one definition |
| `src/backend/prices-api/src/controllers/export.controller.ts` | Passes the user (not just the id) to `list`/`get` |
| `src/backend/prices-api/src/middlewares/error-handler.ts` | Maps Prisma `P2003` to `422 INVALID_REFERENCE` |
| `src/frontend/prices-admin/src/app/core/i18n/catalogs/{en-US,es-419}.json` | `errors.INVALID_REFERENCE` copy in both locales |
| `src/backend/prices-api/tests/unit/export.service.spec.ts` | Regression coverage for the global-admin requester, the visibility filter and the null-requester worker path |
| `src/backend/prices-api/tests/unit/middlewares.spec.ts` | `P2003` → 422 |
| `src/backend/prices-api/tests/integration/catalog-exports.int.spec.ts` | New suite against real MySQL: NULL is accepted, a cross-company requester is still rejected, and the visibility filter behaves |

Verified against a real deployment (Docker Compose stack rebuilt from this branch): a global-admin
`POST /api/v1/price-catalog/exports` answers `202`, the worker completes the job (`requested_by_user_id`
`NULL`, `created_by_type` `system`), the file is downloadable, and a cross-company reference is still
rejected by the database.

Note on visibility: the requester-less row is readable by anyone holding `price-catalog:read-all`
(`global_admin` and, in the seeded roles, `tenant_admin`). A `price_catalog_viewer` — which has
`price-catalog:read` and `price-catalog:export` but not `read-all` — cannot see or download it.

## Workaround for affected users

Sign in with a company-scoped account that has `price-catalog:export` (e.g.
`tenant.admin@pricesgrid.local`) instead of the global administrator account. Superseded by the fix
above.
