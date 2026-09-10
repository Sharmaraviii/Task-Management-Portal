import { useAuth } from '../context/AuthContext.jsx';
import EmployeeDashboard from './EmployeeDashboard.jsx';
import ManagerDashboard from './ManagerDashboard.jsx';
import AdminDashboard from './AdminDashboard.jsx';

/**
 * One URL, three dashboards. Picking the component by role keeps the routing
 * table small and means the correct view is chosen from the server-issued
 * user object rather than from anything the user can type into the address
 * bar. Each dashboard then calls endpoints that scope their own data anyway,
 * so rendering the "wrong" one would show nothing useful.
 */
export default function Dashboard() {
  const { user } = useAuth();

  if (user.role === 'ADMIN') return <AdminDashboard />;
  if (user.role === 'MANAGER') return <ManagerDashboard />;
  return <EmployeeDashboard />;
}
