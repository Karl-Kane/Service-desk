import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { api, ApiError, unwrap } from '../lib/api';
import { PRIORITY_LABELS } from '../lib/labels';

// Ограничения совпадают с серверной схемой (CreateBody в apps/api/src/routes/tickets).
const schema = z.object({
  title: z.string().trim().min(3, 'Минимум 3 символа').max(200, 'Максимум 200 символов'),
  body: z.string().trim().min(1, 'Опишите проблему').max(10_000),
  priority: z.enum(['low', 'normal', 'high']),
});
type FormValues = z.infer<typeof schema>;

export function NewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', body: '', priority: 'normal' },
  });

  const create = useMutation({
    mutationFn: (body: FormValues) => unwrap(api.POST('/tickets', { body })),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      navigate(`/tickets/${ticket.id}`);
    },
    onError: (err) => {
      // Ошибки валидации сервера (problem+json errors[]) раскладываем по полям формы.
      if (err instanceof ApiError) {
        for (const e of err.problem?.errors ?? []) {
          if (e.field === 'title' || e.field === 'body' || e.field === 'priority') {
            form.setError(e.field, { message: e.message });
          }
        }
      }
    },
  });

  const { errors } = form.formState;

  return (
    <section className="narrow">
      <h1>Новая заявка</h1>
      <form className="card" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
        <label>
          Тема
          <input {...form.register('title')} />
          {errors.title && <span className="error">{errors.title.message}</span>}
        </label>
        <label>
          Описание
          <textarea rows={6} {...form.register('body')} />
          {errors.body && <span className="error">{errors.body.message}</span>}
        </label>
        <label>
          Приоритет
          <select {...form.register('priority')}>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {create.isError && !(create.error instanceof ApiError && create.error.status === 400) && (
          <p className="error">Не удалось создать заявку: {create.error.message}</p>
        )}
        <button className="btn primary" type="submit" disabled={create.isPending}>
          Создать
        </button>
      </form>
    </section>
  );
}
