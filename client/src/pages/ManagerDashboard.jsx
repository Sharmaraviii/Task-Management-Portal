import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { mergeProgress } from '../api/progress.js';
import { TaskRow, ErrorNote, Empty, ProgressBar } from '../components/ui.jsx';

export default function ManagerDashboard() {
  const [progress, setProgress] = useState([]);
  const [teamId, setTeamId] = useState(null);
  const [workload, setWorkload] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [assignable, setAssignable] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  // The progress numbers come straight from the aggregation pipeline — the
  // client does no counting of its own. /teams is fetched alongside only so
  // that a team with no tasks yet still gets a (zeroed) card.
  const loadProgress = useCallback(async () => {
    const [reports, teams] = await Promise.all([
      api.get('/reports/progress'),
      api.get('/teams'),
    ]);
    const merged = mergeProgress(teams.data.teams, reports.data.progress);
    setProgress(merged);
    setTeamId((current) => current || merged[0]?.teamId || null);
  }, []);

  useEffect(() => {
    loadProgress().catch((err) => setError(errorMessage(err)));
  }, [loadProgress]);

  const loadTeam = useCallback(async (id) => {
    if (!id) return;
    const [tasksRes, workloadRes, usersRes] = await Promise.all([
      api.get('/tasks', { params: { teamId: id } }),
      api.get(`/reports/team/${id}/workload`),
      api.get('/users/assignable'),
    ]);
    setTasks(tasksRes.data.tasks);
    setWorkload(workloadRes.data.workload);
    setAssignable(usersRes.data.users.filter((u) => String(u.team) === String(id)));
  }, []);

  useEffect(() => {
    if (teamId) loadTeam(teamId).catch((err) => setError(errorMessage(err)));
  }, [teamId, loadTeam]);

  const refresh = async () => {
    await loadProgress();
    await loadTeam(teamId);
  };

  const current = progress.find((p) => String(p.teamId) === String(teamId));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Team progress</h1>
          <p className="muted">Counts come from a MongoDB aggregation, not from the browser.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New task'}
        </button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="grid">
        {progress.map((p) => (
          <button
            key={p.teamId}
            className={`card stat ${String(p.teamId) === String(teamId) ? 'on' : ''}`}
            onClick={() => setTeamId(p.teamId)}
          >
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
          </button>
        ))}
        {progress.length === 0 && <Empty>You do not manage any teams yet.</Empty>}
      </div>

      {showForm && teamId && (
        <NewTaskForm
          teamId={teamId}
          assignable={assignable}
          onCreated={async () => {
            setShowForm(false);
            await refresh();
          }}
        />
      )}

      {current && (
        <div className="two-col">
          <div className="card list">
            <div className="card-head">Tasks — {current.teamName}</div>
            {tasks.length === 0 ? (
              <Empty>No tasks in this team.</Empty>
            ) : (
              tasks.map((t) => <TaskRow key={t._id} task={t} showAssignee />)
            )}
          </div>

          <div className="card list">
            <div className="card-head">Workload</div>
            {workload.length === 0 ? (
              <Empty>Nobody has tasks yet.</Empty>
            ) : (
              workload.map((w) => (
                <div key={w.userId} className="workrow">
                  <div>
                    <div>{w.name}</div>
                    <div className="muted small">{w.email}</div>
                  </div>
                  <div className="mini">
                    <ProgressBar counts={w.counts} total={w.total} />
                    <span className="muted small">{w.total} tasks</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewTaskForm({ teamId, assignable, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    assignee: '',
    priority: 'MEDIUM',
    dueDate: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // teamId is sent, but the server does not trust it: requireTeamScope
      // checks the manager owns it, and createTask checks the assignee is
      // actually in it.
      await api.post('/tasks', { ...form, teamId, dueDate: form.dueDate || null });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="card-head">New task</div>
      <label>
        Title
        <input value={form.title} onChange={set('title')} required />
      </label>
      <label>
        Description
        <textarea rows={3} value={form.description} onChange={set('description')} />
      </label>
      <div className="row gap">
        <label className="grow">
          Assignee
          <select value={form.assignee} onChange={set('assignee')} required>
            <option value="">Select…</option>
            {assignable.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={form.priority} onChange={set('priority')}>
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
          </select>
        </label>
        <label>
          Due date
          <input type="date" value={form.dueDate} onChange={set('dueDate')} />
        </label>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <button className="btn primary" disabled={busy}>
        {busy ? 'Creating…' : 'Create task'}
      </button>
    </form>
  );
}
