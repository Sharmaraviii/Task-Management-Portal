import mongoose from 'mongoose';
import { TASK_STATUS, TASK_PRIORITY } from '../config/env.js';

const commentSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true, _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 5000 },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Stored on the task rather than derived from the assignee's current
    // team. Authorisation asks "which team does this task belong to", and
    // that answer must not silently change if an employee is later moved to
    // a different team.
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.TODO,
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.MEDIUM,
      required: true,
    },
    dueDate: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Embedded rather than a separate collection: comments are always read
    // with their task, are few per task, and are never queried on their own.
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

/*
 * INDEX: { assignee: 1, status: 1 }
 * Serves: the employee dashboard —
 *   Task.find({ assignee: req.user.id })            (all my tasks)
 *   Task.find({ assignee: req.user.id, status })    (my tasks, filtered)
 * assignee comes first because it is always present in the query and is
 * highly selective (one user out of all users). status is second and is
 * optional: a compound index can be used by a query that supplies a prefix
 * of its keys, so this one index covers both queries above. Reversing the
 * order would break that — { status: 1, assignee: 1 } could not serve a
 * query on assignee alone, and status has only three distinct values so it
 * is a poor leading key regardless.
 */
taskSchema.index({ assignee: 1, status: 1 });

/*
 * INDEX: { team: 1, status: 1 }
 * Serves: the manager's team board —
 *   Task.find({ team: <teamId> })
 *   Task.find({ team: <teamId>, status })
 * and, importantly, the $match + $group stages of the team-progress
 * aggregation. The pipeline matches on team and groups by status, so both
 * fields are in this index; Mongo can satisfy the $match with an index scan
 * instead of reading every task document in the collection.
 */
taskSchema.index({ team: 1, status: 1 });

/*
 * INDEX: { team: 1, dueDate: 1 }
 * Serves: Task.find({ team }).sort({ dueDate: 1 }) — the team board's
 * default "soonest deadline first" ordering. Without it Mongo performs an
 * in-memory sort, which fails outright once the result set exceeds the 32MB
 * sort limit. With it the index is already in dueDate order, so the sort is
 * free.
 */
taskSchema.index({ team: 1, dueDate: 1 });

taskSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const Task = mongoose.model('Task', taskSchema);
