import type { FastifyInstance } from 'fastify';
import { generateUsernameChoices, isUsernameAllowed, USERNAME_MAX, USERNAME_MIN } from '@mbc/shared';
import { z } from 'zod';
import { createSession, destroySession, hashSecret, requireUser, verifySecret } from '../auth';
import { prisma } from '../db';
import { badRequest, HttpError, parse } from '../errors';
import { toMe } from '../views';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/signup', async (req, reply) => {
    const body = parse(z.object({
      username: z.string().trim(),
      password: z.string().min(6, 'Password must be at least 6 characters').max(200),
    }), req.body);
    if (!isUsernameAllowed(body.username)) {
      throw badRequest('bad_username', `Pick a username of ${USERNAME_MIN} to ${USERNAME_MAX} letters, numbers or underscores.`);
    }
    const taken = await prisma.user.findFirst({ where: { username: { equals: body.username, mode: 'insensitive' } } });
    if (taken) throw badRequest('username_taken', 'That username is taken. Try another!');
    const user = await prisma.user.create({
      data: { username: body.username, role: 'player', passwordHash: await hashSecret(body.password) },
    });
    await createSession(reply, user.id);
    return { me: toMe(user) };
  });

  app.get('/auth/username-suggestions', async () => {
    const choices = generateUsernameChoices(10);
    const taken = new Set((await prisma.user.findMany({ where: { username: { in: choices } }, select: { username: true } })).map(u => u.username));
    return { choices: choices.filter(c => !taken.has(c)).slice(0, 5) };
  });

  app.post('/auth/login', async (req, reply) => {
    const body = parse(z.object({ username: z.string().trim().min(1).max(200), password: z.string().min(1).max(200) }), req.body);
    const user = await prisma.user.findUnique({ where: { username: body.username } });
    if (!user || user.role !== 'player' || !(await verifySecret(body.password, user.passwordHash))) {
      throw new HttpError(401, 'bad_login', 'That username and password do not match.');
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
