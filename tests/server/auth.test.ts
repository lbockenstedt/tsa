import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// In-memory user store so auth routes can be exercised without a real database.
const users = new Map<number, { id: number; email: string; passwordHash: string; name: string; role: string }>();
let nextId = 1;

vi.mock('../../src/server/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(({ where }: { where: { email?: string; id?: number } }) => {
        if (where.email) {
          for (const u of users.values()) if (u.email === where.email) return u;
          return null;
        }
        if (where.id != null) return users.get(where.id) ?? null;
        return null;
      }),
      create: vi.fn(({ data }: { data: { email: string; passwordHash: string; name: string; role: string } }) => {
        const user = { id: nextId++, ...data };
        users.set(user.id, user);
        return user;
      }),
    },
  },
}));

// Import after env + prisma mock are in place.
const { createApp } = await import('../../src/server/app.js');

const app = createApp();

beforeEach(() => {
  users.clear();
  nextId = 1;
});

describe('auth routes', () => {
  it('registers a new user and returns it', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.local', password: 'password123', name: 'New User', role: 'COMPETITOR' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new@test.local');
    expect(res.body.role).toBe('COMPETITOR');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects duplicate registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.local', password: 'password123', name: 'Dup', role: 'JUDGE' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.local', password: 'password123', name: 'Dup', role: 'JUDGE' });
    expect(res.status).toBe(409);
  });

  it('logs in with valid credentials and authenticates /me', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@test.local', password: 'password123', name: 'Login', role: 'COMPETITOR' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.local', password: 'password123' });
    expect(loginRes.status).toBe(200);

    const cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0];
    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie ?? '');
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe('login@test.local');
  });

  it('rejects login with wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'wrong@test.local', password: 'password123', name: 'Wrong', role: 'COMPETITOR' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@test.local', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('requires auth for /me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});