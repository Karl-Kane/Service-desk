import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { sql } from 'kysely';
import {
  allowedTargets,
  canTransition,
  isValidTransition,
  type Role,
  type TicketStatus,
} from '../../domain/ticket-status.js';
import { AppError } from '../../errors.js';
import { currentUser } from '../../plugins/auth.js';
import {
  CommentSchema,
  errorResponses,
  IdParams,
  PrioritySchema,
  ref,
  TicketDetailSchema,
  TicketEventSchema,
  TicketListSchema,
  TicketSchema,
  TicketStatusSchema,
} from '../../schemas.js';
import { toTicketDto } from '../mappers.js';
import { findVisibleTicket, selectVisibleTickets } from './queries.js';

const ListQuery = Type.Object({
  status: Type.Optional(ref(TicketStatusSchema)),
  page: Type.Integer({ minimum: 1, default: 1 }),
  pageSize: Type.Integer({ minimum: 1, maximum: 100, default: 20 }),
});

const CreateBody = Type.Object({
  title: Type.String({ minLength: 3, maxLength: 200 }),
  body: Type.String({ minLength: 1, maxLength: 10_000 }),
  priority: Type.Optional(ref(PrioritySchema)),
});

const StatusBody = Type.Object({ status: ref(TicketStatusSchema) });
const CommentBody = Type.Object({ body: Type.String({ minLength: 1, maxLength: 10_000 }) });

const secured = { security: [{ cookieAuth: [] }], tags: ['tickets'] };

export const ticketRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // Все роуты этого плагина требуют сессию. Хук действует только внутри плагина (инкапсуляция Fastify).
  // onRequest, а НЕ preHandler: в Fastify валидация тела идёт ДО preHandler. С preHandler аноним
  // получал 400 с деталями схемы вместо 401 (тест 'without cookie → 401' это поймал).
  app.addHook('onRequest', app.requireAuth);

  app.get(
    '/tickets',
    {
      schema: {
        ...secured,
        summary: 'Список заявок (клиент видит только свои)',
        querystring: ListQuery,
        response: { 200: ref(TicketListSchema), 400: errorResponses[400], 401: errorResponses[401] },
      },
    },
    async (request) => {
      const user = currentUser(request);
      const { status, page, pageSize } = request.query;

      let base = selectVisibleTickets(app.db, user);
      if (status) base = base.where('t.status', '=', status);

      // Два запроса (страница + total) вместо window-функции — проще читать и объяснять.
      const [rows, countRow] = await Promise.all([
        base
          .orderBy('t.created_at', 'desc')
          .orderBy('t.id', 'desc')
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .execute(),
        base
          .clearSelect()
          .select((eb) => eb.fn.countAll<string>().as('total'))
          .executeTakeFirstOrThrow(),
      ]);

      return { items: rows.map(toTicketDto), total: Number(countRow.total), page, pageSize };
    },
  );

  app.post(
    '/tickets',
    {
      schema: {
        ...secured,
        summary: 'Создать заявку',
        body: CreateBody,
        response: { 201: ref(TicketSchema), 400: errorResponses[400], 401: errorResponses[401] },
      },
    },
    async (request, reply) => {
      const user = currentUser(request);
      const { title, body, priority } = request.body;

      // Заявка и событие "created" — в одной транзакции: либо есть обе записи, либо ни одной.
      const id = await app.db.transaction().execute(async (trx) => {
        const ticket = await trx
          .insertInto('tickets')
          .values({ author_id: user.id, title, body, priority: priority ?? 'normal' })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('ticket_events')
          .values({ ticket_id: ticket.id, actor_id: user.id, type: 'created', payload: JSON.stringify({ title, priority: priority ?? 'normal' }) })
          .execute();
        return Number(ticket.id);
      });

      const dto = await findVisibleTicket(app.db, id, user);
      reply.header('location', `/tickets/${id}`);
      return reply.status(201).send(dto!);
    },
  );

  app.get(
    '/tickets/:id',
    {
      schema: {
        ...secured,
        summary: 'Заявка с комментариями',
        params: IdParams,
        response: { 200: ref(TicketDetailSchema), 401: errorResponses[401], 403: errorResponses[403], 404: errorResponses[404] },
      },
    },
    async (request) => {
      const user = currentUser(request);
      const ticket = await findVisibleTicket(app.db, request.params.id, user);
      if (!ticket) throw AppError.notFound('Ticket not found');

      const comments = await app.db
        .selectFrom('comments as c')
        .innerJoin('users as u', 'u.id', 'c.author_id')
        .select(['c.id', 'c.body', 'c.created_at', 'u.id as author_id', 'u.name as author_name', 'u.role as author_role'])
        .where('c.ticket_id', '=', String(request.params.id))
        .orderBy('c.created_at', 'asc')
        .orderBy('c.id', 'asc')
        .execute();

      return {
        ticket,
        comments: comments.map((c) => ({
          id: Number(c.id),
          body: c.body,
          author: { id: c.author_id, name: c.author_name, role: c.author_role as Role },
          createdAt: c.created_at.toISOString(),
        })),
        allowedTransitions: allowedTargets(ticket.status, user.role),
      };
    },
  );

  app.patch(
    '/tickets/:id/status',
    {
      schema: {
        ...secured,
        summary: 'Сменить статус по правилам машины состояний',
        description: '409 — недопустимый переход; 403 — переход существует, но роли он запрещён.',
        params: IdParams,
        body: StatusBody,
        response: { 200: ref(TicketSchema), ...errorResponses },
      },
    },
    async (request) => {
      const user = currentUser(request);
      const id = String(request.params.id); // int8 в Kysely типизирован как string
      const to = request.body.status;

      // Видимость проверяем тем же правилом, что и чтение: чужая заявка клиента → 404.
      if (!(await findVisibleTicket(app.db, id, user))) throw AppError.notFound('Ticket not found');

      await app.db.transaction().execute(async (trx) => {
        // SELECT ... FOR UPDATE: блокируем строку до конца транзакции. Если два исполнителя
        // одновременно жмут "Взять в работу", второй дождётся первого, увидит уже in_progress
        // и получит 409 вместо тихой перезаписи (lost update).
        const current = await trx
          .selectFrom('tickets')
          .select(['status', 'assignee_id'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        const from = current.status as TicketStatus;

        if (!isValidTransition(from, to)) {
          throw AppError.conflict('invalid-transition', `Transition ${from} → ${to} is not allowed`);
        }
        if (!canTransition(from, to, user.role)) {
          throw AppError.forbidden(`Role ${user.role} cannot move ticket from ${from} to ${to}`);
        }

        // "Взять в работу": исполнитель становится ответственным, если его ещё нет.
        const takeOwnership = to === 'in_progress' && current.assignee_id === null && user.role !== 'client';

        await trx
          .updateTable('tickets')
          .set({
            status: to,
            updated_at: sql`now()`,
            ...(takeOwnership ? { assignee_id: user.id } : {}),
          })
          .where('id', '=', id)
          .execute();

        await trx
          .insertInto('ticket_events')
          .values({ ticket_id: id, actor_id: user.id, type: 'status_changed', payload: JSON.stringify({ from, to }) })
          .execute();
        if (takeOwnership) {
          await trx
            .insertInto('ticket_events')
            .values({ ticket_id: id, actor_id: user.id, type: 'assigned', payload: JSON.stringify({ assigneeId: user.id }) })
            .execute();
        }
      });

      request.log.info({ ticketId: id, to }, 'ticket status changed');
      return (await findVisibleTicket(app.db, id, user))!;
    },
  );

  app.post(
    '/tickets/:id/comments',
    {
      schema: {
        ...secured,
        summary: 'Добавить комментарий',
        params: IdParams,
        body: CommentBody,
        response: { 201: ref(CommentSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = currentUser(request);
      const id = String(request.params.id);
      const ticket = await findVisibleTicket(app.db, id, user);
      if (!ticket) throw AppError.notFound('Ticket not found');
      if (ticket.status === 'closed') throw AppError.conflict('ticket-closed', 'Cannot comment on a closed ticket');

      const comment = await app.db.transaction().execute(async (trx) => {
        const c = await trx
          .insertInto('comments')
          .values({ ticket_id: id, author_id: user.id, body: request.body.body })
          .returning(['id', 'body', 'created_at'])
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('ticket_events')
          .values({ ticket_id: id, actor_id: user.id, type: 'comment_added', payload: JSON.stringify({ commentId: Number(c.id) }) })
          .execute();
        await trx.updateTable('tickets').set({ updated_at: sql`now()` }).where('id', '=', id).execute();
        return c;
      });

      return reply.status(201).send({
        id: Number(comment.id),
        body: comment.body,
        author: { id: user.id, name: user.name, role: user.role },
        createdAt: comment.created_at.toISOString(),
      });
    },
  );

  app.get(
    '/tickets/:id/events',
    {
      schema: {
        ...secured,
        summary: 'Журнал изменений заявки',
        params: IdParams,
        response: { 200: Type.Array(ref(TicketEventSchema)), 401: errorResponses[401], 404: errorResponses[404] },
      },
    },
    async (request) => {
      const user = currentUser(request);
      if (!(await findVisibleTicket(app.db, request.params.id, user))) throw AppError.notFound('Ticket not found');

      const events = await app.db
        .selectFrom('ticket_events as e')
        .innerJoin('users as u', 'u.id', 'e.actor_id')
        .select(['e.id', 'e.type', 'e.payload', 'e.created_at', 'u.id as actor_id', 'u.name as actor_name', 'u.role as actor_role'])
        .where('e.ticket_id', '=', String(request.params.id))
        .orderBy('e.created_at', 'asc')
        .orderBy('e.id', 'asc')
        .execute();

      return events.map((e) => ({
        id: Number(e.id),
        type: e.type,
        actor: { id: e.actor_id, name: e.actor_name, role: e.actor_role as Role },
        payload: (e.payload ?? {}) as Record<string, unknown>,
        createdAt: e.created_at.toISOString(),
      }));
    },
  );
};
