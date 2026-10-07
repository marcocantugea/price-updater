import {
  PHASE_ONE_SCOPES,
  generateApiKey,
  hashApiKey
} from '../../../src/common/utils/api-key';
import { DEMO_TENANT } from '../data';

export interface DemoApiKeyResult {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  scopes: string[];
  plaintextKey: string;
}

/**
 * Creates a read-only development API key for the demo company.
 * Only the hash is persisted; the plaintext is returned once to the caller
 * (and printed by the CLI) and never stored.
 */
export async function createDemoApiKey(
  prisma: any,
  name = 'Development demo key'
): Promise<DemoApiKeyResult | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: DEMO_TENANT.slug, deletedAt: null }
  });

  if (!tenant) return null;

  const { plaintext, prefix } = generateApiKey();
  const scopes = [...PHASE_ONE_SCOPES];

  const record = await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      name,
      keyHash: hashApiKey(plaintext),
      prefix,
      scopes,
      status: 'active',
      createdByType: 'system',
      updatedByType: 'system'
    }
  });

  return {
    id: record.id,
    tenantId: record.tenantId,
    name: record.name,
    prefix: record.prefix,
    scopes,
    plaintextKey: plaintext
  };
}
