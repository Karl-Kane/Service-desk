import { expect, test, type Browser, type Page } from '@playwright/test';

// Демо-пользователи создаются `node dist/seed.js` (apps/api/src/seed.ts) перед прогоном.
const CLIENT = { email: 'client@example.com', password: 'client12345' };
const AGENT = { email: 'agent@example.com', password: 'agent12345' };

async function loginAs(browser: Browser, user: { email: string; password: string }): Promise<Page> {
  // Отдельный контекст = отдельные cookie: клиент и исполнитель — два независимых "браузера".
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Пароль').fill(user.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
  return page;
}

test('клиент создаёт заявку → исполнитель берёт в работу → клиент видит новый статус', async ({ browser }) => {
  const title = `E2E: не работает принтер ${Date.now()}`;

  // 1. Клиент создаёт заявку
  const client = await loginAs(browser, CLIENT);
  await client.getByRole('link', { name: 'Новая заявка' }).click();
  await client.getByLabel('Тема').fill(title);
  await client.getByLabel('Описание').fill('Принтер на 3 этаже печатает пустые листы.');
  await client.getByLabel('Приоритет').selectOption('high');
  await client.getByRole('button', { name: 'Создать' }).click();

  await expect(client.getByRole('heading', { name: title })).toBeVisible();
  await expect(client.getByTestId('ticket-status')).toHaveText('Новая');
  const ticketUrl = client.url();

  // 2. Исполнитель находит её и берёт в работу
  const agent = await loginAs(browser, AGENT);
  await agent.getByRole('link', { name: title }).click();
  await agent.getByRole('button', { name: 'Взять в работу' }).click();
  await expect(agent.getByTestId('ticket-status')).toHaveText('В работе');
  await agent.getByLabel('Комментарий').fill('Посмотрю сегодня до 18:00.');
  await agent.getByRole('button', { name: 'Отправить' }).click();
  await expect(agent.getByText('Посмотрю сегодня до 18:00.')).toBeVisible();

  // 3. Клиент обновляет страницу и видит новый статус, исполнителя и комментарий
  await client.goto(ticketUrl);
  await expect(client.getByTestId('ticket-status')).toHaveText('В работе');
  await expect(client.getByText('Исполнитель: Игорь Исполнитель')).toBeVisible();
  await expect(client.getByText('Посмотрю сегодня до 18:00.')).toBeVisible();
  // У клиента нет кнопки "Взять в работу" — переход ему запрещён
  await expect(client.getByRole('button', { name: 'Взять в работу' })).toHaveCount(0);
});

test('клиент не видит чужие заявки и не попадает в админку', async ({ browser }) => {
  const other = await loginAs(browser, { email: 'client2@example.com', password: 'client12345' });
  await expect(other.getByText('Не приходит письмо для сброса пароля')).toHaveCount(0);
  await other.goto('/users');
  await expect(other).toHaveURL(/\/$/);
});
