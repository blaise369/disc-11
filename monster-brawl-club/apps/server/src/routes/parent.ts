import type { FastifyInstance } from 'fastify';
import { generateUsernameChoices, isGeneratedUsername } from '@mbc/shared';
import { z } from 'zod';
import { hashSecret, requireParent, verifySecret } from '../auth';
import { prisma } from '../db';
import { badRequest, forbidden, notFound, parse } from '../errors';
import { dbFightView } from '../realtime/engine';
import { toMe } from '../views';

async function ownChild(parentId: string, childId: string) {
  const child = await prisma.user.findUnique({ where: { id: childId } });
  if (!child || child.parentId !== parentId) throw notFound('child_not_found');
  return child;
}

export async function parentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/parent', async req => {
    const parent = await requireParent(req);
    const children = await prisma.user.findMany({ where: { parentId: parent.id }, orderBy: { createdAt: 'asc' } });
    return { email: parent.email, children: children.map(toMe) };
  });

  app.get('/parent/username-choices', async req => {
    await requireParent(req);
    const choices = generateUsernameChoices(12);
    const taken = new Set((await prisma.user.findMany({ where: { username: { in: choices } }, select: { username: true } })).map(u => u.username));
    return { choices: choices.filter(c => !taken.has(c)).slice(0, 6) };
  });

  app.post('/parent/children', async req => {
    const parent = await requireParent(req);
    const body = parse(z.object({ username: z.string(), password: z.string().min(6, 'Password must be at least 6 characters').max(200) }), req.body);
    if (!isGeneratedUsername(body.username)) throw badRequest('bad_username', 'Pick one of the suggested names.');
    if (await prisma.user.findUnique({ where: { username: body.username } })) throw badRequest('username_taken', 'That name was just taken. Pick another.');
    const child = await prisma.user.create({
      data: { username: body.username, role: 'child', parentId: parent.id, passwordHash: await hashSecret(body.password) },
    });
    return { child: toMe(child) };
  });

  app.patch('/parent/children/:id', async req => {
    const parent = await requireParent(req);
    const child = await ownChild(parent.id, (req.params as { id: string }).id);
    const body = parse(z.object({
      allowTrades: z.boolean().optional(),
      allowRiskyStakes: z.boolean().optional(),
      dailyPlayCapMinutes: z.number().int().min(0).max(600).nullable().optional(),
      password: z.string().min(6).max(200).optional(),
    }), req.body);
    const data: Record<string, unknown> = {};
    if (body.allowTrades !== undefined) data.allowTrades = body.allowTrades;
    if (body.allowRiskyStakes !== undefined) data.allowRiskyStakes = body.allowRiskyStakes;
    if (body.dailyPlayCapMinutes !== undefined) data.dailyPlayCapMinutes = body.dailyPlayCapMinutes;
    if (body.password) data.passwordHash = await hashSecret(body.password);
    const updated = await prisma.user.update({ where: { id: child.id }, data });
    return { child: toMe(updated) };
  });

  app.get('/parent/children/:id/activity', async req => {
    const parent = await requireParent(req);
    const child = await ownChild(parent.id, (req.params as { id: string }).id);
    const [fights, trades, friendships, blocks, reports, ledger] = await Promise.all([
      prisma.fight.findMany({
        where: { OR: [{ challengerId: child.id }, { defenderId: child.id }], state: { in: ['RESOLVED', 'ABANDONED'] } },
        include: { rounds: true }, orderBy: { createdAt: 'desc' }, take: 20,
      }),
      prisma.trade.findMany({ where: { OR: [{ fromUserId: child.id }, { toUserId: child.id }] }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.friendship.findMany({ where: { status: 'accepted', OR: [{ userId: child.id }, { friendId: child.id }] } }),
      prisma.block.findMany({ where: { blockerId: child.id } }),
      prisma.report.findMany({ where: { reporterId: child.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.ledgerEntry.findMany({ where: { userId: child.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    const ids = new Set<string>();
    trades.forEach(t => { ids.add(t.fromUserId); ids.add(t.toUserId); });
    friendships.forEach(f => { ids.add(f.userId); ids.add(f.friendId); });
    blocks.forEach(b => ids.add(b.blockedId));
    reports.forEach(r => ids.add(r.reportedId));
    const names = new Map((await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, username: true } })).map(u => [u.id, u.username]));
    const name = (id: string) => names.get(id) ?? '?';
    return {
      fights: fights.map(dbFightView),
      trades: trades.map(t => ({ id: t.id, from: name(t.fromUserId), to: name(t.toUserId), state: t.state, createdAt: t.createdAt })),
      friends: friendships.map(f => ({ id: f.userId === child.id ? f.friendId : f.userId, username: name(f.userId === child.id ? f.friendId : f.userId) })),
      blocks: blocks.map(b => ({ id: b.blockedId, username: name(b.blockedId), byParent: b.byParent })),
      reports: reports.map(r => ({ username: name(r.reportedId), reason: r.reason, createdAt: r.createdAt })),
      ledger,
    };
  });

  app.post('/parent/children/:id/blocks', async req => {
    const parent = await requireParent(req);
    const child = await ownChild(parent.id, (req.params as { id: string }).id);
    const { username } = parse(z.object({ username: z.string().min(1) }), req.body);
    const target = await prisma.user.findUnique({ where: { username } });
    if (!target || target.role !== 'child') throw notFound('player_not_found');
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: child.id, blockedId: target.id } },
      create: { blockerId: child.id, blockedId: target.id, byParent: true }, update: { byParent: true },
    });
    await prisma.friendship.deleteMany({ where: { OR: [{ userId: child.id, friendId: target.id }, { userId: target.id, friendId: child.id }] } });
    return { ok: true };
  });

  app.delete('/parent/children/:id/blocks/:blockedId', async req => {
    const parent = await requireParent(req);
    const p = req.params as { id: string; blockedId: string };
    const child = await ownChild(parent.id, p.id);
    await prisma.block.deleteMany({ where: { blockerId: child.id, blockedId: p.blockedId } });
    return { ok: true };
  });

  // Membership needs the parent PIN. No payment provider is wired up: this is where one would go.
  app.post('/parent/children/:id/membership', async req => {
    const parent = await requireParent(req);
    const child = await ownChild(parent.id, (req.params as { id: string }).id);
    const body = parse(z.object({ pin: z.string(), enable: z.boolean() }), req.body);
    if (!(await verifySecret(body.pin, parent.parentPinHash))) throw forbidden('bad_pin', 'That PIN is not right.');
    const updated = await prisma.user.update({ where: { id: child.id }, data: { isMember: body.enable } });
    return { child: toMe(updated) };
  });
}
