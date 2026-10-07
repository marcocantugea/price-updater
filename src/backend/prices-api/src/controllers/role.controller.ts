import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { paramId, requireActor, requireTenant } from '../common/crud/controller';
import type { RoleService } from '../services/role.service';

@injectable()
export class RoleController {
  constructor(@inject(TOKENS.RoleService) private readonly roleService: RoleService) {}

  permissions = asyncHandler(async (req: Request, res: Response) => {
    const slugs = await this.roleService.permissions(requireTenant(req), paramId(req));
    res.json({ permissionSlugs: slugs });
  });

  assignPermissions = asyncHandler(async (req: Request, res: Response) => {
    const slugs = (req.body?.permissionSlugs ?? []) as string[];
    const result = await this.roleService.assignPermissions(
      requireTenant(req),
      paramId(req),
      slugs,
      requireActor(req)
    );
    res.json({ permissionSlugs: result });
  });
}
