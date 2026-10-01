import type { Kysely } from 'kysely';
import type { DB } from '../../db/types.js';
import type { AuthUser } from '../../lib/session.js';
import { toTicketDto } from '../mappers.js';

/**
 * Базовый запрос заявок с автором и исполнителем (один SQL с JOIN, без N+1)
 * и с правилом видимости — в ОДНОМ месте: клиент видит только свои заявки, остальные роли — все.
 * Любое чтение заявок идёт через эту функцию, поэтому "забыть проверку" в новом роуте сложнее.
 */
export function selectVisibleTickets(db: Kysely<DB>, user: AuthUser) {
  return db
    .selectFrom('tickets as t')
    .innerJoin('users as a', 'a.id', 't.author_id')
    .leftJoin('users as s', 's.id', 't.assignee_id')
    .select([
      't.id',
      't.title',
      't.body',
      't.status',
      't.priority',
      't.created_at',
      't.updated_at',
      't.author_id',
      'a.name as author_name',
      'a.role as author_role',
      't.assignee_id',
      's.name as assignee_name',
      's.role as assignee_role',
    ])
    .$if(user.role === 'client', (qb) => qb.where('t.author_id', '=', user.id));
}

/** Заявка, видимая пользователю, или undefined (→ 404, даже если заявка существует, но чужая). */
export async function findVisibleTicket(db: Kysely<DB>, id: number | string, user: AuthUser) {
  const row = await selectVisibleTickets(db, user).where('t.id', '=', String(id)).executeTakeFirst();
  return row ? toTicketDto(row) : undefined;
}
