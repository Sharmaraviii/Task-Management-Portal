import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { ROLES } from '../config/env.js';
import { asyncHandler, badRequest, notFound } from '../utils/httpError.js';
import { managedTeamIds } from '../middleware/auth.js';

/**
 * GET /api/teams
 * Every role may call this, but each sees a different set — the server
 * narrows the result by identity rather than trusting a client filter.
 *   ADMIN    -> all teams
 *   MANAGER  -> teams they manage
 *   EMPLOYEE -> their own team only
 */
export const listTeams = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === ROLES.MANAGER) {
    filter = { _id: { $in: await managedTeamIds(req) } };
  } else if (req.user.role === ROLES.EMPLOYEE) {
    filter = { _id: req.user.team };
  }

  const teams = await Team.find(filter)
    .populate('manager', 'name email')
    .populate('members', 'name email role')
    .sort({ name: 1 });

  res.json({ teams });
});

/** GET /api/teams/:teamId — scoped by requireTeamScope on the route. */
export const getTeam = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.teamId)
    .populate('manager', 'name email')
    .populate('members', 'name email role isActive');
  if (!team) throw notFound('Team not found');
  res.json({ team });
});

/**
 * POST /api/teams  (ADMIN)
 * Validates that the nominated manager exists and actually holds the MANAGER
 * role — otherwise you could create a team "managed" by an employee, and the
 * ownership middleware would then hand that employee manager powers over it.
 */
export const createTeam = asyncHandler(async (req, res) => {
  const { name, manager, members = [] } = req.body;
  if (!name || !manager) throw badRequest('name and manager are required');

  const managerDoc = await User.findById(manager);
  if (!managerDoc) throw badRequest('Manager not found');
  if (managerDoc.role !== ROLES.MANAGER) throw badRequest('Nominated user is not a MANAGER');

  const team = await Team.create({ name, manager, members });

  // Keep both sides of the relationship consistent.
  await User.updateMany({ _id: { $in: members } }, { $set: { team: team._id } });
  if (!managerDoc.team) {
    managerDoc.team = team._id;
    await managerDoc.save();
  }

  res.status(201).json({ team });
});

/** PATCH /api/teams/:teamId  (ADMIN) — rename or reassign the manager. */
export const updateTeam = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.teamId);
  if (!team) throw notFound('Team not found');

  const { name, manager } = req.body;
  if (name !== undefined) team.name = name;
  if (manager !== undefined) {
    const managerDoc = await User.findById(manager);
    if (!managerDoc || managerDoc.role !== ROLES.MANAGER) {
      throw badRequest('Nominated user is not a MANAGER');
    }
    team.manager = manager;
  }

  await team.save();
  res.json({ team });
});

/**
 * POST /api/teams/:teamId/members  (ADMIN)
 * Writes both User.team and Team.members so the denormalised array never
 * drifts from the authoritative field.
 */
export const addMember = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const team = await Team.findById(req.params.teamId);
  if (!team) throw notFound('Team not found');

  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');

  if (user.team && String(user.team) !== String(team._id)) {
    await Team.findByIdAndUpdate(user.team, { $pull: { members: user._id } });
  }

  user.team = team._id;
  await user.save();
  await Team.findByIdAndUpdate(team._id, { $addToSet: { members: user._id } });

  res.json({ ok: true });
});
