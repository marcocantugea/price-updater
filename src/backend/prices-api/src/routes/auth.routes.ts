import { Router } from 'express';
import { container } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { validate } from '../middlewares/validate';
import { loginSchema, updatePreferencesSchema } from '../validators/access.validators';
import { createJwtAuthMiddleware } from '../middlewares/auth';
import type { AuthController } from '../controllers/auth.controller';
import type { AuthService } from '../services/auth.service';

export function createAuthRouter(): Router {
  const router = Router();
  const controller = container.resolve<AuthController>(TOKENS.AuthController);
  const authService = container.resolve<AuthService>(TOKENS.AuthService);
  const jwtAuth = createJwtAuthMiddleware(authService);

  router.post('/login', validate(loginSchema), controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', jwtAuth, controller.me);
  // Self-service preferences: JWT only. Deliberately mounted WITHOUT
  // resolveTenant/requireTenantContext and without a RBAC permission so a
  // global administrator with no selected company can use it too.
  router.patch('/me/preferences', jwtAuth, validate(updatePreferencesSchema), controller.updatePreferences);

  return router;
}
