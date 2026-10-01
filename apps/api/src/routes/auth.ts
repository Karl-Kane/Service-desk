import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { AppError } from '../errors.js';
import { getDummyHash, verifyPassword } from '../lib/password.js';
import { createSession, deleteSession } from '../lib/session.js';
import { currentUser, readSessionToken, SESSION_COOKIE } from '../plugins/auth.js';
import { problem, ref, UserSchema } from '../schemas.js';
import { toUserDto } from './mappers.js';

const LoginBody = Type.Object({
  email: Type.String({ format: 'email', maxLength: 254 }),
  password: Type.String({ minLength: 1, maxLength: 256 }),
});

export const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const cookieOptions = {
    path: '/',
    httpOnly: true, // JS страницы не видит cookie → XSS не может украсть сессию
    secure: app.config.cookieSecure, // только по HTTPS
    sameSite: 'lax' as const, // не уходит с кросс-сайтовыми POST → базовая защита от CSRF
    signed: true,
  };

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        body: LoginBody,
        response: { 200: ref(UserSchema), 400: problem, 401: problem },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const user = await app.db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();

      // Одинаковое время и одинаковый ответ для "нет такого email" и "неверный пароль".
      const ok = await verifyPassword(user?.password_hash ?? (await getDummyHash()), password);
      if (!user || !ok) throw AppError.unauthorized('Invalid email or password');

      const { token, expiresAt } = await createSession(app.db, user.id, app.config.sessionTtlHours);
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
      request.log.info({ userId: user.id }, 'user logged in');
      return toUserDto(user);
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], response: { 204: Type.Null() } } },
    async (request, reply) => {
      const token = readSessionToken(request);
      if (token) await deleteSession(app.db, token);
      reply.clearCookie(SESSION_COOKIE, cookieOptions);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      onRequest: app.requireAuth,
      schema: { tags: ['auth'], security: [{ cookieAuth: [] }], response: { 200: ref(UserSchema), 401: problem } },
    },
    async (request) => {
      const me = currentUser(request);
      const user = await app.db.selectFrom('users').selectAll().where('id', '=', me.id).executeTakeFirstOrThrow();
      return toUserDto(user);
    },
  );
};
