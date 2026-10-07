import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requirePermission } from '../../middlewares/auth';
import type { CrudRouterOptions, ReadOnlyRouterOptions } from './types';

function permissionGuard(permission?: string): RequestHandler[] {
  return permission ? [requirePermission(permission)] : [];
}

/** Wires a CRUD controller into Express routes with its guards/validators. */
export function createCrudRouter({
  controller,
  guards,
  permissions = {},
  createValidators = [],
  updateValidators = []
}: CrudRouterOptions): Router {
  const router = Router();

  router.get('/', ...guards, ...permissionGuard(permissions.read), controller.list);
  router.get('/:id', ...guards, ...permissionGuard(permissions.read), controller.get);
  router.post('/', ...guards, ...permissionGuard(permissions.create), ...createValidators, controller.create);
  router.patch('/:id', ...guards, ...permissionGuard(permissions.update), ...updateValidators, controller.update);
  router.delete('/:id', ...guards, ...permissionGuard(permissions.delete), controller.remove);

  return router;
}

/** Read-only resources (currencies, permissions, price history in phase 1). */
export function createReadOnlyRouter({
  controller,
  guards,
  readPermission
}: ReadOnlyRouterOptions): Router {
  const router = Router();

  router.get('/', ...guards, ...permissionGuard(readPermission), controller.list);
  router.get('/:id', ...guards, ...permissionGuard(readPermission), controller.get);

  return router;
}
