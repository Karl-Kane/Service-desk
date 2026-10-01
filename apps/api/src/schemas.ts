/**
 * JSON-схемы API на TypeBox. Одна схема даёт сразу три вещи:
 *   1) валидацию входа (Ajv) и быструю сериализацию выхода (fast-json-stringify);
 *   2) статические TS-типы в хендлерах (через type provider);
 *   3) описание в OpenAPI → из него генерируется клиент для фронта.
 * Схемы с $id регистрируются через app.addSchema и попадают в components.schemas OpenAPI.
 */
import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { PRIORITIES, ROLES, TICKET_STATUSES } from './domain/ticket-status.js';

/** Ссылка на зарегистрированную схему с сохранением статического типа. */
export function ref<T extends TSchema>(schema: T) {
  return Type.Unsafe<Static<T>>({ $ref: `${schema.$id}#` });
}

const DateTime = Type.String({ format: 'date-time' });

export const RoleSchema = Type.Union(ROLES.map((r) => Type.Literal(r)), { $id: 'Role' });
export const TicketStatusSchema = Type.Union(TICKET_STATUSES.map((s) => Type.Literal(s)), { $id: 'TicketStatus' });
export const PrioritySchema = Type.Union(PRIORITIES.map((p) => Type.Literal(p)), { $id: 'Priority' });

export const ProblemSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer(),
    detail: Type.Optional(Type.String()),
    instance: Type.Optional(Type.String()),
    errors: Type.Optional(Type.Array(Type.Object({ field: Type.String(), message: Type.String() }))),
  },
  { $id: 'Problem', description: 'RFC 9457 Problem Details' },
);

export const UserSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    email: Type.String(),
    name: Type.String(),
    role: ref(RoleSchema),
    createdAt: DateTime,
  },
  { $id: 'User' },
);

export const UserRefSchema = Type.Object(
  { id: Type.String({ format: 'uuid' }), name: Type.String(), role: ref(RoleSchema) },
  { $id: 'UserRef' },
);

export const TicketSchema = Type.Object(
  {
    id: Type.Integer(),
    title: Type.String(),
    body: Type.String(),
    status: ref(TicketStatusSchema),
    priority: ref(PrioritySchema),
    author: ref(UserRefSchema),
    assignee: Type.Union([ref(UserRefSchema), Type.Null()]),
    createdAt: DateTime,
    updatedAt: DateTime,
  },
  { $id: 'Ticket' },
);

export const CommentSchema = Type.Object(
  { id: Type.Integer(), body: Type.String(), author: ref(UserRefSchema), createdAt: DateTime },
  { $id: 'Comment' },
);

export const TicketDetailSchema = Type.Object(
  {
    ticket: ref(TicketSchema),
    comments: Type.Array(ref(CommentSchema)),
    /** Статусы, в которые ТЕКУЩИЙ пользователь может перевести заявку — UI рисует по ним кнопки. */
    allowedTransitions: Type.Array(ref(TicketStatusSchema)),
  },
  { $id: 'TicketDetail' },
);

export const TicketListSchema = Type.Object(
  {
    items: Type.Array(ref(TicketSchema)),
    total: Type.Integer(),
    page: Type.Integer(),
    pageSize: Type.Integer(),
  },
  { $id: 'TicketList' },
);

export const TicketEventSchema = Type.Object(
  {
    id: Type.Integer(),
    type: Type.String({ description: 'created | status_changed | assigned | comment_added' }),
    actor: ref(UserRefSchema),
    payload: Type.Record(Type.String(), Type.Unknown()),
    createdAt: DateTime,
  },
  { $id: 'TicketEvent' },
);

/** Порядок важен: схема должна быть добавлена раньше, чем на неё сошлются. */
export const sharedSchemas = [
  RoleSchema,
  TicketStatusSchema,
  PrioritySchema,
  ProblemSchema,
  UserSchema,
  UserRefSchema,
  TicketSchema,
  CommentSchema,
  TicketDetailSchema,
  TicketListSchema,
  TicketEventSchema,
];

export const problem = ref(ProblemSchema);

/** Типовые ответы-ошибки для OpenAPI. */
export const errorResponses = {
  400: problem,
  401: problem,
  403: problem,
  404: problem,
  409: problem,
} as const;

export const IdParams = Type.Object({ id: Type.Integer({ minimum: 1 }) });

export type TicketDto = Static<typeof TicketSchema>;
export type UserDto = Static<typeof UserSchema>;
