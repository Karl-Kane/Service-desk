import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './types.js';

// bigint (int8) по умолчанию приходит строкой — это правильно: JS number теряет точность после 2^53.
// Мы оставляем строку в БД-слое и явно приводим id к number на границе API (см. routes/tickets.ts),
// т.к. bigserial до 2^53 не дорастёт, а клиенту удобнее число.

export type Database = Kysely<DB>;

export function createDb(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    // Не висим вечно, если БД недоступна: /health/ready должен быстро ответить 503.
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
