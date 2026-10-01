import { zodResolver } from '@hookform/resolvers/zod';
import type { Role } from '@service-desk/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError, unwrap } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatDate, ROLE_LABELS } from '../lib/labels';

const schema = z.object({
  email: z.email('Некорректный email'),
  name: z.string().trim().min(1, 'Введите имя'),
  password: z.string().min(8, 'Минимум 8 символов'),
  role: z.enum(['client', 'agent', 'admin']),
});
type FormValues = z.infer<typeof schema>;

export function UsersPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => unwrap(api.GET('/users')) });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', name: '', password: '', role: 'client' },
  });

  const create = useMutation({
    mutationFn: (body: FormValues) => unwrap(api.POST('/users', { body })),
    onSuccess: () => {
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) form.setError('email', { message: 'Email уже занят' });
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      unwrap(api.PATCH('/users/{id}', { params: { path: { id } }, body: { role } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const { errors } = form.formState;

  return (
    <section>
      <h1>Пользователи</h1>
      {users.isError && <p className="error">{users.error.message}</p>}
      {changeRole.error && <p className="error">{changeRole.error.message}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Email</th>
            <th>Роль</th>
            <th>Создан</th>
          </tr>
        </thead>
        <tbody>
          {users.data?.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <select
                  value={u.role}
                  disabled={u.id === me?.id || changeRole.isPending}
                  onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value as Role })}
                >
                  {Object.entries(ROLE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              <td className="muted">{formatDate(u.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Добавить пользователя</h2>
      <form className="card inline-form" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
        <label>
          Email
          <input {...form.register('email')} />
          {errors.email && <span className="error">{errors.email.message}</span>}
        </label>
        <label>
          Имя
          <input {...form.register('name')} />
          {errors.name && <span className="error">{errors.name.message}</span>}
        </label>
        <label>
          Пароль
          <input type="password" autoComplete="new-password" {...form.register('password')} />
          {errors.password && <span className="error">{errors.password.message}</span>}
        </label>
        <label>
          Роль
          <select {...form.register('role')}>
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" type="submit" disabled={create.isPending}>
          Создать
        </button>
      </form>
    </section>
  );
}
