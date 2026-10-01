import { sql, type Kysely } from 'kysely';

// Миграции принимают Kysely<any>: схема в момент миграции — это схема "на тот момент",
// а не текущий DB-интерфейс. Иначе старая миграция перестанет компилироваться после изменения типов.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // citext — регистронезависимый текст: уникальность email без lower() в каждом запросе.
  await sql`create extension if not exists citext`.execute(db);

  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', sql`citext`, (c) => c.notNull().unique())
    .addColumn('password_hash', 'text', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('role', 'text', (c) => c.notNull().check(sql`role in ('client', 'agent', 'admin')`))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('sessions')
    // id = sha256(токена из cookie). Сам токен в БД не хранится: утечка дампа не даёт войти.
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('expires_at', 'timestamptz', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  // Postgres НЕ создаёт индекс на внешний ключ автоматически (в отличие от PK/UNIQUE).
  await db.schema.createIndex('sessions_user_id_idx').on('sessions').column('user_id').execute();

  await db.schema
    .createTable('tickets')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('author_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('assignee_id', 'uuid', (c) => c.references('users.id'))
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('body', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) =>
      c
        .notNull()
        .defaultTo('new')
        .check(sql`status in ('new', 'in_progress', 'waiting', 'resolved', 'closed', 'reopened')`),
    )
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('tickets_author_id_idx').on('tickets').column('author_id').execute();
  await db.schema.createIndex('tickets_assignee_id_idx').on('tickets').column('assignee_id').execute();
  // Составной индекс под главный запрос списка: WHERE status = ? ORDER BY created_at DESC.
  await db.schema
    .createIndex('tickets_status_created_at_idx')
    .on('tickets')
    .expression(sql`status, created_at desc`)
    .execute();

  await db.schema
    .createTable('comments')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('ticket_id', 'bigint', (c) => c.notNull().references('tickets.id').onDelete('cascade'))
    .addColumn('author_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('body', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('comments_ticket_id_idx').on('comments').columns(['ticket_id', 'created_at']).execute();

  await db.schema
    .createTable('ticket_events')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('ticket_id', 'bigint', (c) => c.notNull().references('tickets.id').onDelete('cascade'))
    .addColumn('actor_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('payload', 'jsonb', (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex('ticket_events_ticket_id_idx')
    .on('ticket_events')
    .columns(['ticket_id', 'created_at'])
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('ticket_events').execute();
  await db.schema.dropTable('comments').execute();
  await db.schema.dropTable('tickets').execute();
  await db.schema.dropTable('sessions').execute();
  await db.schema.dropTable('users').execute();
}
