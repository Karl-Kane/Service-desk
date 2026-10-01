import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { sql } from 'kysely';

const HealthSchema = Type.Object({ status: Type.String() });

/**
 * live  — "процесс жив" (event loop отвечает). Падает → оркестратор перезапускает контейнер.
 * ready — "готов принимать трафик" (есть связь с БД). Падает → трафик не слать, но и не убивать.
 * Разделение важно: если БД легла, перезапуск API не поможет, а live продолжит отвечать 200.
 */
export const healthRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    '/health/live',
    { schema: { tags: ['health'], response: { 200: HealthSchema } }, logLevel: 'warn' },
    async () => ({ status: 'ok' }),
  );

  app.get(
    '/health/ready',
    { schema: { tags: ['health'], response: { 200: HealthSchema, 503: HealthSchema } }, logLevel: 'warn' },
    async (request, reply) => {
      try {
        await sql`select 1`.execute(app.db);
        return { status: 'ok' };
      } catch (err) {
        request.log.error({ err }, 'readiness check failed');
        return reply.status(503).send({ status: 'db_unavailable' });
      }
    },
  );
};
