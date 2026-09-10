import { Router } from 'express';
import { verifyToken, requireRole, requireTeamScope } from '../middleware/auth.js';
import { teamProgress, myTeamsProgress, teamWorkload } from '../controllers/reportController.js';
import { ROLES } from '../config/env.js';

const router = Router();
router.use(verifyToken);

/*
 * GET /progress    Any authenticated role. Scope comes from identity inside
 *                  the controller: admin gets every team, a manager gets the
 *                  teams they manage, an employee gets their own team only.
 *                  There is no way to ask for someone else's numbers because
 *                  the endpoint takes no team parameter at all.
 */
router.get('/progress', myTeamsProgress);

/*
 * GET /team/:teamId/progress   requireTeamScope enforces ownership of the
 *                  specific team named in the URL. This is the classic IDOR
 *                  surface — swap the id in the URL for another team's and
 *                  read their data — and the middleware is what closes it.
 */
router.get('/team/:teamId/progress', requireTeamScope('params', 'teamId'), teamProgress);

/*
 * GET /team/:teamId/workload   Per-person breakdown, so it is management
 *                  information: MANAGER or ADMIN role gate, then the same
 *                  ownership check on the specific team. Employees are
 *                  excluded by the role gate — they should not see
 *                  colleagues' workloads.
 */
router.get(
  '/team/:teamId/workload',
  requireRole(ROLES.MANAGER, ROLES.ADMIN),
  requireTeamScope('params', 'teamId'),
  teamWorkload
);

export default router;
