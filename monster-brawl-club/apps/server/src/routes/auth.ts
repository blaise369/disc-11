import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSession, destroySession, hashSecret, requireUser, verifySecret } from '../auth';
import { prisma } from '../db';
import { badRequest, HttpError, parse } from '../errors';
import { toMe } from '../views';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/parent/signup', async (req, reply) => {
    const body = parse(z.object({
      email: z.string().trim().toLowerCase().email().max(200),
      password: z.string().min(8, 'Password must be at least 8 characters').max(200),
      pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits'),
    }), req.body);
    if (await prisma.user.findFirst({ where: { OR: [{ email: body.email }, { username: body.email }] } })) {
      throw badRequest('email_taken', 'That email already has an account.');
    }
    const user = await prisma.user.create({
      data: {
        username: body.email, email: body.email, role: 'parent', nuggets: 0,
        passwordHash: await hashSecret(body.password), parentPinHash: await hashSecret(body.pin),
      },
    });
    await createSession(reply, user.id);
    return { me: toMe(user) };
  });

  app.post('/auth/login', async (req, reply) => {
    const body = parse(z.object({ login: z.string().trim().min(1).max(200), password: z.string().min(1).max(200) }), req.body);
    const login = body.login.includes('@') ? body.login.toLowerCase() : body.login;
    const user = await prisma.user.findFirst({ where: { OR: [{ username: login }, { email: login }] } });
    if (!user || user.role === 'bot' || !(await verifySecret(body.password, user.passwordHash))) {
      throw new HttpError(401, 'bad_login', 'That name and password do not match.');
    }
    await createSession(reply, user.id);
    return { me: toMe(user) };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get('/me', async req => ({ me: toMe(await requireUser(req)) }));
}
