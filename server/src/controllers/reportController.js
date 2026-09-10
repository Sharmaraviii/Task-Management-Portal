import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { ROLES } from '../config/env.js';
import { asyncHandler } from '../utils/httpError.js';
import { managedTeamIds } from '../middleware/auth.js';

const { ObjectId } = mongoose.Types;

/*
 * WHY AN AGGREGATION PIPELINE INSTEAD OF COUNTING IN JAVASCRIPT
 *
 * The naive version is `const tasks = await Task.find({ team }); then reduce`.
 * It is wrong for four reasons:
 *
 *  1. Network. It ships every matching document — title, description,
 *     comments, the lot — across the wire to produce three integers. The
 *     pipeline returns one small document per team. Payload size stops
 *     depending on how many tasks exist.
 *  2. Memory. Node holds the entire result set at once, so memory grows
 *     linearly with the data and the process eventually falls over. Mongo
 *     streams documents through the pipeline stages instead.
 *  3. Index use. $match as the first stage lets the planner use the
 *     { team: 1, status: 1 } index, and because that index carries both
 *     fields the counting never touches the documents themselves — it reads
 *     keys only (a covered query).
 *  4. Locality. The database is the process that already has the data. Doing
 *     the arithmetic there is one round trip; doing it in Node is a fetch
 *     plus a loop, and the loop runs on the single-threaded event loop that
 *     is also serving every other request.
 *
 * The rule of thumb the interviewer is fishing for: push the reduction to
 * the data, not the data to the reduction.
 */

/**
 * GET /api/reports/team/:teamId/progress
 * Task counts grouped by status for one team.
 */
export const teamProgress = asyncHandler(async (req, res) => {
  const teamId = new ObjectId(req.params.teamId);
  const [progress] = await runTeamProgress([teamId]);

  res.json({
    progress: progress || {
      teamId: req.params.teamId,
      teamName: null,
      counts: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
      total: 0,
      completionRate: 0,
      overdue: 0,
    },
  });
});

/**
 * GET /api/reports/progress
 * The same pipeline over every team the caller is entitled to see. The scope
 * is derived from the token's identity, so a manager cannot ask for another
 * team's numbers by guessing an id.
 */
export const myTeamsProgress = asyncHandler(async (req, res) => {
  let teamIds;
  if (req.user.role === ROLES.ADMIN) {
    teamIds = null; // null means "no team restriction"
  } else if (req.user.role === ROLES.MANAGER) {
    teamIds = (await managedTeamIds(req)).map((id) => new ObjectId(id));
  } else {
    teamIds = req.user.team ? [req.user.team] : [];
  }

  res.json({ progress: await runTeamProgress(teamIds) });
});

/**
 * THE PIPELINE.
 *
 * Stage by stage:
 *
 *  1. $match     Filter to the teams in scope. First on purpose — it is the
 *                only stage that can use an index, and every later stage
 *                works on whatever survives it, so cutting the input here
 *                makes everything downstream cheaper. Uses { team: 1, status: 1 }.
 *
 *  2. $group #1  _id is the COMPOSITE key { team, status }, so one output
 *                document per (team, status) pair, with $sum: 1 counting the
 *                members of each bucket. This is the actual "group tasks by
 *                status per team" step. At most 3 statuses x N teams
 *                documents leave this stage, however many tasks went in.
 *
 *                overdue is accumulated in the same pass with $cond: a task
 *                counts 1 if it is not DONE and its dueDate is in the past,
 *                0 otherwise. Computing it here rather than in a second
 *                query means the collection is only traversed once.
 *
 *  3. $group #2  Regroup by team alone, collapsing the per-status documents
 *                into one document per team. $push builds the array of
 *                {status, count} pairs; $sum: '$count' totals them. Two
 *                grouping stages is the standard idiom for a two-level
 *                rollup — you cannot get both levels from one $group.
 *
 *  4. $lookup    Join to the teams collection for the display name. Kept
 *                until after the grouping so the join runs against a handful
 *                of grouped documents instead of every task — join late, on
 *                the smallest possible set. The pipeline form with a
 *                $project inside pulls back only the name field.
 *
 *  5. $unwind    $lookup always produces an array; there is exactly one
 *                matching team, so flatten it. preserveNullAndEmptyArrays
 *                keeps the row alive if a team document was deleted.
 *
 *  6. $project   Final shaping.
 *                - $arrayToObject turns [{k,v},...] into a keyed object, so
 *                  the client gets { TODO: 4, DONE: 2 } rather than an array
 *                  it has to search.
 *                - $mergeObjects with a zeroed default guarantees all three
 *                  keys are present even when a status has no tasks —
 *                  otherwise the UI has to defend against undefined.
 *                - completionRate is computed with $cond guarding the divide,
 *                  because dividing by zero on an empty team throws in the
 *                  aggregation framework.
 *
 *  7. $sort      Deterministic output ordering by team name.
 */
async function runTeamProgress(teamIds) {
  const match = teamIds === null ? {} : { team: { $in: teamIds } };

  return Task.aggregate([
    // 1. narrow first — index-backed
    { $match: match },

    // 2. one bucket per (team, status)
    {
      $group: {
        _id: { team: '$team', status: '$status' },
        count: { $sum: 1 },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', 'DONE'] },
                  { $ne: ['$dueDate', null] },
                  { $lt: ['$dueDate', new Date()] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },

    // 3. roll the status buckets up into one document per team
    {
      $group: {
        _id: '$_id.team',
        statusCounts: { $push: { k: '$_id.status', v: '$count' } },
        total: { $sum: '$count' },
        overdue: { $sum: '$overdue' },
        done: {
          $sum: { $cond: [{ $eq: ['$_id.status', 'DONE'] }, '$count', 0] },
        },
      },
    },

    // 4. join for the team name, on the already-small result set
    {
      $lookup: {
        from: 'teams',
        localField: '_id',
        foreignField: '_id',
        as: 'team',
        pipeline: [{ $project: { name: 1 } }],
      },
    },

    // 5. one team per row
    { $unwind: { path: '$team', preserveNullAndEmptyArrays: true } },

    // 6. shape for the client
    {
      $project: {
        _id: 0,
        teamId: '$_id',
        teamName: '$team.name',
        counts: {
          $mergeObjects: [
            { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
            { $arrayToObject: '$statusCounts' },
          ],
        },
        total: 1,
        overdue: 1,
        completionRate: {
          $cond: [
            { $eq: ['$total', 0] },
            0,
            { $round: [{ $multiply: [{ $divide: ['$done', '$total'] }, 100] }, 0] },
          ],
        },
      },
    },

    // 7. stable ordering
    { $sort: { teamName: 1 } },
  ]);
}

/**
 * GET /api/reports/team/:teamId/workload
 * Same two-level-rollup shape, grouped by assignee instead of team: it
 * answers "who on my team is carrying what". Included because a progress
 * dashboard that cannot show per-person load is not actionable.
 */
export const teamWorkload = asyncHandler(async (req, res) => {
  const teamId = new ObjectId(req.params.teamId);

  const workload = await Task.aggregate([
    { $match: { team: teamId } },
    {
      $group: {
        _id: { assignee: '$assignee', status: '$status' },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.assignee',
        statusCounts: { $push: { k: '$_id.status', v: '$count' } },
        total: { $sum: '$count' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        // Project inside the join so the password hash can never ride along.
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        name: '$user.name',
        email: '$user.email',
        total: 1,
        counts: {
          $mergeObjects: [
            { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
            { $arrayToObject: '$statusCounts' },
          ],
        },
      },
    },
    { $sort: { total: -1 } },
  ]);

  res.json({ workload });
});
