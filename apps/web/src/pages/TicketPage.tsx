import type { TicketEvent, TicketStatus } from '@service-desk/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { PriorityBadge, StatusBadge } from '../components/Badges';
import { api, ApiError, unwrap } from '../lib/api';
import { formatDate, ROLE_LABELS, STATUS_LABELS, TRANSITION_LABELS } from '../lib/labels';

function describeEvent(e: TicketEvent): string {
  const p = e.payload as Record<string, string>;
  switch (e.type) {
    case 'created':
      return 'создал(а) заявку';
    case 'status_changed':
      return `сменил(а) статус: ${STATUS_LABELS[p.from as TicketStatus]} → ${STATUS_LABELS[p.to as TicketStatus]}`;
    case 'assigned':
      return 'взял(а) заявку в работу';
    case 'comment_added':
      return 'добавил(а) комментарий';
    default:
      return e.type;
  }
}

export function TicketPage() {
  const id = Number(useParams().id);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');

  const detail = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => unwrap(api.GET('/tickets/{id}', { params: { path: { id } } })),
  });
  const events = useQuery({
    queryKey: ['ticket', id, 'events'],
    queryFn: () => unwrap(api.GET('/tickets/{id}/events', { params: { path: { id } } })),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ticket', id] });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  };

  const changeStatus = useMutation({
    mutationFn: (status: TicketStatus) =>
      unwrap(api.PATCH('/tickets/{id}/status', { params: { path: { id } }, body: { status } })),
    onSettled: invalidate, // и при успехе, и при 409 (кто-то успел раньше) — перечитываем актуальное
  });

  const addComment = useMutation({
    mutationFn: (body: string) => unwrap(api.POST('/tickets/{id}/comments', { params: { path: { id } }, body: { body } })),
    onSuccess: () => {
      setComment('');
      invalidate();
    },
  });

  if (detail.isPending) return <p className="muted">Загрузка…</p>;
  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div>
        <p className="error">{notFound ? 'Заявка не найдена' : detail.error.message}</p>
        <Link to="/">← К списку</Link>
      </div>
    );
  }

  const { ticket, comments, allowedTransitions } = detail.data;

  return (
    <section className="ticket">
      <Link to="/" className="muted">
        ← К списку
      </Link>
      <div className="ticket-head">
        <h1>
          #{ticket.id} {ticket.title}
        </h1>
        <div className="meta">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="muted">
            Автор: {ticket.author.name} · Исполнитель: {ticket.assignee?.name ?? '—'} · Создана{' '}
            {formatDate(ticket.createdAt)}
          </span>
        </div>
      </div>

      <div className="card body">{ticket.body}</div>

      {allowedTransitions.length > 0 && (
        <div className="actions">
          {allowedTransitions.map((to) => (
            <button
              key={to}
              className="btn"
              disabled={changeStatus.isPending}
              onClick={() => changeStatus.mutate(to)}
            >
              {TRANSITION_LABELS[to]}
            </button>
          ))}
          {changeStatus.error && <span className="error">{changeStatus.error.message}</span>}
        </div>
      )}

      <div className="columns">
        <div>
          <h2>Комментарии</h2>
          {comments.length === 0 && <p className="muted">Пока нет комментариев.</p>}
          <ul className="comments">
            {comments.map((c) => (
              <li key={c.id} className="card">
                <div className="muted small">
                  {c.author.name} ({ROLE_LABELS[c.author.role]}) · {formatDate(c.createdAt)}
                </div>
                <div className="pre">{c.body}</div>
              </li>
            ))}
          </ul>
          {ticket.status !== 'closed' && (
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                if (comment.trim()) addComment.mutate(comment.trim());
              }}
            >
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Написать комментарий…"
                aria-label="Комментарий"
              />
              <button className="btn primary" type="submit" disabled={addComment.isPending || !comment.trim()}>
                Отправить
              </button>
            </form>
          )}
        </div>
        <aside>
          <h2>История</h2>
          <ul className="events">
            {events.data?.map((e) => (
              <li key={e.id}>
                <span className="muted small">{formatDate(e.createdAt)}</span>
                <br />
                <b>{e.actor.name}</b> {describeEvent(e)}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
