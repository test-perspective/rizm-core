import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { AuthProvider } from './auth/AuthContext';
import { RequireRole } from './auth/RequireRole';
import { KeelWorkspace } from './KeelWorkspace';
import { LoginPage } from './pages/LoginPage';
import { MePage } from './pages/MePage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminUserCreatePage } from './pages/AdminUserCreatePage';
import { UserGroupsPage } from './pages/UserGroupsPage';
import { AppDialogProvider } from './components/dialogs';
import { AuthenticatedAppLayout } from './layout/AuthenticatedAppLayout';

export default function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <AuthProvider>
        <AppDialogProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AuthenticatedAppLayout />}>
                <Route path="/me" element={<MePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route
                  path="/admin/users"
                  element={
                    <RequireRole minRole="admin">
                      <AdminUsersPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/admin/users/new"
                  element={
                    <RequireRole minRole="admin">
                      <AdminUserCreatePage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/admin/groups"
                  element={
                    <RequireRole minRole="admin">
                      <UserGroupsPage />
                    </RequireRole>
                  }
                />
                <Route path="/p/:projectId" element={<KeelWorkspace />} />
                <Route path="/p/:projectId/v/:viewId" element={<KeelWorkspace />} />
                <Route path="/p/:projectId/v/:viewId/e/:entityId" element={<KeelWorkspace />} />
                <Route path="/" element={<KeelWorkspace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AppDialogProvider>
      </AuthProvider>
    </LocalizationProvider>
  );
}
