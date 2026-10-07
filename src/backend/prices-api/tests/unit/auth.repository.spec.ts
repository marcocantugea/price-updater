import { PrismaAuthRepository } from '../../src/repositories/auth.repository';
import { createFakePrisma } from '../helpers/fake-prisma';

function build() {
  const prisma = createFakePrisma({
    tenant: [{ id: 'tenant-1', commercialName: 'Demo Company', slug: 'demo-company' }],
    role: [{ id: 'role-1', slug: 'tenant_admin', name: 'Tenant admin', isSystem: true, status: 'active' }],
    permission: [
      { id: 'perm-1', slug: 'products:read' },
      { id: 'perm-2', slug: 'prices:read' }
    ],
    rolePermission: [
      { roleId: 'role-1', permissionId: 'perm-1' },
      { roleId: 'role-1', permissionId: 'perm-2' }
    ],
    user: [
      {
        id: 'user-1',
        tenantId: 'tenant-1',
        name: 'Admin',
        email: 'admin@example.com',
        passwordHash: 'hash',
        roleId: 'role-1',
        status: 'active',
        preferredLocale: 'es-419',
        deletedAt: null
      },
      {
        id: 'user-2',
        tenantId: 'tenant-1',
        name: 'Deleted',
        email: 'deleted@example.com',
        passwordHash: 'hash',
        roleId: 'role-1',
        status: 'inactive',
        preferredLocale: 'en-US',
        deletedAt: new Date('2024-01-01')
      },
      {
        // Simulates a legacy row written before the column existed.
        id: 'user-3',
        tenantId: 'tenant-1',
        name: 'Legacy',
        email: 'legacy@example.com',
        passwordHash: 'hash',
        roleId: 'role-1',
        status: 'active',
        deletedAt: null
      }
    ],
    refreshToken: []
  });

  return { prisma, repository: new PrismaAuthRepository(prisma) };
}

describe('PrismaAuthRepository', () => {
  it('finds an active user by email, excluding soft-deleted rows', async () => {
    const { repository } = build();

    const found = await repository.findUserByEmail('admin@example.com');
    expect(found).toMatchObject({ id: 'user-1', email: 'admin@example.com' });
    expect(found?.role.slug).toBe('tenant_admin');
    expect(found?.tenant?.commercialName).toBe('Demo Company');

    await expect(repository.findUserByEmail('deleted@example.com')).resolves.toBeNull();
  });

  it('finds a user by id', async () => {
    const { repository } = build();
    await expect(repository.findUserById('user-1')).resolves.toMatchObject({ id: 'user-1' });
    await expect(repository.findUserById('missing')).resolves.toBeNull();
  });

  it('reads the stored preferred locale, including a legacy row with no value', async () => {
    const { repository } = build();

    expect((await repository.findUserById('user-1'))?.preferredLocale).toBe('es-419');
    // A row written before the column existed has no value at all; the service
    // layer is responsible for defaulting it.
    expect((await repository.findUserById('user-3'))?.preferredLocale).toBeUndefined();
  });

  it('updates only the requested user locale, writing the audit columns', async () => {
    const { prisma, repository } = build();

    const updated = await repository.updateUserPreferences({
      userId: 'user-1',
      preferredLocale: 'en-US'
    });

    // The returned row is re-read with role/tenant so a full AuthUser can be built.
    expect(updated).toMatchObject({
      id: 'user-1',
      preferredLocale: 'en-US',
      updatedBy: 'user-1',
      updatedByType: 'user'
    });
    expect(updated?.role.slug).toBe('tenant_admin');
    expect(updated?.tenant?.commercialName).toBe('Demo Company');

    // Only the target row changed.
    expect(prisma.__store.user.find((row: any) => row.id === 'user-1').preferredLocale).toBe('en-US');
    expect(prisma.__store.user.find((row: any) => row.id === 'user-2').preferredLocale).toBe('en-US');
    expect(prisma.__store.user.find((row: any) => row.id === 'user-3').preferredLocale).toBeUndefined();
  });

  it('leaves refresh tokens alone when the locale changes', async () => {
    const { prisma, repository } = build();
    await repository.createRefreshToken({
      userId: 'user-1',
      tokenHash: 'hash-locale',
      expiresAt: new Date(Date.now() + 86_400_000)
    });

    await repository.updateUserPreferences({ userId: 'user-1', preferredLocale: 'en-US' });

    const tokens = prisma.__store.refreshToken.filter((row: any) => row.userId === 'user-1');
    expect(tokens).toHaveLength(1);
    // Not revoked: the session survives a language change.
    expect(tokens[0].revokedAt).toBeFalsy();
  });

  it('returns null for a missing or soft-deleted user', async () => {
    const { repository } = build();

    await expect(
      repository.updateUserPreferences({ userId: 'does-not-exist', preferredLocale: 'en-US' })
    ).resolves.toBeNull();
    // user-2 is soft-deleted, so it is not a valid preference target.
    await expect(
      repository.updateUserPreferences({ userId: 'user-2', preferredLocale: 'en-US' })
    ).resolves.toBeNull();
  });

  it('loads the permission slugs of a role', async () => {
    const { repository } = build();
    const permissions = await repository.findPermissionsByRoleId('role-1');
    expect(permissions.sort()).toEqual(['prices:read', 'products:read']);
  });

  it('returns an empty list for a role without permissions', async () => {
    const { repository } = build();
    await expect(repository.findPermissionsByRoleId('role-empty')).resolves.toEqual([]);
  });

  it('stamps last login', async () => {
    const { prisma, repository } = build();
    await repository.touchLastLogin('user-1');

    expect(prisma.__store.user.find((row: any) => row.id === 'user-1').lastLoginAt).toBeInstanceOf(Date);
  });

  it('creates and finds refresh tokens by hash', async () => {
    const { repository } = build();
    const expiresAt = new Date(Date.now() + 86_400_000);

    const created = await repository.createRefreshToken({
      userId: 'user-1',
      tokenHash: 'hash-value',
      expiresAt,
      userAgent: 'jest',
      ip: '127.0.0.1'
    });

    expect(created).toMatchObject({ userId: 'user-1', tokenHash: 'hash-value' });
    expect(created.revokedAt).toBeUndefined();
    await expect(repository.findRefreshTokenByHash('hash-value')).resolves.toMatchObject({ id: created.id });
    await expect(repository.findRefreshTokenByHash('nope')).resolves.toBeNull();
  });

  it('revokes a single token, recording its replacement', async () => {
    const { prisma, repository } = build();
    const created = await repository.createRefreshToken({
      userId: 'user-1',
      tokenHash: 'hash-a',
      expiresAt: new Date(Date.now() + 1000)
    });

    await repository.revokeRefreshToken(created.id, 'replacement-id');

    const stored = prisma.__store.refreshToken.find((row: any) => row.id === created.id);
    expect(stored.revokedAt).toBeInstanceOf(Date);
    expect(stored.replacedById).toBe('replacement-id');
  });

  it('revokes every active token of a user (reuse detection)', async () => {
    const { prisma, repository } = build();

    await repository.createRefreshToken({ userId: 'user-1', tokenHash: 'a', expiresAt: new Date(Date.now() + 1000) });
    await repository.createRefreshToken({ userId: 'user-1', tokenHash: 'b', expiresAt: new Date(Date.now() + 1000) });
    await repository.createRefreshToken({ userId: 'other', tokenHash: 'c', expiresAt: new Date(Date.now() + 1000) });

    const count = await repository.revokeAllUserRefreshTokens('user-1');

    expect(count).toBe(2);
    expect(
      prisma.__store.refreshToken.filter((row: any) => row.userId === 'user-1' && row.revokedAt).length
    ).toBe(2);
    expect(
      prisma.__store.refreshToken.filter((row: any) => row.userId === 'other' && row.revokedAt).length
    ).toBe(0);
  });
});
