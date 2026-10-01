/**
 * Типизированный клиент API.
 * schema.d.ts генерируется из openapi.json (`pnpm gen:client`) — руками не правится.
 * openapi-fetch — тонкая обёртка над fetch (~6 КБ): пути, параметры, тела и ответы
 * проверяются компилятором. Переименовали поле в API → фронт не скомпилируется.
 */
import createFetchClient from 'openapi-fetch';
import type { components, paths } from './schema.js';

export type { components, paths };
export type Schemas = components['schemas'];
export type Ticket = Schemas['Ticket'];
export type TicketDetail = Schemas['TicketDetail'];
export type TicketStatus = Schemas['TicketStatus'];
export type TicketEvent = Schemas['TicketEvent'];
export type Comment = Schemas['Comment'];
export type User = Schemas['User'];
export type Role = Schemas['Role'];
export type Priority = Schemas['Priority'];
export type Problem = Schemas['Problem'];

export function createApiClient(baseUrl: string) {
  return createFetchClient<paths>({
    baseUrl,
    // Сессионная cookie (httpOnly) отправляется браузером автоматически.
    credentials: 'include',
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
