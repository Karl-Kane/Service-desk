// Создание первого администратора на проде:
//   docker compose run --rm -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... api node dist/create-admin.js
// Пароль передаётся через переменную окружения, а не аргументом (аргументы видны в `ps`).
import { createDb } from './db/index.js';
import { hashPassword } from './lib/password.js';

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  console.error('Required: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD (>= 12 chars)');
  process.exit(1);
}

const db = createDb(DATABASE_URL);
const row = await db
  .insertInto('users')
  .values({
    email: ADMIN_EMAIL,
    name: ADMIN_NAME ?? 'Administrator',
    role: 'admin',
    password_hash: await hashPassword(ADMIN_PASSWORD),
  })
  .onConflict((oc) => oc.column('email').doNothing())
  .returning('id')
  .executeTakeFirst();
console.log(JSON.stringify({ msg: row ? 'admin created' : 'admin already exists', email: ADMIN_EMAIL }));
await db.destroy();
