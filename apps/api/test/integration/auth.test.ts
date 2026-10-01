import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestContext, createTestContext, createUser, login, resetDb, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => closeTestContext(ctx));
beforeEach(async () => resetDb(ctx.db));

describe('auth', () => {
  it('login sets an httpOnly SameSite=Lax session cookie and returns the user', async () => {
    const user = await createUser(ctx.db, 'client', 'kate@test.local');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'KATE@test.local', password: 'password123' }, // citext: регистр не важен
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: user.id, email: 'kate@test.local', role: 'client' });
    expect(res.json()).not.toHaveProperty('password_hash');

    const cookie = res.cookies.find((c) => c.name === 'sid');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  it('wrong password → 401 problem+json', async () => {
    await createUser(ctx.db, 'client', 'kate@test.local');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'kate@test.local', password: 'nope' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 401, title: 'Unauthorized' });
  });

  it('unknown email → the same 401 (no user enumeration)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ghost@test.local', password: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().detail).toBe('Invalid email or password');
  });

  it('invalid body → 400 with field errors', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.type).toMatch(/validation-error$/);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('GET /auth/me without cookie → 401', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('forged (unsigned) cookie → 401', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: 'sid=forged-token' } });
    expect(res.statusCode).toBe(401);
  });

  it('logout invalidates the session server-side', async () => {
    const user = await createUser(ctx.db, 'agent');
    const cookie = await login(ctx.app, user.email);

    expect((await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } })).statusCode).toBe(204);
    // Тот же cookie после logout больше не работает — сессия удалена из БД, а не только из браузера.
    expect((await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('every response carries x-request-id; incoming id is propagated', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'abc-123' } });
    expect(res.headers['x-request-id']).toBe('abc-123');
    const res2 = await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect(res2.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('unknown route → 404 problem+json', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('/health/ready → 200 when DB is reachable', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
  });
});
