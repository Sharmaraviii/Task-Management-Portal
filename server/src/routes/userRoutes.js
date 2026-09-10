import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.js';
import {
  listUsers,
  listAssignableUsers,
  createUser,
  updateUser,
  setUserActive,
} from '../controllers/userController.js';
import { ROLES } from '../config/env.js';

const router = Router();
router.use(verifyToken);

/*
 * GET /assignable  MANAGER or ADMIN. No resource-scoped middleware because
 *                  there is no single resource — instead the controller
 *                  derives the team filter from req.user, so a manager can
 *                  only ever receive members of teams they manage. Declared
 *                  before '/' so the literal path is not swallowed by a
 *                  parameterised route.
 */
router.get('/assignable', requireRole(ROLES.MANAGER, ROLES.ADMIN), listAssignableUsers);

/*
 * GET /            ADMIN only — the full user directory is admin data.
 * POST /           ADMIN only: it is the one route that may set `role`, so
 *                  it is the privilege-escalation surface of the whole API.
 *                  Self-registration deliberately lives in authRoutes and
 *                  ignores any role sent by the client.
 * PATCH /:id       ADMIN only — can change role and team membership, i.e.
 *                  can redraw the authorisation boundaries themselves.
 * PATCH /:id/deactivate  ADMIN only. Soft delete plus token revocation.
 */
router.get('/', requireRole(ROLES.ADMIN), listUsers);
router.post('/', requireRole(ROLES.ADMIN), createUser);
router.patch('/:id', requireRole(ROLES.ADMIN), updateUser);
router.patch('/:id/deactivate', requireRole(ROLES.ADMIN), setUserActive);

export default router;
