import { sql } from 'kysely';
import { buildApp, type App } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createDb, type Database } from '../../src/db/index.js';
import type { Role } from '../../src/domain/ticket-status.js';
import { hashPassword } from '../../src/lib/password.js';
import { TEST_DATABASE_URL } from './env.js';

export interface TestContext {
  app: App;
  db: Database;
}

/** Настоящее приложение + настоящая БД. Сеть не нужна: запросы идут через app.inject(). */
export async function createTestContext(): Promise<TestContext> {
  const config = loadConfig({ nodeEnv: 'test', logLevel: 'silent', databaseUrl: TEST_DATABASE_URL, cookieSecure: false });
  const db = createDb(TEST_DATABASE_URL);
  const app = await buildApp({ config, db });
  await app.ready();
  return { app, db };
}

export async function closeTestContext({ app, db }: TestContext): Promise<void> {
  await app.close();
  await db.destroy();
}

/** Чистая БД перед каждым тестом. RESTART IDENTITY — id заявок снова с 1, CASCADE — по FK. */
export async function resetDb(db: Database): Promise<void> {
  await sql`truncate table ticket_events, comments, tickets, sessions, users restart identity cascade`.execute(db);
}

const PASSWORD = 'password123';
// argon2 намеренно медленный — хэшируем тестовый пароль один раз на весь прогон.
let passwordHash: Promise<string> | undefined;

export async function createUser(db: Database, role: Role, email = `${role}-${crypto.randomUUID()}@test.local`) {
  passwordHash ??= hashPassword(PASSWORD);
  return db
    .insertInto('users')
    .values({ email, name: `Test ${role}`, role, password_hash: await passwordHash })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Логин через настоящий эндпоинт; возвращает заголовок Cookie для следующих запросов. */
export async function login(app: App, email: string, password = PASSWORD): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'sid');
  if (!cookie) throw new Error('no session cookie');
  return `sid=${cookie.value}`;
}

export async function createUserAndLogin(ctx: TestContext, role: Role) {
  const user = await createUser(ctx.db, role);
  const cookie = await login(ctx.app, user.email);
  return { user, cookie };
}

export async function createTicket(app: App, cookie: string, title = 'Printer is broken') {
  const res = await app.inject({
    method: 'POST',
    url: '/tickets',
    headers: { cookie },
    payload: { title, body: 'Details', priority: 'high' },
  });
  if (res.statusCode !== 201) throw new Error(`create ticket failed: ${res.statusCode} ${res.body}`);
  return res.json<{ id: number; status: string }>();
}
