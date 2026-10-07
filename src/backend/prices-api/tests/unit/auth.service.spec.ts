import jwt from 'jsonwebtoken';
import { AuthService, GLOBAL_ADMIN_ROLE } from '../../src/services/auth.service';
import { UnauthorizedError, ValidationError } from '../../src/common/errors';
import { hashPassword } from '../../src/common/utils/password';
import { hashRefreshToken } from '../../src/common/utils/tokens';
import { env } from '../../src/config/env';
import type { IAuthRepository, UserWithRole } from '../../src/repositories/auth.repository';

interface TokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

function createRepository(userRow: UserWithRole | null): { repository: IAuthRepository; tokens: TokenRow[]; mocks: any } {
  const tokens: TokenRow[] = [];

  const repository: any = {
    findUserByEmail: jest.fn().mockResolvedValue(userRow),
    findUserById: jest.fn().mockResolvedValue(userRow),
    findPermissionsByRoleId: jest.fn().mockResolvedValue(['products:read', 'prices:read']),
    touchLastLogin: jest.fn().mockResolvedValue(undefined),
    updateUserPreferences: jest.fn(async (input: { userId: string; preferredLocale: string }) => {
      if (!userRow) return null;
      // Behave like a real store: later reads must observe the new value.
      userRow.preferredLocale = input.preferredLocale;
      return { ...userRow, ...input };
    }),
    createRefreshToken: jest.fn(async (input: any) => {
      const row: TokenRow = {
        id: `rt-${tokens.length + 1}`,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        replacedById: null
      };
      tokens.push(row);
      return row;
    }),
    findRefreshTokenByHash: jest.fn(async (hash: string) => tokens.find((row) => row.tokenHash === hash) ?? null),
    revokeRefreshToken: jest.fn(async (id: string, replacedById?: string | null) => {
      const row = tokens.find((token) => token.id === id);
      if (row) {
        row.revokedAt = new Date();
        row.replacedById = replacedById ?? null;
      }
    }),
    revokeAllUserRefreshTokens: jest.fn().mockResolvedValue(2)
  };

  return { repository, tokens, mocks: repository };
}

async function buildUser(overrides: Partial<UserWithRole> = {}): Promise<UserWithRole> {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: await hashPassword('secret-password'),
    roleId: 'role-1',
    status: 'active',
    preferredLocale: 'es-419',
    deletedAt: null,
    role: { id: 'role-1', slug: 'tenant_admin', name: 'Tenant admin', isSystem: true, status: 'active' },
    ...overrides
  };
}

describe('AuthService.login', () => {
  it('issues an access token, a refresh token and the user context', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('Admin@Example.com', 'secret-password');

    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user).toMatchObject({
      id: 'user-1',
      email: 'admin@example.com',
      roleSlug: 'tenant_admin',
      tenantId: 'tenant-1',
      isGlobalAdmin: false,
      preferredLocale: 'es-419'
    });
    expect(session.user.permissions).toEqual(['products:read', 'prices:read']);

    // Email is normalized before lookup.
    expect(repository.findUserByEmail).toHaveBeenCalledWith('admin@example.com');
  });

  it('embeds sub/tenantId/role in the access token', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    const payload = jwt.verify(session.accessToken, env.jwt.accessSecret) as any;

    expect(payload.sub).toBe('user-1');
    expect(payload.tenantId).toBe('tenant-1');
    expect(payload.role).toBe('tenant_admin');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('never signs the locale into the JWT (it is presentation, not authorization)', async () => {
    const userRow = await buildUser({ preferredLocale: 'en-US' });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    const payload = jwt.verify(session.accessToken, env.jwt.accessSecret) as any;

    expect(payload.preferredLocale).toBeUndefined();
    expect(payload.locale).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('en-US');
    // ...but the response body does carry it.
    expect(session.user.preferredLocale).toBe('en-US');
  });

  it('falls back to es-419 when the stored value is missing or unknown', async () => {
    for (const stored of [undefined, null, '', 'es-MX', 'fr-FR', 42 as any]) {
      const userRow = await buildUser({ preferredLocale: stored });
      const { repository } = createRepository(userRow);
      const service = new AuthService(repository);

      const session = await service.login('admin@example.com', 'secret-password');
      expect(session.user.preferredLocale).toBe('es-419');
    }
  });

  it('flags the global admin role and its null tenant', async () => {
    const userRow = await buildUser({
      tenantId: null,
      role: { id: 'role-g', slug: GLOBAL_ADMIN_ROLE, name: 'Global', isSystem: true, status: 'active' }
    });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    expect(session.user.isGlobalAdmin).toBe(true);
    expect(session.user.tenantId).toBeNull();
  });

  it('stores only the refresh token hash', async () => {
    const userRow = await buildUser();
    const { repository, tokens } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');

    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(hashRefreshToken(session.refreshToken));
    expect(tokens[0].tokenHash).not.toBe(session.refreshToken);
  });

  it('updates last_login_at', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    await service.login('admin@example.com', 'secret-password');
    expect(mocks.touchLastLogin).toHaveBeenCalledWith('user-1');
  });

  it('rejects unknown users with the same generic error', async () => {
    const { repository } = createRepository(null);
    const service = new AuthService(repository);

    await expect(service.login('nobody@example.com', 'x')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    });
  });

  it('rejects a wrong password', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.login('admin@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an inactive user', async () => {
    const userRow = await buildUser({ status: 'inactive' });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.login('admin@example.com', 'secret-password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    });
  });
});

describe('AuthService.refresh', () => {
  it('rotates the refresh token and revokes the previous one', async () => {
    const userRow = await buildUser();
    const { repository, tokens, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    const second = await service.refresh(first.refreshToken);

    expect(second.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].revokedAt).toBeInstanceOf(Date);
    expect(tokens[0].replacedById).toBe(tokens[1].id);
    expect(mocks.revokeRefreshToken).toHaveBeenCalled();
  });

  it('rejects an unknown refresh token', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.refresh('not-a-real-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN'
    });
  });

  it('detects reuse of a revoked token and invalidates the family', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    await service.refresh(first.refreshToken);

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED'
    });
    expect(mocks.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-1');
  });

  it('rejects an expired refresh token', async () => {
    const userRow = await buildUser();
    const { repository, tokens } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    tokens[0].expiresAt = new Date('2000-01-01');

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_EXPIRED'
    });
  });

  it('rejects when the user is no longer active', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    mocks.findUserById.mockResolvedValue(await buildUser({ status: 'inactive' }));

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });

  it('does not rotate refresh tokens when only the locale changed', async () => {
    const userRow = await buildUser({ preferredLocale: 'en-US' });
    const { repository, tokens } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    expect(first.user.preferredLocale).toBe('en-US');
    const before = tokens.length;

    await service.updatePreferences('user-1', 'es-419');

    expect(tokens).toHaveLength(before);
    expect(tokens[0].revokedAt).toBeFalsy();
    // The existing refresh token still works and now reports the new locale.
    const refreshed = await service.refresh(first.refreshToken);
    expect(refreshed.user.preferredLocale).toBe('es-419');
  });
});

describe('AuthService.logout', () => {
  it('revokes the presented refresh token', async () => {
    const userRow = await buildUser();
    const { repository, tokens, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    await service.logout(session.refreshToken);

    expect(tokens[0].revokedAt).toBeInstanceOf(Date);
    expect(mocks.revokeRefreshToken).toHaveBeenCalled();
  });

  it('is a no-op without a token', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    await service.logout(null);
    await service.logout(undefined);
    expect(mocks.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown token', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    await service.logout('unknown');
    expect(mocks.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('does not revoke twice', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    await service.logout(session.refreshToken);
    mocks.revokeRefreshToken.mockClear();
    await service.logout(session.refreshToken);
    expect(mocks.revokeRefreshToken).not.toHaveBeenCalled();
  });
});

describe('AuthService.me', () => {
  it('returns the user context', async () => {
    const userRow = await buildUser({ preferredLocale: 'en-US' });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.me('user-1')).resolves.toMatchObject({
      id: 'user-1',
      roleSlug: 'tenant_admin',
      preferredLocale: 'en-US'
    });
  });

  it('rejects an inactive user', async () => {
    const userRow = await buildUser({ status: 'inactive' });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.me('user-1')).rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });
});

describe('AuthService.updatePreferences', () => {
  it('persists the locale and returns a complete AuthUser', async () => {
    const userRow = await buildUser({ preferredLocale: 'es-419' });
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const updated = await service.updatePreferences('user-1', 'en-US');

    expect(mocks.updateUserPreferences).toHaveBeenCalledWith({
      userId: 'user-1',
      preferredLocale: 'en-US'
    });
    // The whole context comes back, not just the changed field.
    expect(updated).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      roleId: 'role-1',
      roleSlug: 'tenant_admin',
      tenantId: 'tenant-1',
      isGlobalAdmin: false,
      permissions: ['products:read', 'prices:read'],
      preferredLocale: 'en-US'
    });
  });

  it('lets a global administrator with no selected company change their language', async () => {
    const userRow = await buildUser({
      tenantId: null,
      role: { id: 'role-g', slug: GLOBAL_ADMIN_ROLE, name: 'Global', isSystem: true, status: 'active' }
    });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const updated = await service.updatePreferences('user-1', 'en-US');

    expect(updated.isGlobalAdmin).toBe(true);
    expect(updated.tenantId).toBeNull();
    expect(updated.preferredLocale).toBe('en-US');
  });

  it('rejects an unsupported locale without touching the repository', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    for (const rejected of ['es', 'en', 'es-MX', 'fr-FR', '', null, undefined, 42]) {
      await expect(service.updatePreferences('user-1', rejected as any)).rejects.toBeInstanceOf(
        ValidationError
      );
    }

    // Defense in depth: nothing was written.
    expect(mocks.updateUserPreferences).not.toHaveBeenCalled();
  });

  it('exposes a stable, parameterized detail on rejection', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.updatePreferences('user-1', 'es-MX')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        {
          field: 'preferredLocale',
          code: 'UNSUPPORTED_LOCALE',
          params: { allowed: ['es-419', 'en-US'] }
        }
      ]
    });
  });

  it('rejects a user that no longer exists', async () => {
    const { repository, mocks } = createRepository(null);
    const service = new AuthService(repository);
    mocks.updateUserPreferences.mockResolvedValue(null);

    await expect(service.updatePreferences('ghost', 'en-US')).rejects.toMatchObject({
      code: 'USER_INACTIVE'
    });
  });

  it('rejects a user that became inactive', async () => {
    const userRow = await buildUser({ status: 'inactive' });
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);
    mocks.updateUserPreferences.mockResolvedValue(await buildUser({ status: 'inactive' }));

    await expect(service.updatePreferences('user-1', 'en-US')).rejects.toMatchObject({
      code: 'USER_INACTIVE'
    });
  });
});

describe('AuthService.verifyAccessToken', () => {
  it('validates a token signed with the access secret', async () => {
    const userRow = await buildUser({ preferredLocale: 'en-US' });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const token = jwt.sign({ sub: 'user-1', tenantId: 'tenant-1', role: 'tenant_admin' }, env.jwt.accessSecret, {
      expiresIn: '5m'
    });

    // The middleware reloads the user, so the locale always reflects the
    // current database value even though it is not in the token.
    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      id: 'user-1',
      preferredLocale: 'en-US'
    });
  });

  it('rejects a malformed or foreign token', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.verifyAccessToken('garbage')).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN'
    });

    const foreign = jwt.sign({ sub: 'user-1' }, 'another-secret');
    await expect(service.verifyAccessToken(foreign)).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN'
    });
  });

  it('rejects when the user no longer exists', async () => {
    const { repository } = createRepository(null);
    const service = new AuthService(repository);
    const token = jwt.sign({ sub: 'ghost', tenantId: null, role: 'tenant_user' }, env.jwt.accessSecret, {
      expiresIn: '5m'
    });

    await expect(service.verifyAccessToken(token)).rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });
});
