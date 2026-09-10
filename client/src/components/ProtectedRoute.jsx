import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route-level gate.
 *
 * This is a USER EXPERIENCE control, not a security control. It stops people
 * seeing screens that would be empty or broken for their role — but anyone
 * can edit the bundle in devtools and render whatever they like. The only
 * thing that actually protects data is the Express middleware, which
 * re-checks every request independently and has no idea what the UI decided
 * to show.
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) return <div className="centered muted">Restoring session…</div>;

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="card centered">
        <h2>403 — Not your area</h2>
        <p className="muted">
          You are signed in as {user.role}. This page is for {roles.join(' or ')}.
        </p>
      </div>
    );
  }

  return children;
}
