# CLAUDE.md — правила для ИИ-агентов в этом репозитории

Портал заявок (Service Desk): клиент создаёт заявки, исполнитель их ведёт, админ управляет пользователями.
Подробное устройство — `docs/GUIDE.md`. Эксплуатация — `docs/RUNBOOK.md`.

## Стек
- Монорепо pnpm workspaces: `apps/api` (Fastify 5 + TypeScript strict + Kysely + PostgreSQL 16),
  `apps/web` (React 19 + Vite + React Router + TanStack Query + React Hook Form + Zod),
  `packages/api-client` (сгенерированный из OpenAPI клиент), `e2e` (Playwright).
- Инфра: Docker / Compose, Caddy, Ansible, SOPS + age, GitHub Actions, GHCR.

## Команды
```bash
docker compose up -d db          # Postgres для разработки и тестов (порт DB_PORT, по умолчанию 5432)
pnpm dev                         # api :3000 + web :5173
pnpm test                        # юнит + интеграция (нужна запущенная db)
pnpm -F api test:unit            # только юнит-тесты, без БД
pnpm lint && pnpm typecheck
pnpm gen:client                  # ОБЯЗАТЕЛЬНО после любого изменения схем/роутов API
pnpm db:migrate / pnpm db:seed
docker compose up -d --build --wait && docker compose exec api node dist/seed.js && pnpm e2e
```

## Конвенции (обязательны)
1. **Ошибки только через problem+json.** В роутах — `throw AppError.notFound(...)` / `.conflict(...)` и т.п.
   (`apps/api/src/errors.ts`). Никаких `reply.status(4xx).send({...})` с самодельным телом.
2. **SQL только через Kysely** (типобезопасный query builder). `sql\`\`` — только там, где без него нельзя
   (`now()`, расширения), и только с параметрами, никакой конкатенации строк.
3. **Изменение схемы БД = новая миграция** `apps/api/migrations/NNN_*.ts` + регистрация в `migrations/index.ts`
   + `pnpm db:codegen`. Старые миграции не редактировать никогда.
4. **Каждое изменение заявки пишет событие в `ticket_events` в той же транзакции.**
5. **Доступ к заявкам — только через `selectVisibleTickets` / `findVisibleTicket`** (`routes/tickets/queries.ts`).
   Чужая заявка для клиента = 404, не 403.
6. **Авторизация — в хуке `onRequest`**, не `preHandler` (иначе валидация тела срабатывает раньше и аноним получает 400).
7. После изменения API — `pnpm gen:client` и коммит `packages/api-client/*`. CI проверяет `git diff`.
8. Новый код — с тестом: бизнес-правило → юнит, эндпоинт → интеграционный тест через `app.inject()`.

## Нельзя без явного разрешения человека
- Добавлять/обновлять зависимости (`package.json`, `pnpm-lock.yaml`).
- Трогать `infra/secrets/**` (зашифрованные секреты), `.sops.yaml`, GitHub Secrets.
- Менять уже применённые миграции, `.github/workflows/deploy.yml`, `infra/ansible/roles/base` (SSH/ufw — можно потерять доступ к серверу).
- Отключать/ослаблять тесты, линтер, gitleaks, чтобы «стало зелёным».

## Как оформлять задачу агенту
Шаблон и примеры — `docs/agent-tasks/`. Каждая задача: Цель → Контекст → Границы → Готово, когда.
