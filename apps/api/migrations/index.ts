import type { Migration } from 'kysely/migration';
import * as m001 from './001_init.js';
import * as m002 from './002_add_priority.js';

// Статический реестр миграций. Почему не FileMigrationProvider (чтение каталога):
// после сборки tsup в бандле нет отдельных файлов миграций, а статический импорт
// гарантирует, что в образ попадут ровно те миграции, что были на момент сборки.
// Порядок применения — по алфавиту ключей, поэтому префикс NNN_ обязателен.
export const migrations: Record<string, Migration> = {
  '001_init': m001,
  '002_add_priority': m002,
};
