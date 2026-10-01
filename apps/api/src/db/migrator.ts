import { Migrator, type MigrationResultSet } from 'kysely/migration';
import { migrations } from '../../migrations/index.js';
import type { Database } from './index.js';

export function createMigrator(db: Database): Migrator {
  return new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    // Kysely ведёт учёт в таблицах kysely_migration и kysely_migration_lock.
    // Lock защищает от двух одновременных прогонов (например, два контейнера migrate).
  });
}

export async function migrateToLatest(db: Database): Promise<MigrationResultSet> {
  return createMigrator(db).migrateToLatest();
}
