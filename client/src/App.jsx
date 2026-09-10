import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminTeams from './pages/AdminTeams.jsx';
import TaskDetail from './pages/TaskDetail.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* One route, three dashboards — Dashboard picks by role. */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />

        {/* Role-restricted routes. The API enforces the same rule again. */}
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/teams"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminTeams />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
