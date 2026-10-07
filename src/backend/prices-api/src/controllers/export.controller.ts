import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { toPlain } from '../common/utils/serialize';
import { requireTenant } from '../common/crud/controller';
import { UnauthorizedError } from '../common/errors';
import type { ExportService } from '../services/export.service';
import type { RequestContext } from '../types';

function user(req: Request) {
  const value = (req as RequestContext).user;
  if (!value) throw new UnauthorizedError();
  return value;
}

@injectable()
export class ExportController {
  constructor(@inject(TOKENS.ExportService) private readonly service: ExportService) {}

  create = asyncHandler(async (req: Request, res: Response) => {
    const current = user(req);
    res.status(202).json(
      toPlain(await this.service.request(requireTenant(req), current, req.body, { id: current.id, type: 'user' }))
    );
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.service.list(requireTenant(req), user(req).id)));
  });

  get = asyncHandler(async (req: Request, res: Response) => {
    res.json(toPlain(await this.service.get(requireTenant(req), user(req).id, String(req.params.id))));
  });

  download = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.service.download(requireTenant(req), user(req), String(req.params.id));
    res.setHeader('Content-Type', result.row.contentType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${result.row.fileName ?? 'export'}"`);
    res.send(result.content);
  });
}
