import type { TicketStatus } from '@service-desk/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { api, unwrap } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatDate, STATUS_LABELS } from '../lib/labels';

const PAGE_SIZE = 20;

export function TicketListPage() {
  const { data: me } = useMe();
  // Фильтр и страница живут в URL: ссылкой можно поделиться, "назад" в браузере работает.
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as TicketStatus | null) ?? undefined;
  const page = Number(params.get('page') ?? 1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['tickets', { status, page }],
    queryFn: () => unwrap(api.GET('/tickets', { params: { query: { status, page, pageSize: PAGE_SIZE } } })),
    placeholderData: keepPreviousData, // при смене страницы не мигаем пустым экраном
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function update(next: { status?: string; page?: number }) {
    const p = new URLSearchParams(params);
    if ('status' in next) {
      if (next.status) p.set('status', next.status);
      else p.delete('status');
      p.delete('page');
    }
    if (next.page) p.set('page', String(next.page));
    setParams(p);
  }

  return (
    <section>
      <div className="toolbar">
        <h1>{me?.role === 'client' ? 'Мои заявки' : 'Все заявки'}</h1>
        <select value={status ?? ''} onChange={(e) => update({ status: e.target.value })} aria-label="Фильтр по статусу">
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Link to="/tickets/new" className="btn primary">
          Новая заявка
        </Link>
      </div>

      {isPending && <p className="muted">Загрузка…</p>}
      {isError && <p className="error">Не удалось загрузить заявки: {error.message}</p>}
      {data && data.items.length === 0 && <p className="muted">Заявок нет.</p>}

      {data && data.items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Тема</th>
              <th>Статус</th>
              <th>Приоритет</th>
              {me?.role !== 'client' && <th>Автор</th>}
              <th>Исполнитель</th>
              <th>Обновлена</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  <Link to={`/tickets/${t.id}`}>{t.title}</Link>
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td>
                  <PriorityBadge priority={t.priority} />
                </td>
                {me?.role !== 'client' && <td>{t.author.name}</td>}
                <td>{t.assignee?.name ?? <span className="muted">—</span>}</td>
                <td className="muted">{formatDate(t.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && totalPages > 1 && (
        <div className="pager">
          <button className="btn" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
            ←
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button className="btn" disabled={page >= totalPages} onClick={() => update({ page: page + 1 })}>
            →
          </button>
        </div>
      )}
    </section>
  );
}
