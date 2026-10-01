import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { api, ApiError, unwrap } from '../lib/api';
import { meQueryKey, useMe } from '../lib/auth';

// Zod-схема формы — клиентская валидация для UX. Сервер всё равно валидирует сам (TypeBox).
const schema = z.object({
  email: z.email('Введите корректный email'),
  password: z.string().min(1, 'Введите пароль'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const login = useMutation({
    mutationFn: (body: FormValues) => unwrap(api.POST('/auth/login', { body })),
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryKey, user);
      navigate(from, { replace: true });
    },
  });

  if (me) return <Navigate to="/" replace />;

  const errorText =
    login.error instanceof ApiError && login.error.status === 401
      ? 'Неверный email или пароль'
      : login.error
        ? 'Ошибка входа, попробуйте позже'
        : null;

  return (
    <div className="login">
      <form className="card" onSubmit={form.handleSubmit((v) => login.mutate(v))} noValidate>
        <h1>Вход в Service Desk</h1>
        <label>
          Email
          <input type="email" autoComplete="username" {...form.register('email')} />
          {form.formState.errors.email && <span className="error">{form.formState.errors.email.message}</span>}
        </label>
        <label>
          Пароль
          <input type="password" autoComplete="current-password" {...form.register('password')} />
          {form.formState.errors.password && <span className="error">{form.formState.errors.password.message}</span>}
        </label>
        {errorText && (
          <p className="error" role="alert">
            {errorText}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={login.isPending}>
          {login.isPending ? 'Входим…' : 'Войти'}
        </button>
        {import.meta.env.DEV && (
          <p className="muted small">Демо: client@example.com / client12345, agent@example.com / agent12345</p>
        )}
      </form>
    </div>
  );
}
