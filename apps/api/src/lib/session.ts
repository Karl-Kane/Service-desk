import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '../db/index.js';
import type { Role } from '../domain/ticket-status.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Токен — 256 бит случайности. В cookie уходит токен, в БД — только его sha256. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(db: Database, userId: string, ttlHours: number) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await db.insertInto('sessions').values({ id: hashToken(token), user_id: userId, expires_at: expiresAt }).execute();
  // Заодно чистим протухшие сессии этого пользователя — таблица не растёт бесконечно.
  await db.deleteFrom('sessions').where('user_id', '=', userId).where('expires_at', '<', new Date()).execute();
  return { token, expiresAt };
}

export async function findSessionUser(db: Database, token: string): Promise<AuthUser | null> {
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['users.id', 'users.email', 'users.name', 'users.role'])
    .where('sessions.id', '=', hashToken(token))
    .where('sessions.expires_at', '>', new Date())
    .executeTakeFirst();
  return row ? { ...row, role: row.role as Role } : null;
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.deleteFrom('sessions').where('id', '=', hashToken(token)).execute();
}
