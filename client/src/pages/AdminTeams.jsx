import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { ErrorNote, Empty } from '../components/ui.jsx';

export default function AdminTeams() {
  const [teams, setTeams] = useState([]);
  const [managers, setManagers] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', manager: '' });

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([
      api.get('/teams'),
      api.get('/users', { params: { role: 'MANAGER' } }),
    ]);
    setTeams(t.data.teams);
    setManagers(m.data.users);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)));
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/teams', form);
      setForm({ name: '', manager: '' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const reassign = async (team, manager) => {
    try {
      await api.patch(`/teams/${team._id}`, { manager });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Teams</h1>
          <p className="muted">
            The manager assigned here is exactly who the API will let edit that team's tasks.
          </p>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <form className="card stack" onSubmit={create}>
        <div className="card-head">Create team</div>
        <div className="row gap">
          <label className="grow">
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="grow">
            Manager
            <select
              value={form.manager}
              onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))}
              required
            >
              <option value="">Select a manager…</option>
              {managers.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn primary">Create team</button>
      </form>

      <div className="grid">
        {teams.length === 0 && <Empty>No teams yet.</Empty>}
        {teams.map((t) => (
          <div key={t._id} className="card stack">
            <div className="row spread">
              <strong>{t.name}</strong>
              <span className="muted small">{t.members?.length || 0} members</span>
            </div>
            <label>
              Manager
              <select value={t.manager?._id || ''} onChange={(e) => reassign(t, e.target.value)}>
                {managers.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="members">
              {(t.members || []).map((m) => (
                <span key={m._id} className="chip static">
                  {m.name}
                </span>
              ))}
              {(t.members || []).length === 0 && <span className="muted small">No members</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
