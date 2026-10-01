// Преобразование строк БД (snake_case, Date, bigint-строки) в DTO API (camelCase, ISO-строки, числа).
// Граница явная: наружу никогда не уходит строка БД целиком (например, password_hash).
import type { Selectable } from 'kysely';
import type { Users } from '../db/types.js';
import type { Priority, Role, TicketStatus } from '../domain/ticket-status.js';
import type { TicketDto, UserDto } from '../schemas.js';

export function toUserDto(u: Selectable<Users>): UserDto {
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role, createdAt: u.created_at.toISOString() };
}

export interface TicketRow {
  id: string;
  title: string;
  body: string;
  status: string;
  priority: string;
  created_at: Date;
  updated_at: Date;
  author_id: string;
  author_name: string;
  author_role: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_role: string | null;
}

export function toTicketDto(r: TicketRow): TicketDto {
  return {
    id: Number(r.id),
    title: r.title,
    body: r.body,
    status: r.status as TicketStatus,
    priority: r.priority as Priority,
    author: { id: r.author_id, name: r.author_name, role: r.author_role as Role },
    assignee: r.assignee_id
      ? { id: r.assignee_id, name: r.assignee_name ?? '', role: (r.assignee_role ?? 'agent') as Role }
      : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
