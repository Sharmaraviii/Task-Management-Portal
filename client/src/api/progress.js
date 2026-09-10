const ZERO = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };

/**
 * The aggregation only emits teams that have at least one task — $group
 * cannot invent a bucket for documents that do not exist. A brand new team
 * would therefore be missing from the dashboard entirely, which reads as a
 * bug rather than as "no tasks yet".
 *
 * Rather than paper over it in the pipeline (an $unionWith or a right join
 * from teams, both of which make the query considerably harder to explain),
 * the client merges the team list it already has with the counts. The
 * arithmetic still happens in MongoDB; this only fills in the empty rows.
 */
export function mergeProgress(teams, progress) {
  const byId = new Map(progress.map((p) => [String(p.teamId), p]));

  return teams
    .map(
      (t) =>
        byId.get(String(t._id)) || {
          teamId: t._id,
          teamName: t.name,
          counts: { ...ZERO },
          total: 0,
          overdue: 0,
          completionRate: 0,
        }
    )
    .sort((a, b) => (a.teamName || '').localeCompare(b.teamName || ''));
}
