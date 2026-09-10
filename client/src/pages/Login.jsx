import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import { ErrorNote } from '../components/ui.jsx';

const DEMO = [
  ['admin@portal.dev', 'ADMIN'],
  ['maya@portal.dev', 'MANAGER · Platform'],
  ['marc@portal.dev', 'MANAGER · Design'],
  ['elena@portal.dev', 'EMPLOYEE · Platform'],
  ['eva@portal.dev', 'EMPLOYEE · Design'],
];

export default function Login() {
  const { user, booting, login } = useAuth();
  const [email, setEmail] = useState('maya@portal.dev');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (booting) return <div className="centered muted">Restoring session…</div>;
  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>
          <span className="dot" /> Task Portal
        </h1>
        <p className="muted">Sign in to continue</p>

        <label>
          Email
          <input
            type="email"
            value={email}
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <ErrorNote>{error}</ErrorNote>

        <button className="btn primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="demo">
          <div className="muted small">Seeded accounts — password Password123!</div>
          {DEMO.map(([mail, label]) => (
            <button
              key={mail}
              type="button"
              className="chip"
              onClick={() => {
                setEmail(mail);
                setPassword('Password123!');
              }}
            >
              {mail} <span className="muted">{label}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
