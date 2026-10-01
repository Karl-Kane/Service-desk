import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Config } from './config.js';
import type { Database } from './db/index.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { ticketRoutes } from './routes/tickets/index.js';
import { userRoutes } from './routes/users.js';
import { sharedSchemas } from './schemas.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    config: Config;
  }
}

export interface BuildAppOptions {
  config: Config;
  db: Database;
}

const REQUEST_ID_RE = /^[\w.-]{1,128}$/;

/**
 * Фабрика приложения. Не вызывает listen — поэтому её же используют:
 *   - server.ts (прод/дев) — build + listen;
 *   - тесты — build + app.inject() без сети;
 *   - scripts/gen-openapi.ts — build + app.swagger() для генерации клиента.
 */
export async function buildApp({ config, db }: BuildAppOptions) {
  const logger: FastifyServerOptions['logger'] = {
    level: config.logLevel,
    // Никогда не пишем в логи cookie и пароли.
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password'],
    ...(config.nodeEnv === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
      : {}),
  };

  const app = Fastify({
    logger,
    // За Caddy: доверяем X-Forwarded-For/Proto, чтобы в логах был реальный IP клиента.
    trustProxy: true,
    // request id: берём из заголовка (если Caddy/клиент прислал валидный), иначе генерируем UUID.
    // pino автоматически кладёт его в каждую строку лога как reqId.
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    },
    ajv: {
      // removeAdditional: лишние поля в body молча выкидываются (а не ломают запрос);
      // coerceTypes: "?page=2" (строка) → 2 (число) для querystring/params.
      customOptions: { removeAdditional: 'all', coerceTypes: true, useDefaults: true },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.decorate('db', db);
  app.decorate('config', config);

  // Отдаём request id клиенту: пользователь присылает его в баг-репорте → находим строку в логах.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  for (const schema of sharedSchemas) app.addSchema(schema);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Service Desk API', version: '1.0.0', description: 'Портал заявок: клиенты, исполнители, администраторы.' },
      components: {
        securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sid' } },
      },
      tags: [
        { name: 'auth' },
        { name: 'tickets' },
        { name: 'users' },
        { name: 'health' },
      ],
    },
    // Имена компонентов = $id схем (Ticket, User, Problem...), а не def-0, def-1.
    refResolver: { buildLocalReference: (json, _baseUri, _fragment, i) => (json.$id as string) || `def-${i}` },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(ticketRoutes);
  await app.register(userRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
