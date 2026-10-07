import { env } from '../../../src/config/env';
import { hashPassword } from '../../../src/common/utils/password';
import { DEFAULT_LOCALE, type SupportedLocale } from '../../../src/common/i18n/supported-locales';
import { DEMO_USER_LOCALE } from '../data';

interface DemoUserInput {
  name: string;
  email: string;
  password: string;
  roleId: string;
  tenantId: string | null;
  /** Explicit so the seeded account's language intent is documented. */
  preferredLocale?: SupportedLocale;
}

async function upsertUser(prisma: any, input: DemoUserInput): Promise<any> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const preferredLocale = input.preferredLocale ?? DEFAULT_LOCALE;
  const existing = await prisma.user.findFirst({ where: { email } });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        passwordHash,
        roleId: input.roleId,
        tenantId: input.tenantId,
        preferredLocale,
        status: 'active',
        deletedAt: null
      }
    });
  }

  return prisma.user.create({
    data: {
      name: input.name,
      email,
      passwordHash,
      roleId: input.roleId,
      tenantId: input.tenantId,
      preferredLocale,
      status: 'active',
      createdByType: 'system',
      updatedByType: 'system'
    }
  });
}

export interface DemoUsersResult {
  globalAdmin: any;
  tenantAdmin: any;
}

/**
 * Demo seed: global administrator (`tenant_id = null`) and demo company
 * administrator. Passwords are hashed with bcrypt; never stored in plaintext.
 */
export async function seedDemoUsers(
  prisma: any,
  context: { tenantId: string; roleIds: Record<string, string> }
): Promise<DemoUsersResult> {
  const globalAdmin = await upsertUser(prisma, {
    name: 'Global Administrator',
    email: env.seed.globalAdminEmail,
    password: env.seed.globalAdminPassword,
    roleId: context.roleIds.global_admin,
    tenantId: null,
    preferredLocale: DEMO_USER_LOCALE
  });

  const tenantAdmin = await upsertUser(prisma, {
    name: 'Demo Company Administrator',
    email: env.seed.tenantAdminEmail,
    password: env.seed.tenantAdminPassword,
    roleId: context.roleIds.tenant_admin,
    tenantId: context.tenantId,
    preferredLocale: DEMO_USER_LOCALE
  });

  return { globalAdmin, tenantAdmin };
}
