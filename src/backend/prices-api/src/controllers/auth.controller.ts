import { inject, injectable } from 'tsyringe';
import type { Request, Response } from 'express';
import { TOKENS } from '../di/tokens';
import { asyncHandler } from '../common/utils/async-handler';
import { toPlain } from '../common/utils/serialize';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../common/utils/cookies';
import { UnauthorizedError } from '../common/errors';
import type { AuthService } from '../services/auth.service';
import type { RequestContext } from '../types';

@injectable()
export class AuthController {
  constructor(@inject(TOKENS.AuthService) private readonly authService: AuthService) {}

  private meta(req: Request) {
    return { userAgent: req.header('user-agent') ?? null, ip: req.ip ?? null };
  }

  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    const session = await this.authService.login(String(email), String(password), this.meta(req));
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    res.json({ accessToken: session.accessToken, user: toPlain(session.user) });
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const token = readRefreshCookie(req);
    if (!token) throw new UnauthorizedError('Refresh token cookie is missing', 'REFRESH_TOKEN_MISSING');

    const session = await this.authService.refresh(token, this.meta(req));
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    res.json({ accessToken: session.accessToken, user: toPlain(session.user) });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    await this.authService.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
    res.status(204).send();
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestContext).user;
    if (!user) throw new UnauthorizedError();
    res.json(toPlain(await this.authService.me(user.id)));
  });

  /**
   * Self-service UI language update for the authenticated user.
   *
   * The target user always comes from the verified access token — never from
   * the body or the route — so a caller cannot change somebody else's
   * preference. No tenant context and no RBAC permission are required.
   */
  updatePreferences = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestContext).user;
    if (!user) throw new UnauthorizedError();

    const { preferredLocale } = req.body ?? {};
    res.json(toPlain(await this.authService.updatePreferences(user.id, preferredLocale)));
  });
}
