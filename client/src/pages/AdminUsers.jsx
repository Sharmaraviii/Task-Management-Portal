import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { ErrorNote, Empty } from '../components/ui.jsx';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'EMPLOYEE',
    team: '',
  });

  const load = useCallback(async () => {
    const [u, t] = await Promise.all([api.get('/users'), api.get('/teams')]);
    setUsers(u.data.users);
    setTeams(t.data.teams);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)));
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', { ...form, team: form.team || null });
      setForm({ name: '', email: '', password: '', role: 'EMPLOYEE', team: '' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.patch(`/users/${user._id}/deactivate`, { isActive: !user.isActive });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const changeTeam = async (user, team) => {
    try {
      await api.patch(`/users/${user._id}`, { team: team || null });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">Only an admin can set roles or team membership.</p>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <form className="card stack" onSubmit={create}>
        <div className="card-head">Create user</div>
        <div className="row gap">
          <label className="grow">
            Name
            <input value={form.name} onChange={set('name')} required />
          </label>
          <label className="grow">
            Email
            <input type="email" value={form.email} onChange={set('email')} required />
          </label>
        </div>
        <div className="row gap">
          <label className="grow">
            Password
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              minLength={8}
              required
            />
          </label>
          <label>
            Role
            <select value={form.role} onChange={set('role')}>
              <option>EMPLOYEE</option>
              <option>MANAGER</option>
              <option>ADMIN</option>
            </select>
          </label>
          <label>
            Team
            <select value={form.team} onChange={set('team')}>
              <option value="">None</option>
              {teams.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn primary">Create user</button>
      </form>

      <div className="card list">
        <div className="card-head">All users</div>
        {users.length === 0 ? (
          <Empty>No users.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Team</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className={u.isActive ? '' : 'dim'}>
                  <td>{u.name}</td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <span className={`badge role-${u.role}`}>{u.role}</span>
                  </td>
                  <td>
                    <select
                      value={u.team?._id || ''}
                      onChange={(e) => changeTeam(u, e.target.value)}
                    >
                      <option value="">None</option>
                      {teams.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{u.isActive ? 'Active' : 'Deactivated'}</td>
                  <td>
                    <button className="btn ghost small" onClick={() => toggleActive(u)}>
                      {u.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
