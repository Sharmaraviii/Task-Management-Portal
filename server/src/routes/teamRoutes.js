import { Router } from 'express';
import { verifyToken, requireRole, requireTeamScope } from '../middleware/auth.js';
import {
  listTeams,
  getTeam,
  createTeam,
  updateTeam,
  addMember,
} from '../controllers/teamController.js';
import { ROLES } from '../config/env.js';

const router = Router();
router.use(verifyToken);

/*
 * GET /            Any authenticated role, but the controller narrows the
 *                  result set by identity: admin sees all teams, a manager
 *                  only the ones they manage, an employee only their own.
 *                  Filtering in the query rather than after the fact means
 *                  data the caller may not see is never loaded at all.
 */
router.get('/', listTeams);

/*
 * GET /:teamId     requireTeamScope is the resource-scoped check: admin
 *                  passes, a manager passes only for a team they manage, an
 *                  employee only for the team they belong to. Everyone else
 *                  gets 403 even with a valid token.
 */
router.get('/:teamId', requireTeamScope('params', 'teamId'), getTeam);

/*
 * POST /           ADMIN only — creating a team decides who will manage it,
 *                  which is a privilege-granting action. The controller
 *                  additionally refuses to appoint a non-MANAGER, otherwise
 *                  team creation would become a way to hand ownership
 *                  powers to an employee.
 *
 * PATCH /:teamId   ADMIN only, same reasoning: reassigning the manager
 *                  transfers authority over every task in the team.
 * POST /:teamId/members  ADMIN only — membership is what the manager's
 *                  authority is scoped by, so employees and managers must
 *                  not be able to edit it.
 */
router.post('/', requireRole(ROLES.ADMIN), createTeam);
router.patch('/:teamId', requireRole(ROLES.ADMIN), updateTeam);
router.post('/:teamId/members', requireRole(ROLES.ADMIN), addMember);

export default router;
