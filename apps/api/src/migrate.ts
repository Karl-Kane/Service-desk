// CLI миграций: `node dist/migrate.js` (в контейнере migrate) или `pnpm db:migrate` локально.
// `node dist/migrate.js down` — откатить одну последнюю миграцию.
import { createDb } from './db/index.js';
import { createMigrator } from './db/migrator.js';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://service_desk:service_desk@localhost:5432/service_desk';

async function main(): Promise<void> {
  const db = createDb(databaseUrl);
  const migrator = createMigrator(db);
  const direction = process.argv[2] === 'down' ? 'down' : 'up';

  const { error, results } =
    direction === 'down' ? await migrator.migrateDown() : await migrator.migrateToLatest();

  for (const r of results ?? []) {
    const line = JSON.stringify({ migration: r.migrationName, direction: r.direction, status: r.status });
    if (r.status === 'Error') console.error(line);
    else console.log(line);
  }
  if (results?.length === 0) console.log(JSON.stringify({ msg: 'no pending migrations' }));

  await db.destroy();
  if (error) {
    console.error('migration failed', error);
    // Ненулевой код выхода → compose не запустит api (service_completed_successfully).
    process.exit(1);
  }
}

void main();
