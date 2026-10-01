import { defineConfig, devices } from '@playwright/test';

/**
 * E2E идут против ПОЛНОСТЬЮ поднятого стека (`docker compose up`): Caddy → web-статика + /api → api → Postgres.
 * Сервер Playwright не запускает сам — так мы тестируем ровно те образы, что поедут в прод.
 * BASE_URL по умолчанию — порт Caddy из compose.yml.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    // trace пишется только при повторе упавшего теста → артефакт в CI для разбора.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
