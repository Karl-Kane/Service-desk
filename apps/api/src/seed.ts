// Демо-данные для разработки и e2e: три пользователя (по одному на роль) и пара заявок.
// Идемпотентно: повторный запуск ничего не дублирует. В production отказывается работать.
// Пароли ниже — тестовые фикстуры, а не секреты: в проде этих пользователей нет.
import { createDb } from './db/index.js';
import { hashPassword } from './lib/password.js';

const DEMO_USERS = [
  { email: 'admin@example.com', name: 'Анна Админ', role: 'admin', password: 'admin12345' },
  { email: 'agent@example.com', name: 'Игорь Исполнитель', role: 'agent', password: 'agent12345' },
  { email: 'client@example.com', name: 'Катя Клиент', role: 'client', password: 'client12345' },
  { email: 'client2@example.com', name: 'Пётр Клиент', role: 'client', password: 'client12345' },
] as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('Refusing to seed demo users in production');
    process.exit(1);
  }
  const db = createDb(
    process.env.DATABASE_URL ?? 'postgres://service_desk:service_desk@localhost:5432/service_desk',
  );

  for (const u of DEMO_USERS) {
    await db
      .insertInto('users')
      .values({ email: u.email, name: u.name, role: u.role, password_hash: await hashPassword(u.password) })
      .onConflict((oc) => oc.column('email').doNothing())
      .execute();
  }

  const client = await db.selectFrom('users').select('id').where('email', '=', 'client@example.com').executeTakeFirstOrThrow();
  const existing = await db.selectFrom('tickets').select('id').where('author_id', '=', client.id).executeTakeFirst();
  if (!existing) {
    for (const [title, body, priority] of [
      ['Не приходит письмо для сброса пароля', 'Пробовал трижды, в спаме тоже нет.', 'high'],
      ['Выгрузка отчёта в Excel', 'Хотелось бы выгружать список заказов в xlsx.', 'low'],
    ] as const) {
      const t = await db
        .insertInto('tickets')
        .values({ author_id: client.id, title, body, priority })
        .returning('id')
        .executeTakeFirstOrThrow();
      await db
        .insertInto('ticket_events')
        .values({ ticket_id: t.id, actor_id: client.id, type: 'created', payload: JSON.stringify({ title, priority }) })
        .execute();
    }
  }

  console.log(JSON.stringify({ msg: 'seed complete', users: DEMO_USERS.map((u) => u.email) }));
  await db.destroy();
}

await main();
