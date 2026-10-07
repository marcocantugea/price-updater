import { isValidTimeZone } from './business-date';

/** Reads the company zone once per domain operation, with legacy UTC fallback. */
export async function resolveTenantTimeZone(prisma: any, tenantId: string | null): Promise<string> {
  if (!tenantId) return 'UTC';
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { timeZone: true }
  });
  const timeZone = tenant?.timeZone ?? 'UTC';
  return isValidTimeZone(timeZone) ? timeZone : 'UTC';
}
