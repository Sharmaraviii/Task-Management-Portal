import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { TaskRow, ErrorNote, Empty, ProgressBar } from '../components/ui.jsx';

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

export default function EmployeeDashboard() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // No assignee parameter is sent — the server derives "my tasks" from the
    // token. Sending one would achieve nothing, which is the point.
    api
      .get('/tasks', { params: filter ? { status: filter } : {} })
      .then(({ data }) => !cancelled && setTasks(data.tasks))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const counts = useMemo(() => {
    const base = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
    for (const t of tasks) base[t.status] += 1;
    return base;
  }, [tasks]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>My tasks</h1>
          <p className="muted">Everything assigned to you.</p>
        </div>
        <div className="filters">
          <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter('')}>
            All
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`chip ${filter === s ? 'on' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {!filter && tasks.length > 0 && (
        <div className="card">
          <div className="row spread">
            <strong>Progress</strong>
            <span className="muted">
              {counts.DONE}/{tasks.length} done
            </span>
          </div>
          <ProgressBar counts={counts} total={tasks.length} />
        </div>
      )}

      <div className="card list">
        {loading ? (
          <Empty>Loading…</Empty>
        ) : tasks.length === 0 ? (
          <Empty>Nothing here. Enjoy the quiet.</Empty>
        ) : (
          tasks.map((t) => <TaskRow key={t._id} task={t} />)
        )}
      </div>
    </div>
  );
}
