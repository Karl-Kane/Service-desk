import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeTestContext,
  createTestContext,
  createTicket,
  createUserAndLogin,
  resetDb,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => closeTestContext(ctx));
beforeEach(async () => resetDb(ctx.db));

describe('tickets: access control', () => {
  it('without cookie → 401', async () => {
    for (const [method, url] of [
      ['GET', '/tickets'],
      ['POST', '/tickets'],
      ['GET', '/tickets/1'],
      ['PATCH', '/tickets/1/status'],
    ] as const) {
      const res = await ctx.app.inject({ method, url, payload: method === 'GET' ? undefined : {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("client gets 404 (not 403) for someone else's ticket", async () => {
    // Почему 404: ответ 403 подтвердил бы, что заявка с таким id СУЩЕСТВУЕТ.
    // Перебирая id, можно было бы узнать число заявок и темп их создания. 404 ничего не раскрывает:
    // для клиента чужая заявка неотличима от несуществующей.
    const alice = await createUserAndLogin(ctx, 'client');
    const bob = await createUserAndLogin(ctx, 'client');
    const ticket = await createTicket(ctx.app, alice.cookie);

    const res = await ctx.app.inject({ method: 'GET', url: `/tickets/${ticket.id}`, headers: { cookie: bob.cookie } });
    expect(res.statusCode).toBe(404);
    const nonexistent = await ctx.app.inject({ method: 'GET', url: '/tickets/999999', headers: { cookie: bob.cookie } });
    expect(nonexistent.statusCode).toBe(404);
    // Тела ответов одинаковые — по ним тоже нельзя отличить.
    expect(res.json().detail).toBe(nonexistent.json().detail);

    // Изменить, прокомментировать и читать журнал чужой заявки тоже нельзя
    for (const [method, url, payload] of [
      ['PATCH', `/tickets/${ticket.id}/status`, { status: 'closed' }],
      ['POST', `/tickets/${ticket.id}/comments`, { body: 'hi' }],
      ['GET', `/tickets/${ticket.id}/events`, undefined],
    ] as const) {
      const r = await ctx.app.inject({ method, url, payload, headers: { cookie: bob.cookie } });
      expect(r.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it('client sees only own tickets in the list; agent sees all', async () => {
    const alice = await createUserAndLogin(ctx, 'client');
    const bob = await createUserAndLogin(ctx, 'client');
    const agent = await createUserAndLogin(ctx, 'agent');
    await createTicket(ctx.app, alice.cookie, 'Alice 1');
    await createTicket(ctx.app, alice.cookie, 'Alice 2');
    await createTicket(ctx.app, bob.cookie, 'Bob 1');

    const aliceList = await ctx.app.inject({ method: 'GET', url: '/tickets', headers: { cookie: alice.cookie } });
    expect(aliceList.json().total).toBe(2);
    expect(aliceList.json().items.map((t: { title: string }) => t.title).sort()).toEqual(['Alice 1', 'Alice 2']);

    const agentList = await ctx.app.inject({ method: 'GET', url: '/tickets', headers: { cookie: agent.cookie } });
    expect(agentList.json().total).toBe(3);
  });

  it('list supports status filter and pagination', async () => {
    const client = await createUserAndLogin(ctx, 'client');
    for (let i = 0; i < 5; i++) await createTicket(ctx.app, client.cookie, `Ticket ${i}`);

    const page2 = await ctx.app.inject({
      method: 'GET',
      url: '/tickets?page=2&pageSize=2',
      headers: { cookie: client.cookie },
    });
    expect(page2.json()).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(page2.json().items).toHaveLength(2);

    const resolved = await ctx.app.inject({ method: 'GET', url: '/tickets?status=resolved', headers: { cookie: client.cookie } });
    expect(resolved.json().total).toBe(0);

    const bad = await ctx.app.inject({ method: 'GET', url: '/tickets?status=bogus', headers: { cookie: client.cookie } });
    expect(bad.statusCode).toBe(400);
  });

  it('POST /tickets validates input → 400 with field errors', async () => {
    const client = await createUserAndLogin(ctx, 'client');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/tickets',
      headers: { cookie: client.cookie },
      payload: { title: 'x', body: '' },
    });
    expect(res.statusCode).toBe(400);
    const fields = res.json().errors.map((e: { field: string }) => e.field);
    expect(fields).toContain('title');
  });
});

describe('tickets: status transitions', () => {
  it('agent takes ticket: new → in_progress, becomes assignee, events written', async () => {
    const client = await createUserAndLogin(ctx, 'client');
    const agent = await createUserAndLogin(ctx, 'agent');
    const ticket = await createTicket(ctx.app, client.cookie);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/tickets/${ticket.id}/status`,
      headers: { cookie: agent.cookie },
      payload: { status: 'in_progress' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'in_progress', assignee: { id: agent.user.id } });

    const events = await ctx.app.inject({ method: 'GET', url: `/tickets/${ticket.id}/events`, headers: { cookie: client.cookie } });
    expect(events.json().map((e: { type: string }) => e.type)).toEqual(['created', 'status_changed', 'assigned']);
    expect(events.json()[1]).toMatchObject({ payload: { from: 'new', to: 'in_progress' }, actor: { id: agent.user.id } });
  });

  it('invalid transition → 409 and nothing is written', async () => {
    const client = await createUserAndLogin(ctx, 'client');
    const agent = await createUserAndLogin(ctx, 'agent');
    const ticket = await createTicket(ctx.app, client.cookie);

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/tickets/${ticket.id}/status`,
      headers: { cookie: agent.cookie },
      payload: { status: 'closed' }, // new → closed: такого ребра нет
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ status: 409, title: 'Conflict' });
    expect(res.json().type).toMatch(/invalid-transition$/);

    const events = await ctx.db.selectFrom('ticket_events').select('type').execute();
    expect(events.map((e) => e.type)).toEqual(['created']);
  });

  it('valid edge but forbidden for role → 403 (client cannot take ticket into work)', async () => {
    const client = await createUserAndLogin(ctx, 'client');
    const ticket = await createTicket(ctx.app, client.cookie);
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/tickets/${ticket.id}/status`,
      headers: { cookie: client.cookie },
      payload: { status: 'in_progress' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('full lifecycle: new → in_progress → waiting → resolved → reopened → in_progress → resolved → closed', async () => {
    const client = await createUserAndLogin(ctx, 'client');
    const agent = await createUserAndLogin(ctx, 'agent');
    const ticket = await createTicket(ctx.app, client.cookie);

    const steps: Array<[string, 'client' | 'agent']> = [
      ['in_progress', 'agent'],
      ['waiting', 'agent'],
      ['resolved', 'agent'],
      ['reopened', 'client'],
      ['in_progress', 'agent'],
      ['resolved', 'agent'],
      ['closed', 'client'],
    ];
    for (const [status, who] of steps) {
      const cookie = who === 'agent' ? agent.cookie : client.cookie;
      const res = await ctx.app.inject({ method: 'PATCH', url: `/tickets/${ticket.id}/status`, headers: { cookie }, payload: { status } });
      expect(res.statusCode, `→ ${status} by ${who}`).toBe(200);
    }

    // В закрытую заявку комментировать нельзя
    const comment = await ctx.app.inject({
      method: 'POST',
      url: `/tickets/${ticket.id}/comments`,
      headers: { cookie: client.cookie },
      payload: { body: 'thanks' },
    });
    expect(comment.statusCode).toBe(409);
  });

  it('concurrent "take" by two agents: exactly one wins, the other gets 409', async () => {
    const client = await createUserAndLogin(ctx, 'client');
    const a1 = await createUserAndLogin(ctx, 'agent');
    const a2 = await createUserAndLogin(ctx, 'agent');
    const ticket = await createTicket(ctx.app, client.cookie);

    const [r1, r2] = await Promise.all(
      [a1, a2].map((a) =>
        ctx.app.inject({
          method: 'PATCH',
          url: `/tickets/${ticket.id}/status`,
          headers: { cookie: a.cookie },
          payload: { status: 'in_progress' },
        }),
      ),
    );
    expect([r1!.statusCode, r2!.statusCode].sort()).toEqual([200, 409]);
  });
});

describe('comments & details', () => {
  it('comment is added, visible in detail, and logged as event', async () => {
    const client = await createUserAndLogin(ctx, 'client');
    const agent = await createUserAndLogin(ctx, 'agent');
    const ticket = await createTicket(ctx.app, client.cookie);

    const c = await ctx.app.inject({
      method: 'POST',
      url: `/tickets/${ticket.id}/comments`,
      headers: { cookie: agent.cookie },
      payload: { body: 'Looking into it' },
    });
    expect(c.statusCode).toBe(201);
    expect(c.json()).toMatchObject({ body: 'Looking into it', author: { id: agent.user.id, role: 'agent' } });

    const detail = await ctx.app.inject({ method: 'GET', url: `/tickets/${ticket.id}`, headers: { cookie: client.cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().comments).toHaveLength(1);
    // Клиенту на новой заявке нельзя менять статус → кнопок нет
    expect(detail.json().allowedTransitions).toEqual([]);

    const agentDetail = await ctx.app.inject({ method: 'GET', url: `/tickets/${ticket.id}`, headers: { cookie: agent.cookie } });
    expect(agentDetail.json().allowedTransitions).toEqual(['in_progress']);
  });
});
