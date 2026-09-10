import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { ROLES, TASK_STATUS, TASK_PRIORITY } from '../config/env.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/httpError.js';
import { managedTeamIds } from '../middleware/auth.js';

/**
 * GET /api/tasks
 * The filter is built from the caller's identity first, then narrowed by
 * query parameters. That order is the whole point: a query parameter can
 * only ever shrink what the server already decided you may see, never widen
 * it. An employee adding ?assignee=<someone else> still gets their own tasks.
 *
 * Each branch is shaped to hit one of the compound indexes:
 *   EMPLOYEE -> { assignee, status? }  hits { assignee: 1, status: 1 }
 *   MANAGER  -> { team: $in, status? } hits { team: 1, status: 1 }
 */
export const listTasks = asyncHandler(async (req, res) => {
  const { status, priority, teamId } = req.query;
  let filter = {};

  if (req.user.role === ROLES.EMPLOYEE) {
    filter.assignee = req.user._id;
  } else if (req.user.role === ROLES.MANAGER) {
    const owned = (await managedTeamIds(req)).map((id) => new mongoose.Types.ObjectId(id));
    if (teamId) {
      if (!owned.some((id) => id.toString() === teamId)) {
        throw forbidden('You do not manage this team');
      }
      filter.team = new mongoose.Types.ObjectId(teamId);
    } else {
      filter.team = { $in: owned };
    }
  } else if (teamId) {
    filter.team = teamId; // ADMIN, optionally narrowed
  }

  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  const tasks = await Task.find(filter)
    .populate('assignee', 'name email')
    .populate('team', 'name')
    .populate('createdBy', 'name')
    .sort({ dueDate: 1, createdAt: -1 });

  res.json({ tasks });
});

/** GET /api/tasks/:id — authorised by loadTask + requireTaskRead. */
export const getTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.task._id)
    .populate('assignee', 'name email')
    .populate('team', 'name')
    .populate('createdBy', 'name')
    .populate('comments.author', 'name role');
  res.json({ task });
});

/**
 * POST /api/tasks  (MANAGER, ADMIN)
 * Two independent checks, both required:
 *   1. requireTeamScope on the route — may you create in this team at all?
 *   2. here — is the assignee actually a member of that team?
 * Without (2) a manager could pass their own team id and then assign the
 * task to someone outside it, which would smuggle a task across the team
 * boundary the whole model rests on.
 */
export const createTask = asyncHandler(async (req, res) => {
  const { title, description, assignee, teamId, priority, dueDate, status } = req.body;
  if (!title || !assignee || !teamId) throw badRequest('title, assignee and teamId are required');
  if (priority && !Object.values(TASK_PRIORITY).includes(priority)) throw badRequest('Invalid priority');
  if (status && !Object.values(TASK_STATUS).includes(status)) throw badRequest('Invalid status');

  const assigneeDoc = await User.findById(assignee);
  if (!assigneeDoc || !assigneeDoc.isActive) throw badRequest('Assignee not found or inactive');
  if (String(assigneeDoc.team) !== String(teamId)) {
    throw badRequest('Assignee is not a member of that team');
  }

  const task = await Task.create({
    title,
    description: description || '',
    assignee,
    team: teamId,
    status: status || TASK_STATUS.TODO,
    priority: priority || TASK_PRIORITY.MEDIUM,
    dueDate: dueDate || null,
    createdBy: req.user._id, // taken from the token, never from the body
  });

  res.status(201).json({ task });
});

/**
 * PATCH /api/tasks/:id  (MANAGER owning the team, or ADMIN)
 * This is the endpoint the spec calls out: a manager hitting a task outside
 * their team gets 403 from requireTaskWrite before this code runs, valid
 * token or not.
 */
export const updateTask = asyncHandler(async (req, res) => {
  const task = req.task;
  const { title, description, priority, dueDate, status, assignee } = req.body;

  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (priority !== undefined) {
    if (!Object.values(TASK_PRIORITY).includes(priority)) throw badRequest('Invalid priority');
    task.priority = priority;
  }
  if (status !== undefined) {
    if (!Object.values(TASK_STATUS).includes(status)) throw badRequest('Invalid status');
    task.status = status;
  }
  if (dueDate !== undefined) task.dueDate = dueDate || null;

  // Reassignment must stay inside the task's own team, for the same reason
  // as in createTask.
  if (assignee !== undefined) {
    const assigneeDoc = await User.findById(assignee);
    if (!assigneeDoc || !assigneeDoc.isActive) throw badRequest('Assignee not found or inactive');
    if (String(assigneeDoc.team) !== String(task.team)) {
      throw badRequest('Assignee is not a member of this task’s team');
    }
    task.assignee = assignee;
  }

  await task.save();
  res.json({ task });
});

/**
 * PATCH /api/tasks/:id/status  (assignee, owning MANAGER, or ADMIN)
 * A deliberately narrow endpoint. Employees need to move their own tasks
 * along, but must not be able to rewrite the title or reassign the work, so
 * the capability gets its own route with its own middleware rather than
 * being a special case inside PATCH /api/tasks/:id.
 */
export const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!Object.values(TASK_STATUS).includes(status)) throw badRequest('Invalid status');

  req.task.status = status;
  await req.task.save();
  res.json({ task: req.task });
});

/**
 * POST /api/tasks/:id/comments  (assignee, owning MANAGER, or ADMIN)
 * $push rather than read-modify-write: it is one atomic database operation,
 * so two people commenting at the same time cannot overwrite each other.
 */
export const addComment = asyncHandler(async (req, res) => {
  const body = (req.body.body || '').trim();
  if (!body) throw badRequest('Comment body is required');

  const task = await Task.findByIdAndUpdate(
    req.task._id,
    { $push: { comments: { author: req.user._id, body } } },
    { new: true }
  ).populate('comments.author', 'name role');

  if (!task) throw notFound('Task not found');
  res.status(201).json({ comments: task.comments });
});

/** DELETE /api/tasks/:id  (MANAGER owning the team, or ADMIN) */
export const deleteTask = asyncHandler(async (req, res) => {
  await Task.deleteOne({ _id: req.task._id });
  res.json({ ok: true });
});
