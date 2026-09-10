import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { mergeProgress } from '../api/progress.js';
import { ErrorNote, Empty, ProgressBar, TaskRow } from '../components/ui.jsx';

export default function AdminDashboard() {
  const [progress, setProgress] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/reports/progress'), api.get('/tasks'), api.get('/teams')])
      .then(([p, t, teams]) => {
        // Zero-task teams still deserve a card — see mergeProgress.
        setProgress(mergeProgress(teams.data.teams, p.data.progress));
        setTasks(t.data.tasks.slice(0, 12));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const totals = progress.reduce(
    (acc, p) => ({
      total: acc.total + p.total,
      done: acc.done + p.counts.DONE,
      overdue: acc.overdue + p.overdue,
    }),
    { total: 0, done: 0, overdue: 0 }
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>All teams</h1>
          <p className="muted">Admins see every team's progress.</p>
        </div>
        <div className="row gap">
          <Link className="btn ghost" to="/admin/users">
            Manage users
          </Link>
          <Link className="btn ghost" to="/admin/teams">
            Manage teams
          </Link>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="row gap">
        <div className="card kpi">
          <span className="muted small">Tasks</span>
          <strong>{totals.total}</strong>
        </div>
        <div className="card kpi">
          <span className="muted small">Done</span>
          <strong>{totals.done}</strong>
        </div>
        <div className="card kpi">
          <span className="muted small">Overdue</span>
          <strong className={totals.overdue ? 'overdue' : ''}>{totals.overdue}</strong>
        </div>
      </div>

      <div className="grid">
        {progress.map((p) => (
          <div key={p.teamId} className="card stat">
            <div className="row spread">
              <strong>{p.teamName}</strong>
              <span className="muted">{p.completionRate}%</span>
            </div>
            <ProgressBar counts={p.counts} total={p.total} />
            <div className="row gap small muted">
              <span>{p.counts.TODO} to do</span>
              <span>{p.counts.IN_PROGRESS} in progress</span>
              <span>{p.counts.DONE} done</span>
              {p.overdue > 0 && <span className="overdue">{p.overdue} overdue</span>}
            </div>
          </div>
        ))}
        {progress.length === 0 && <Empty>No teams yet. Create one to get started.</Empty>}
      </div>

      <div className="card list">
        <div className="card-head">Recent tasks</div>
        {tasks.length === 0 ? (
          <Empty>No tasks yet.</Empty>
        ) : (
          tasks.map((t) => <TaskRow key={t._id} task={t} showAssignee />)
        )}
      </div>
    </div>
  );
}
