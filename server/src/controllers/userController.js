import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Team } from '../models/Team.js';
import { ROLES } from '../config/env.js';
import { asyncHandler, badRequest, conflict, notFound } from '../utils/httpError.js';
import { managedTeamIds } from '../middleware/auth.js';

/**
 * GET /api/users  (ADMIN)
 * Optional ?team= and ?role= filters. Uses the { team: 1, isActive: 1 }
 * index when filtering by team.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.team) filter.team = req.query.team;
  if (req.query.role) filter.role = req.query.role;
  if (req.query.active === 'true') filter.isActive = true;

  const users = await User.find(filter).populate('team', 'name').sort({ name: 1 });
  res.json({ users });
});

/**
 * GET /api/users/assignable  (MANAGER, ADMIN)
 * The dropdown a manager picks an assignee from. A manager only ever sees
 * active members of teams they manage — the server decides the list, so the
 * client cannot widen it by tampering with a query parameter.
 */
export const listAssignableUsers = asyncHandler(async (req, res) => {
  let teamFilter;
  if (req.user.role === ROLES.ADMIN) {
    teamFilter = req.query.team ? { team: req.query.team } : {};
  } else {
    const owned = await managedTeamIds(req);
    teamFilter = { team: { $in: owned.map((id) => new mongoose.Types.ObjectId(id)) } };
  }

  const users = await User.find({ ...teamFilter, isActive: true, role: ROLES.EMPLOYEE })
    .select('name email team')
    .sort({ name: 1 });

  res.json({ users });
});

/**
 * POST /api/users  (ADMIN)
 * The only route that may set a role, which is why it is admin-gated.
 */
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, team } = req.body;
  if (!name || !email || !password) throw badRequest('name, email and password are required');
  if (role && !Object.values(ROLES).includes(role)) throw badRequest('Invalid role');

  if (await User.findOne({ email: email.toLowerCase() })) {
    throw conflict('Email already registered');
  }

  const user = new User({ name, email, role: role || ROLES.EMPLOYEE, team: team || null });
  await user.setPassword(password);
  await user.save();

  // Keep the denormalised Team.members array in step with User.team.
  if (team) await Team.findByIdAndUpdate(team, { $addToSet: { members: user._id } });

  res.status(201).json({ user });
});

/**
 * PATCH /api/users/:id  (ADMIN)
 * Whitelisted fields only. Spreading req.body into an update is how mass
 * assignment bugs happen — a client could otherwise send passwordHash or
 * tokenVersion.
 */
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User not found');

  const { name, role, team } = req.body;
  if (name !== undefined) user.name = name;
  if (role !== undefined) {
    if (!Object.values(ROLES).includes(role)) throw badRequest('Invalid role');
    user.role = role;
  }

  if (team !== undefined && String(team) !== String(user.team)) {
    if (user.team) await Team.findByIdAndUpdate(user.team, { $pull: { members: user._id } });
    if (team) await Team.findByIdAndUpdate(team, { $addToSet: { members: user._id } });
    user.team = team || null;
  }

  await user.save();
  res.json({ user });
});

/**
 * PATCH /api/users/:id/deactivate  (ADMIN)
 * Soft delete. Hard-deleting a user would orphan every task they were
 * assigned and every comment they wrote. Bumping tokenVersion at the same
 * time cuts off their existing sessions at the next refresh, and verifyToken
 * rejects them immediately on the isActive check.
 */
export const setUserActive = asyncHandler(async (req, res) => {
  const isActive = Boolean(req.body.isActive);
  const update = { isActive };
  const ops = isActive ? { $set: update } : { $set: update, $inc: { tokenVersion: 1 } };

  const user = await User.findByIdAndUpdate(req.params.id, ops, { new: true });
  if (!user) throw notFound('User not found');
  res.json({ user });
});
