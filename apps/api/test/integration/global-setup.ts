import pg from 'pg';
import { createDb } from '../../src/db/index.js';
import { migrateToLatest } from '../../src/db/migrator.js';
import { TEST_DATABASE_URL } from './env.js';

/**
 * Выполняется один раз до всех тестов:
 *  1) создаёт базу service_desk_test, если её нет (локально удобно; в CI её создаёт service container);
 *  2) накатывает ВСЕ миграции — тесты заодно проверяют, что миграции применяются на чистую БД.
 */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('select 1 from pg_database where datname = $1', [dbName]);
  if (exists.rowCount === 0) await admin.query(`create database "${dbName}"`);
  await admin.end();

  const db = createDb(TEST_DATABASE_URL);
  const { error } = await migrateToLatest(db);
  await db.destroy();
  if (error) throw error;
}
