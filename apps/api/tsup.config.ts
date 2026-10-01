import { defineConfig } from 'tsup';

// Собираем три точки входа в dist/*.js (ESM, Node 22).
// Зависимости из package.json НЕ бандлятся (tsup по умолчанию делает их external) —
// они ставятся в runtime-образ через `pnpm deploy --prod`.
// Миграции импортируются статически (migrations/index.ts), поэтому попадают внутрь бандла
// и не требуют чтения каталога с диска во время выполнения.
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    migrate: 'src/migrate.ts',
    seed: 'src/seed.ts',
    'create-admin': 'src/create-admin.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
});
