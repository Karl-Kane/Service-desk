import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { ROLE_LABELS } from '../lib/labels';

export function Layout() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: () => api.POST('/auth/logout'),
    onSuccess: () => {
      // Сбрасываем ВЕСЬ кэш: данные прошлого пользователя не должны мелькнуть следующему.
      queryClient.clear();
      navigate('/login');
    },
  });

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Service Desk
        </Link>
        <nav>
          <NavLink to="/" end>
            Заявки
          </NavLink>
          {me?.role === 'admin' && <NavLink to="/users">Пользователи</NavLink>}
        </nav>
        <div className="user">
          <span data-testid="current-user">
            {me?.name} · <span className="muted">{me ? ROLE_LABELS[me.role] : ''}</span>
          </span>
          <button className="btn ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Выйти
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
