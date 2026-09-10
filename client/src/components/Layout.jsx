import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> Task Portal
        </div>

        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          {/* Conditional rendering hides the link. It does NOT protect the
              route — ProtectedRoute does that in the UI, and the API's
              requireRole does it for real. */}
          {user?.role === 'ADMIN' && (
            <>
              <NavLink to="/admin/users">Users</NavLink>
              <NavLink to="/admin/teams">Teams</NavLink>
            </>
          )}
        </nav>

        <div className="who">
          <span className={`badge role-${user?.role}`}>{user?.role}</span>
          <span className="muted">{user?.name}</span>
          <button className="btn ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
