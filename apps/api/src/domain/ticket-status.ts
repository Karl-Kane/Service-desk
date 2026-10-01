/**
 * Машина состояний заявки. Чистые функции без БД и HTTP — поэтому легко покрываются
 * юнит-тестом "таблицей всех пар" (test/ticket-status.test.ts).
 *
 *   new ──► in_progress ◄──► waiting
 *               │               │
 *               ▼               ▼
 *            resolved ◄─────────┘
 *             │    │
 *             ▼    ▼
 *         closed  reopened ──► in_progress
 */

export const TICKET_STATUSES = ['new', 'in_progress', 'waiting', 'resolved', 'closed', 'reopened'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const ROLES = ['client', 'agent', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const PRIORITIES = ['low', 'normal', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Рёбра графа и роли, которым разрешён переход. admin может всё, что может agent. */
const TRANSITIONS: Record<TicketStatus, Partial<Record<TicketStatus, readonly Role[]>>> = {
  new: { in_progress: ['agent', 'admin'] },
  in_progress: { waiting: ['agent', 'admin'], resolved: ['agent', 'admin'] },
  waiting: { in_progress: ['agent', 'admin'], resolved: ['agent', 'admin'] },
  // Решённую заявку клиент может принять (closed) или вернуть (reopened).
  resolved: { closed: ['client', 'agent', 'admin'], reopened: ['client', 'agent', 'admin'] },
  reopened: { in_progress: ['agent', 'admin'] },
  closed: {},
};

/** Существует ли такое ребро в графе вообще (независимо от роли). Нет → HTTP 409. */
export function isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from][to] !== undefined;
}

/** Разрешён ли переход данной роли. Ребро есть, но роли нельзя → HTTP 403. */
export function canTransition(from: TicketStatus, to: TicketStatus, role: Role): boolean {
  return TRANSITIONS[from][to]?.includes(role) ?? false;
}

/** Список статусов, в которые роль может перевести заявку из текущего — для кнопок в UI. */
export function allowedTargets(from: TicketStatus, role: Role): TicketStatus[] {
  return TICKET_STATUSES.filter((to) => canTransition(from, to, role));
}
