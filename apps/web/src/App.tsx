import type { Role } from '@service-desk/api-client';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { useMe } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { NewTicketPage } from './pages/NewTicketPage';
import { TicketListPage } from './pages/TicketListPage';
import { TicketPage } from './pages/TicketPage';
import { UsersPage } from './pages/UsersPage';

/** Гард маршрута. Это только UX: настоящая проверка прав — на сервере (RBAC в API). */
function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { data: me, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <p className="muted center">Загрузка…</p>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(me.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<TicketListPage />} />
        <Route path="tickets/new" element={<NewTicketPage />} />
        <Route path="tickets/:id" element={<TicketPage />} />
        <Route
          path="users"
          element={
            <RequireAuth roles={['admin']}>
              <UsersPage />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
