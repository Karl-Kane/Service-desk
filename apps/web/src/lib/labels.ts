import type { Priority, Role, TicketStatus } from '@service-desk/api-client';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting: 'Ожидает ответа',
  resolved: 'Решена',
  closed: 'Закрыта',
  reopened: 'Переоткрыта',
};

/** Подпись кнопки перехода — глагол, а не название статуса. */
export const TRANSITION_LABELS: Record<TicketStatus, string> = {
  new: 'Новая',
  in_progress: 'Взять в работу',
  waiting: 'Ждать ответа клиента',
  resolved: 'Отметить решённой',
  closed: 'Закрыть',
  reopened: 'Переоткрыть',
};

export const PRIORITY_LABELS: Record<Priority, string> = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
export const ROLE_LABELS: Record<Role, string> = { client: 'Клиент', agent: 'Исполнитель', admin: 'Администратор' };

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}
