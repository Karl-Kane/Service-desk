import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { AppError, problemType, type Problem } from '../errors.js';

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * ОДИН обработчик ошибок на всё приложение. Любое исключение из роута/хука попадает сюда.
 * fastify-plugin снимает инкапсуляцию, иначе обработчик действовал бы только внутри плагина.
 */
export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    let problem: Problem;

    if (error instanceof AppError) {
      problem = {
        type: error.type,
        title: error.title,
        status: error.status,
        detail: error.message,
        ...(error.errors ? { errors: error.errors } : {}),
      };
    } else if (error.validation) {
      // Ошибка JSON-схемы (TypeBox → Ajv). Отдаём список полей, чтобы фронт подсветил их.
      problem = {
        type: problemType('validation-error'),
        title: 'Bad Request',
        status: 400,
        detail: `Invalid request ${error.validationContext ?? ''}`.trim(),
        errors: error.validation.map((v) => ({
          field:
            v.instancePath.replace(/^\//, '').replaceAll('/', '.') ||
            String((v.params as { missingProperty?: string }).missingProperty ?? ''),
          message: v.message ?? 'invalid',
        })),
      };
    } else if (error.statusCode && error.statusCode < 500) {
      // Встроенные ошибки Fastify: битый JSON (400), неверный Content-Type (415), большое тело (413)...
      problem = {
        type: problemType(error.code?.toLowerCase() ?? 'client-error'),
        title: error.name,
        status: error.statusCode,
        detail: error.message,
      };
    } else {
      // Неожиданная ошибка: полностью логируем (со стеком и reqId), клиенту — без деталей.
      request.log.error({ err: error }, 'unhandled error');
      problem = {
        type: problemType('internal'),
        title: 'Internal Server Error',
        status: 500,
        detail: 'Unexpected error. Use the request id to find details in logs.',
      };
    }

    problem.instance = request.url;
    if (problem.status === 401) reply.header('www-authenticate', 'Cookie realm="service-desk"');
    return reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
  });

  app.setNotFoundHandler((request, reply) => {
    const problem: Problem = {
      type: problemType('route-not-found'),
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} not found`,
      instance: request.url,
    };
    return reply.status(404).type(PROBLEM_CONTENT_TYPE).send(problem);
  });
});
