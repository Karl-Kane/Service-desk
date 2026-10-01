/**
 * Генерация OpenAPI-спеки БЕЗ запуска сервера и БЕЗ базы:
 * поднимаем Fastify (buildApp), ждём ready() — все роуты и схемы зарегистрированы,
 * берём app.swagger() и пишем в packages/api-client/openapi.json.
 * pg.Pool ленивый — к БД никто не подключается, поэтому скрипт работает в CI до старта Postgres.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDb } from '../db/index.js';

const out = fileURLToPath(new URL('../../../../packages/api-client/openapi.json', import.meta.url));

const config = loadConfig({ nodeEnv: 'test', logLevel: 'silent' });
const db = createDb('postgres://unused:unused@127.0.0.1:1/unused');
const app = await buildApp({ config, db });
await app.ready();

const spec = app.swagger();
await writeFile(out, JSON.stringify(spec, null, 2) + '\n');
console.log(`OpenAPI spec written to ${out}`);

await app.close();
await db.destroy();
