import { defineConfig } from 'vitest/config';

/**
 * Два проекта:
 *  - unit        — чистые функции, без БД, миллисекунды (`pnpm -F api test:unit`);
 *  - integration — app.inject() против настоящего Postgres (`pnpm -F api test:integration`).
 * `pnpm test` гоняет оба.
 */
export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          // Создаёт тестовую БД (если нет) и накатывает миграции один раз перед всеми тестами.
          globalSetup: ['test/integration/global-setup.ts'],
          // Файлы делят одну БД и чистят её TRUNCATE-ом → гоняем последовательно.
          fileParallelism: false,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
