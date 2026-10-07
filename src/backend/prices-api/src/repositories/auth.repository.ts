export interface UserWithRole {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  passwordHash: string;
  roleId: string;
  status: string;
  /** Raw column value; mapped through `normalizeStoredLocale` when read. */
  preferredLocale?: string | null;
  deletedAt: Date | null;
  role: {
    id: string;
    slug: string;
    name: string;
    isSystem: boolean;
    status: string;
  };
  tenant?: { id: string; commercialName: string; slug: string } | null;
}

export interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

/** Self-service locale write. The user id always comes from the access token. */
export interface UpdateUserPreferencesInput {
  userId: string;
  preferredLocale: string;
}

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<UserWithRole | null>;
  findUserById(id: string): Promise<UserWithRole | null>;
  findPermissionsByRoleId(roleId: string): Promise<string[]>;
  touchLastLogin(userId: string): Promise<void>;
  updateUserPreferences(input: UpdateUserPreferencesInput): Promise<UserWithRole | null>;
  createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshTokenRow>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null>;
  revokeRefreshToken(id: string, replacedById?: string | null): Promise<void>;
  revokeAllUserRefreshTokens(userId: string): Promise<number>;
}

const userInclude = {
  role: { select: { id: true, slug: true, name: true, isSystem: true, status: true } },
  tenant: { select: { id: true, commercialName: true, slug: true } }
};

export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: any) {}

  async findUserByEmail(email: string): Promise<UserWithRole | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: userInclude
    });
  }

  async findUserById(id: string): Promise<UserWithRole | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude
    });
  }

  async findPermissionsByRoleId(roleId: string): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: { select: { slug: true } } }
    });
    return rows.map((row: any) => row.permission.slug);
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    });
  }

  /**
   * Writes the locale of a single user. The id is never taken from the client
   * payload, and the record is re-read with the role/tenant relations so the
   * caller can build a complete `AuthUser`.
   *
   * Deliberately does not touch refresh tokens: changing the UI language must
   * not revoke or rotate the session.
   */
  async updateUserPreferences(input: UpdateUserPreferencesInput): Promise<UserWithRole | null> {
    const existing = await this.prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null }
    });
    if (!existing) return null;

    return this.prisma.user.update({
      where: { id: input.userId },
      data: {
        preferredLocale: input.preferredLocale,
        updatedBy: input.userId,
        updatedByType: 'user'
      },
      include: userInclude
    });
  }

  async createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshTokenRow> {
    return this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null
      }
    });
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async revokeRefreshToken(id: string, replacedById?: string | null): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById: replacedById ?? null }
    });
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return result.count ?? 0;
  }
}
