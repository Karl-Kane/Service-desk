import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Role } from '../domain/ticket-status.js';
import { AppError } from '../errors.js';
import { findSessionUser, type AuthUser } from '../lib/session.js';

export const SESSION_COOKIE = 'sid';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    /** Хук (onRequest): 401, если нет валидной сессии. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Фабрика хука (onRequest): 401 без сессии, 403 если роль не из списка. */
    requireRole: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Достаёт токен из подписанной cookie. Подпись (HMAC от SESSION_SECRET) отсекает мусор без похода в БД. */
export function readSessionToken(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  // decorateRequest со значением null — Fastify заранее знает "форму" объекта request (быстрее).
  app.decorateRequest('user', null);

  async function requireAuth(request: FastifyRequest): Promise<void> {
    const token = readSessionToken(request);
    const user = token ? await findSessionUser(app.db, token) : null;
    if (!user) throw AppError.unauthorized();
    request.user = user;
  }

  app.decorate('requireAuth', requireAuth);
  app.decorate('requireRole', (...roles: Role[]) => async (request: FastifyRequest) => {
    await requireAuth(request);
    if (!roles.includes(request.user!.role)) throw AppError.forbidden();
  });
});

/** Хелпер для роутов, где requireAuth уже отработал: user гарантированно есть. */
export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw AppError.unauthorized();
  return request.user;
}
