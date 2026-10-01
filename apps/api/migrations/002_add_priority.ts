import { sql, type Kysely } from 'kysely';

/**
 * Добавляем приоритет заявки.
 *
 * Почему здесь можно одним шагом: начиная с PostgreSQL 11 `ADD COLUMN ... NOT NULL DEFAULT <константа>`
 * — это изменение только метаданных: значение по умолчанию записывается в каталог, строки не
 * переписываются, блокировка ACCESS EXCLUSIVE держится миллисекунды.
 *
 * Когда так НЕЛЬЗЯ (большая таблица, и значение нужно вычислить или default не константа),
 * делаем expand → backfill → contract в несколько релизов:
 *   1. `ADD COLUMN priority text NULL` (мгновенно), приложение начинает писать колонку;
 *   2. backfill пачками: `UPDATE ... WHERE id BETWEEN ...` — короткие транзакции, без долгих блокировок;
 *   3. `ADD CONSTRAINT ... CHECK (priority IS NOT NULL) NOT VALID` (мгновенно),
 *      затем `VALIDATE CONSTRAINT` — сканирует таблицу под SHARE UPDATE EXCLUSIVE, запись не блокирует;
 *   4. `ALTER COLUMN SET NOT NULL` — PG 12+ видит валидный CHECK и не сканирует таблицу повторно;
 *      старый CHECK удаляем.
 * Прямой `SET NOT NULL` на большой таблице = полный скан под ACCESS EXCLUSIVE = простой.
 *
 * Индекс: на проде с большой таблицей нужен `CREATE INDEX CONCURRENTLY` (не блокирует запись),
 * но он не работает внутри транзакции, а Kysely Migrator выполняет миграции в транзакции.
 * Для такого случая выносим индекс в отдельную миграцию без транзакции. Здесь таблица маленькая.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('tickets')
    .addColumn('priority', 'text', (c) =>
      c.notNull().defaultTo('normal').check(sql`priority in ('low', 'normal', 'high')`),
    )
    .execute();

  await db.schema.createIndex('tickets_priority_idx').on('tickets').column('priority').execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('tickets_priority_idx').execute();
  await db.schema.alterTable('tickets').dropColumn('priority').execute();
}
