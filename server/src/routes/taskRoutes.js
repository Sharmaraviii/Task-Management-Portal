import { Router } from 'express';
import {
  verifyToken,
  requireRole,
  requireTeamScope,
  loadTask,
  requireTaskRead,
  requireTaskWrite,
  requireTaskParticipation,
} from '../middleware/auth.js';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
  addComment,
  deleteTask,
} from '../controllers/taskController.js';
import { ROLES } from '../config/env.js';

const router = Router();

// Everything below this line requires a valid, non-expired access token
// belonging to an active user. Applied once at the router level so no route
// added later can accidentally be left public.
router.use(verifyToken);

/*
 * AUTHORISATION DECISION PER ENDPOINT
 *
 * GET /            Any authenticated role. There is no ownership middleware
 *                  because there is no single resource to own — instead the
 *                  controller builds the filter from req.user, so the scope
 *                  is enforced by what the query can return. Employees get
 *                  their own tasks, managers their teams', admins all.
 */
router.get('/', listTasks);

/*
 * POST /           MANAGER or ADMIN (role gate), AND the caller must be
 *                  entitled to the team named in the body (resource gate).
 *                  Note requireTeamScope reads from 'body' here — the team
 *                  arrives as a field, not a URL parameter. The controller
 *                  then adds a third check: the assignee must belong to that
 *                  team. Role, team ownership, and assignment validity are
 *                  three separate concerns and are checked separately.
 */
router.post(
  '/',
  requireRole(ROLES.MANAGER, ROLES.ADMIN),
  requireTeamScope('body', 'teamId'),
  createTask
);

/*
 * GET /:id         loadTask fetches the record, then requireTaskRead decides
 *                  against that record: admin always, manager if the task's
 *                  team is one they manage, employee only if it is assigned
 *                  to them. No role gate — the resource check subsumes it.
 */
router.get('/:id', loadTask, requireTaskRead, getTask);

/*
 * PATCH /:id       The endpoint from the brief. requireTaskWrite: admin
 *                  anywhere, manager only within a team they own, employee
 *                  never. A manager with a perfectly valid token patching a
 *                  task in someone else's team is rejected with 403 before
 *                  the handler runs. The role gate in front is a cheap
 *                  pre-filter so employee requests never reach a DB lookup.
 */
router.patch(
  '/:id',
  requireRole(ROLES.MANAGER, ROLES.ADMIN),
  loadTask,
  requireTaskWrite,
  updateTask
);

/*
 * PATCH /:id/status  Separate route precisely because the permission is
 *                  different and wider than PATCH /:id. The assignee may
 *                  move their own task's status; they still may not touch
 *                  any other field. Expressing that as its own route with
 *                  requireTaskParticipation keeps the rule declarative
 *                  instead of an `if (role === EMPLOYEE)` branch buried in
 *                  the update handler.
 */
router.patch('/:id/status', loadTask, requireTaskParticipation, updateTaskStatus);

/*
 * POST /:id/comments  Same permission as status: anyone entitled to see the
 *                  task may discuss it.
 */
router.post('/:id/comments', loadTask, requireTaskParticipation, addComment);

/*
 * DELETE /:id      Destructive, so the strictest gate: same as PATCH /:id.
 */
router.delete(
  '/:id',
  requireRole(ROLES.MANAGER, ROLES.ADMIN),
  loadTask,
  requireTaskWrite,
  deleteTask
);

export default router;
