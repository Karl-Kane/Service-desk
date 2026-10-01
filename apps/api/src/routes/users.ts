import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { AppError } from '../errors.js';
import { hashPassword } from '../lib/password.js';
import { currentUser } from '../plugins/auth.js';
import { errorResponses, ref, RoleSchema, UserSchema } from '../schemas.js';
import { toUserDto } from './mappers.js';

const CreateUserBody = Type.Object({
  email: Type.String({ format: 'email', maxLength: 254 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  password: Type.String({ minLength: 8, maxLength: 256 }),
  role: ref(RoleSchema),
});

const UpdateUserBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  role: Type.Optional(ref(RoleSchema)),
});

const UserIdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

const secured = { security: [{ cookieAuth: [] }], tags: ['users'] };

/** Управление пользователями — только admin. Проверка роли навешена хуком на весь плагин. */
export const userRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('onRequest', app.requireRole('admin')); // onRequest: авторизация до валидации тела

  app.get(
    '/users',
    {
      schema: {
        ...secured,
        summary: 'Список пользователей (admin)',
        response: { 200: Type.Array(ref(UserSchema)), 401: errorResponses[401], 403: errorResponses[403] },
      },
    },
    async () => {
      const users = await app.db.selectFrom('users').selectAll().orderBy('created_at', 'asc').execute();
      return users.map(toUserDto);
    },
  );

  app.post(
    '/users',
    {
      schema: {
        ...secured,
        summary: 'Создать пользователя (admin)',
        body: CreateUserBody,
        response: { 201: ref(UserSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { email, name, password, role } = request.body;
      const user = await app.db
        .insertInto('users')
        .values({ email, name, role, password_hash: await hashPassword(password) })
        // ON CONFLICT вместо "SELECT, потом INSERT": нет гонки между проверкой и вставкой.
        .onConflict((oc) => oc.column('email').doNothing())
        .returningAll()
        .executeTakeFirst();
      if (!user) throw AppError.conflict('email-taken', 'User with this email already exists');
      return reply.status(201).send(toUserDto(user));
    },
  );

  app.patch(
    '/users/:id',
    {
      schema: {
        ...secured,
        summary: 'Изменить имя/роль пользователя (admin)',
        params: UserIdParams,
        body: UpdateUserBody,
        response: { 200: ref(UserSchema), ...errorResponses },
      },
    },
    async (request) => {
      const me = currentUser(request);
      const { id } = request.params;
      const { name, role } = request.body;
      // Защита от "отпилил сук": админ не может снять роль admin сам с себя.
      if (id === me.id && role && role !== 'admin') {
        throw AppError.conflict('self-demotion', 'Admin cannot change own role');
      }
      if (name === undefined && role === undefined) throw AppError.badRequest('Nothing to update');

      const user = await app.db
        .updateTable('users')
        .set({ ...(name !== undefined ? { name } : {}), ...(role !== undefined ? { role } : {}) })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      if (!user) throw AppError.notFound('User not found');
      // Смена роли — разлогиниваем пользователя, чтобы новые права применились сразу и честно.
      if (role !== undefined) await app.db.deleteFrom('sessions').where('user_id', '=', id).execute();
      return toUserDto(user);
    },
  );
};
