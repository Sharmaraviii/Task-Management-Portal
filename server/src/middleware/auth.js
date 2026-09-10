import { User } from '../models/User.js';
import { Team } from '../models/Team.js';
import { Task } from '../models/Task.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { ROLES } from '../config/env.js';
import { asyncHandler, forbidden, notFound, unauthorized } from '../utils/httpError.js';

/*
 * WHY THREE SEPARATE MIDDLEWARES
 *
 * They answer three different questions, and each one is only correct if the
 * previous has already run:
 *
 *   1. verifyToken   -> "who is this request from?"          (authentication)
 *   2. requireRole   -> "is that kind of user allowed here?" (coarse authorisation)
 *   3. requireTask*  -> "for THIS specific record?"          (resource-scoped authorisation)
 *
 * Splitting them keeps each one small enough to be obviously correct, and
 * lets routes compose exactly the checks they need. Crucially, step 2 alone
 * is not security: requireRole('MANAGER') proves someone is a manager, not
 * that they manage the team this task belongs to. Step 3 is what turns a
 * role check into a permission check.
 *
 * WHY MIDDLEWARE RATHER THAN A CHECK INSIDE EACH HANDLER
 *
 *  - Fail-closed by construction. The check runs before the handler is ever
 *    entered, so there is no code path where the handler does work first and
 *    checks second.
 *  - It cannot be forgotten silently. The authorisation for a route is
 *    visible on the router line itself, so reviewing the router file is
 *    enough to audit the whole API's permissions. A check buried on line 40
 *    of a handler is invisible until you read every handler.
 *  - One implementation, not N. "Does this manager own this team" is written
 *    once; a bug fixed there is fixed everywhere. Copy-pasted per-handler
 *    checks drift apart, and the one that drifts is the vulnerability.
 *  - The handler is left with only business logic, which makes it testable
 *    and readable.
 */

/**
 * 1. AUTHENTICATION — who is this?
 *
 * Reads the bearer token, verifies the signature and expiry, then reloads
 * the user from the database. The reload matters: the token is a 15 minute
 * old snapshot, so a user who was deactivated or had their role changed
 * after it was issued must not keep those old privileges.
 */
export const verifyToken = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw unauthorized('Missing bearer token');
  }

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch (err) {
    // Distinguished so the client interceptor knows a refresh is worth
    // trying, versus a token that is simply garbage.
    throw unauthorized(
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token'
    );
  }

  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('User no longer exists');
  if (!user.isActive) throw forbidden('Account is deactivated');

  req.user = user;
  next();
});

/**
 * 2. COARSE AUTHORISATION — is this kind of user allowed on this route at all?
 *
 * A cheap first gate. It never touches the database, so it rejects the
 * obviously-wrong requests before any resource lookup happens.
 */
export function requireRole(...allowed) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(
        forbidden(`Requires role: ${allowed.join(' or ')}. You are ${req.user.role}.`)
      );
    }
    next();
  };
}

/**
 * Which teams does this manager actually manage? Backed by the
 * { manager: 1 } index on teams. Cached on the request so a route that runs
 * several scoped checks only pays for it once.
 */
export async function managedTeamIds(req) {
  if (req._managedTeamIds) return req._managedTeamIds;
  const teams = await Team.find({ manager: req.user._id }).select('_id').lean();
  req._managedTeamIds = teams.map((t) => t._id.toString());
  return req._managedTeamIds;
}

/**
 * Loads the :id task once and hangs it on the request, so the scoped checks
 * below and the handler itself all share a single database read.
 */
export const loadTask = asyncHandler(async (req, _res, next) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw notFound('Task not found');
  req.task = task;
  next();
});

/**
 * 3. RESOURCE-SCOPED AUTHORISATION — for THIS record?
 *
 * This is the requirement that a plain role check cannot satisfy. It answers
 * the question against the actual record being touched.
 *
 * Read rules:
 *   ADMIN    — every task.
 *   MANAGER  — tasks whose team is one they manage. A manager holding a
 *              perfectly valid token who asks for a task in another team
 *              gets 403 here, which is exactly the scenario in the spec.
 *   EMPLOYEE — only tasks assigned to them. Note this is assignee-based, not
 *              team-based: being on a team does not entitle you to read a
 *              colleague's task.
 */
export const requireTaskRead = asyncHandler(async (req, _res, next) => {
  const { user, task } = req;

  if (user.role === ROLES.ADMIN) return next();

  if (user.role === ROLES.MANAGER) {
    const owned = await managedTeamIds(req);
    if (owned.includes(task.team.toString())) return next();
    throw forbidden('This task belongs to a team you do not manage');
  }

  if (task.assignee.toString() === user._id.toString()) return next();
  throw forbidden('This task is not assigned to you');
});

/**
 * Full mutation (edit fields, reassign, delete).
 * ADMIN anywhere; MANAGER only within a team they own; EMPLOYEE never —
 * an employee may move status and comment, but may not rewrite the task.
 */
export const requireTaskWrite = asyncHandler(async (req, _res, next) => {
  const { user, task } = req;

  if (user.role === ROLES.ADMIN) return next();

  if (user.role === ROLES.MANAGER) {
    const owned = await managedTeamIds(req);
    if (owned.includes(task.team.toString())) return next();
    throw forbidden('This task belongs to a team you do not manage');
  }

  throw forbidden('Employees cannot modify task details');
});

/**
 * Narrower mutation: status change and commenting.
 * Same as read — an employee may act on their own task, a manager on their
 * own team's, an admin anywhere. Kept separate from requireTaskWrite so the
 * router can express "employees may do this much and no more".
 */
export const requireTaskParticipation = requireTaskRead;

/**
 * Team-scoped check for routes addressed by :teamId (progress, roster,
 * task creation). Reads the id from wherever the route puts it.
 */
export function requireTeamScope(source = 'params', key = 'teamId') {
  return asyncHandler(async (req, _res, next) => {
    const teamId = req[source]?.[key];
    if (!teamId) throw forbidden('No team specified');

    if (req.user.role === ROLES.ADMIN) return next();

    if (req.user.role === ROLES.MANAGER) {
      const owned = await managedTeamIds(req);
      if (owned.includes(teamId.toString())) return next();
      throw forbidden('You do not manage this team');
    }

    // Employees may read their own team, nothing else.
    if (req.user.team && req.user.team.toString() === teamId.toString()) return next();
    throw forbidden('You are not a member of this team');
  });
}
