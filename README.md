# Service Desk

Портал заявок (личный кабинет): **клиент** создаёт заявки и видит только свои, **исполнитель** берёт их в работу
и ведёт по статусам, **администратор** управляет пользователями и ролями. Каждое изменение пишется в журнал.

Пет-проект, закрывающий полный цикл: БД → API → сгенерированный клиент → React → тесты → Docker →
сервер (Ansible) → секреты → бэкапы → CI/CD → эксплуатация.


## Стек

**API:** Node 22, Fastify 5, TypeScript strict, TypeBox, `@fastify/swagger` (+ UI на `/docs`), pino, argon2, сессии в БД.
**БД:** PostgreSQL 16, Kysely (query builder + миграции), kysely-codegen.
**Web:** React 19, Vite, React Router, TanStack Query, React Hook Form + Zod, клиент `openapi-fetch` из OpenAPI.
**Тесты:** Vitest (юнит + интеграция на реальном Postgres), Playwright (e2e на поднятом `docker compose`).
**Инфра:** Docker multi-stage, Compose, Caddy (HTTPS), Ansible, SOPS + age, GitHub Actions, GHCR, systemd-таймеры.

## Быстрый старт

Нужны Node 22, pnpm 9 (`corepack enable`), Docker.

```bash
pnpm install
docker compose up -d db          # Postgres на 127.0.0.1:5432 (занят? → DB_PORT=5433 в .env, см. GUIDE)
pnpm db:migrate && pnpm db:seed  # схема + демо-пользователи
pnpm dev                         # API http://localhost:3000 (Swagger: /docs), Web http://localhost:5173
```

Демо-пользователи: `client@example.com / client12345`, `agent@example.com / agent12345`, `admin@example.com / admin12345`.

Весь стек в Docker, как на проде:

```bash
docker compose up -d --build --wait
docker compose exec api node dist/seed.js
# http://localhost:8080
pnpm e2e
```

## Структура

```
apps/api            Fastify API: src/{routes,plugins,domain,db,lib}, migrations/, test/{unit,integration}
apps/web            React SPA
packages/api-client openapi.json → schema.d.ts (генерируется) + createApiClient()
e2e                 Playwright
infra/caddy         Dockerfile образа web (статика + Caddy) и Caddyfile
infra/ansible       роли base / docker / app / backup, плейбуки site.yml и deploy.yml
infra/backup        backup.sh, restore-check.sh
infra/secrets       prod.enc.yaml (SOPS), шаблон
.github/workflows   ci.yml (PR), deploy.yml (main → прод)
```

## Команды

| Команда | Что делает |
|---|---|
| `pnpm dev` | API + Web в режиме разработки |
| `pnpm test` | юнит + интеграционные тесты (нужна БД) |
| `pnpm -F api test:unit` | только юнит-тесты |
| `pnpm lint`, `pnpm typecheck` | ESLint, tsc по всем пакетам |
| `pnpm gen:client` | OpenAPI из кода API → типы клиента |
| `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:codegen` | миграции, демо-данные, типы БД из живой схемы |
| `pnpm e2e` | Playwright против `http://localhost:8080` |

