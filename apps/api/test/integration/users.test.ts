import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestContext, createTestContext, createUserAndLogin, login, resetDb, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => closeTestContext(ctx));
beforeEach(async () => resetDb(ctx.db));

describe('users (admin only)', () => {
  it('GET /users: 401 anonymous, 403 client/agent, 200 admin', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/users' })).statusCode).toBe(401);
    for (const role of ['client', 'agent'] as const) {
      const { cookie } = await createUserAndLogin(ctx, role);
      expect((await ctx.app.inject({ method: 'GET', url: '/users', headers: { cookie } })).statusCode).toBe(403);
    }
    const admin = await createUserAndLogin(ctx, 'admin');
    const res = await ctx.app.inject({ method: 'GET', url: '/users', headers: { cookie: admin.cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(3);
    for (const u of res.json()) expect(u).not.toHaveProperty('password_hash');
  });

  it('admin creates user; duplicate email → 409', async () => {
    const admin = await createUserAndLogin(ctx, 'admin');
    const payload = { email: 'new@test.local', name: 'New', password: 'longpassword', role: 'agent' };
    const r1 = await ctx.app.inject({ method: 'POST', url: '/users', headers: { cookie: admin.cookie }, payload });
    expect(r1.statusCode).toBe(201);
    const r2 = await ctx.app.inject({
      method: 'POST',
      url: '/users',
      headers: { cookie: admin.cookie },
      payload: { ...payload, email: 'NEW@test.local' },
    });
    expect(r2.statusCode).toBe(409);
    // Созданный пользователь может войти
    await expect(login(ctx.app, 'new@test.local', 'longpassword')).resolves.toMatch(/^sid=/);
  });

  it('role change logs the user out; admin cannot demote self', async () => {
    const admin = await createUserAndLogin(ctx, 'admin');
    const client = await createUserAndLogin(ctx, 'client');

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/users/${client.user.id}`,
      headers: { cookie: admin.cookie },
      payload: { role: 'agent' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('agent');
    expect((await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: client.cookie } })).statusCode).toBe(401);

    const self = await ctx.app.inject({
      method: 'PATCH',
      url: `/users/${admin.user.id}`,
      headers: { cookie: admin.cookie },
      payload: { role: 'client' },
    });
    expect(self.statusCode).toBe(409);
  });
});
