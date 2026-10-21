import type { FastifyInstance } from 'fastify';
import { BALANCE, profileLevel, type PlayerSummary } from '@mbc/shared';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { requireChild } from '../auth';
import { prisma, transaction } from '../db';
import { badRequest, forbidden, notFound, parse } from '../errors';
import { onlineSet, rateLimit } from '../redis';
import { assertCollectionSpace, assertMonsterFree, assertChildCan } from '../services/monsters';
import { areFriends, isBlockedEither } from '../services/social';
import { loadCards } from '../views';

async function childByName(username: string): Promise<User> {
  const u = await prisma.user.findUnique({ where: { username } });
  if (!u || u.role !== 'child') throw notFound('player_not_found');
  return u;
}

async function summaries(ids: string[]): Promise<PlayerSummary[]> {
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  const online = await onlineSet(ids);
  return users.map(u => ({
    id: u.id, username: u.username, mapRegion: u.mapRegion, profileLevel: profileLevel(u.profileXp),
    online: online.has(u.id), allowRiskyStakes: u.allowRiskyStakes,
  }));
}

export async function socialRoutes(app: FastifyInstance): Promise<void> {
  // ---------- Friends ----------
  app.get('/friends', async req => {
    const me = await requireChild(req);
    const rows = await prisma.friendship.findMany({ where: { OR: [{ userId: me.id }, { friendId: me.id }] } });
    const friendIds = rows.filter(r => r.status === 'accepted').map(r => (r.userId === me.id ? r.friendId : r.userId));
    const incomingIds = rows.filter(r => r.status === 'pending' && r.friendId === me.id).map(r => r.userId);
    const outgoingIds = rows.filter(r => r.status === 'pending' && r.userId === me.id).map(r => r.friendId);
    const [friends, incoming, outgoing] = await Promise.all([summaries(friendIds), summaries(incomingIds), summaries(outgoingIds)]);
    return { friends, incoming, outgoing };
  });

  app.post('/friends', async req => {
    const me = await requireChild(req);
    const { username } = parse(z.object({ username: z.string().min(1) }), req.body);
    const them = await childByName(username);
    if (them.id === me.id) throw badRequest('cant_friend_self');
    if (await isBlockedEither(me.id, them.id)) throw forbidden('blocked');
    const existing = await prisma.friendship.findFirst({ where: { OR: [{ userId: me.id, friendId: them.id }, { userId: them.id, friendId: me.id }] } });
    if (existing) {
      // They already asked us: accept.
      if (existing.status === 'pending' && existing.userId === them.id) await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'accepted' } });
      return { ok: true };
    }
    await prisma.friendship.create({ data: { userId: me.id, friendId: them.id } });
    return { ok: true };
  });

  app.post('/friends/:userId/accept', async req => {
    const me = await requireChild(req);
    const n = await prisma.friendship.updateMany({
      where: { userId: (req.params as { userId: string }).userId, friendId: me.id, status: 'pending' }, data: { status: 'accepted' },
    });
    if (!n.count) throw notFound('request_not_found');
    return { ok: true };
  });

  app.delete('/friends/:userId', async req => {
    const me = await requireChild(req);
    const other = (req.params as { userId: string }).userId;
    await prisma.friendship.deleteMany({ where: { OR: [{ userId: me.id, friendId: other }, { userId: other, friendId: me.id }] } });
    return { ok: true };
  });

  // ---------- Blocks and reports ----------
  app.get('/blocks', async req => {
    const me = await requireChild(req);
    const rows = await prisma.block.findMany({ where: { blockerId: me.id } });
    const byId = new Map(rows.map(r => [r.blockedId, r.byParent]));
    return { blocks: (await summaries(rows.map(r => r.blockedId))).map(s => ({ ...s, byParent: byId.get(s.id) ?? false })) };
  });

  app.post('/blocks', async req => {
    const me = await requireChild(req);
    const { username } = parse(z.object({ username: z.string().min(1) }), req.body);
    const them = await childByName(username);
    if (them.id === me.id) throw badRequest('cant_block_self');
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: me.id, blockedId: them.id } },
      create: { blockerId: me.id, blockedId: them.id }, update: {},
    });
    await prisma.friendship.deleteMany({ where: { OR: [{ userId: me.id, friendId: them.id }, { userId: them.id, friendId: me.id }] } });
    await prisma.trade.updateMany({
      where: { state: 'open', OR: [{ fromUserId: me.id, toUserId: them.id }, { fromUserId: them.id, toUserId: me.id }] },
      data: { state: 'cancelled' },
    });
    return { ok: true };
  });

  app.delete('/blocks/:userId', async req => {
    const me = await requireChild(req);
    // Blocks a parent added can only be removed by the parent.
    await prisma.block.deleteMany({ where: { blockerId: me.id, blockedId: (req.params as { userId: string }).userId, byParent: false } });
    return { ok: true };
  });

  app.post('/reports', async req => {
    const me = await requireChild(req);
    const body = parse(z.object({
      username: z.string().min(1),
      reason: z.enum(['rude', 'cheating', 'bad_name', 'other']),
      fightId: z.string().optional(),
    }), req.body);
    const them = await childByName(body.username);
    await prisma.report.create({ data: { reporterId: me.id, reportedId: them.id, reason: body.reason, fightId: body.fightId ?? null } });
    return { ok: true };
  });

  // ---------- Trader: friends only, both confirm twice ----------
  app.get('/trades', async req => {
    const me = await requireChild(req);
    const trades = await prisma.trade.findMany({
      where: { OR: [{ fromUserId: me.id }, { toUserId: me.id }], state: { in: ['open', 'completed'] } },
      orderBy: { createdAt: 'desc' }, take: 20,
    });
    const monsterIds = trades.flatMap(t => [...t.fromMonsterIds, ...t.toMonsterIds]);
    const cards = new Map((await loadCards(prisma, { id: { in: monsterIds } })).map(c => [c.id, c]));
    const people = new Map((await summaries([...new Set(trades.flatMap(t => [t.fromUserId, t.toUserId]))])).map(p => [p.id, p]));
    return {
      trades: trades.map(t => ({
        id: t.id, state: t.state, createdAt: t.createdAt,
        mine: t.fromUserId === me.id ? 'from' : 'to',
        from: people.get(t.fromUserId), to: people.get(t.toUserId),
        fromMonsters: t.fromMonsterIds.map(id => cards.get(id)).filter(Boolean),
        toMonsters: t.toMonsterIds.map(id => cards.get(id)).filter(Boolean),
        fromConfirms: t.fromConfirms, toConfirms: t.toConfirms,
      })),
    };
  });

  app.post('/trades', async req => {
    const me = await requireChild(req);
    if (profileLevel(me.profileXp) < BALANCE.profileUnlocks.traderLevel) throw forbidden('locked', `The trader opens at profile level ${BALANCE.profileUnlocks.traderLevel}.`);
    assertChildCan(me.allowTrades, 'trading');
    if (!(await rateLimit(`trade:${me.id}`, BALANCE.rateLimits.tradesPerMinute, 60))) throw badRequest('rate_limited');
    const max = BALANCE.trader.maxMonstersPerSide;
    const body = parse(z.object({
      toUsername: z.string().min(1),
      offer: z.array(z.string()).max(max),
      request: z.array(z.string()).max(max),
    }), req.body);
    if (body.offer.length + body.request.length === 0) throw badRequest('empty_trade', 'Add at least one monster.');
    const them = await childByName(body.toUsername);
    if (!(await areFriends(me.id, them.id))) throw forbidden('friends_only', 'You can only trade with friends.');
    if (await isBlockedEither(me.id, them.id)) throw forbidden('blocked');
    if (!them.allowTrades) throw forbidden('parent_approval_needed', `${them.username} can't trade yet.`);
    for (const id of body.offer) await assertMonsterFree(prisma, id, me.id);
    for (const id of body.request) await assertMonsterFree(prisma, id, them.id);
    const trade = await prisma.trade.create({ data: { fromUserId: me.id, toUserId: them.id, fromMonsterIds: body.offer, toMonsterIds: body.request } });
    return { trade };
  });

  app.post('/trades/:id/confirm', async req => {
    const me = await requireChild(req);
    const id = (req.params as { id: string }).id;
    return transaction(async tx => {
      const t = await tx.trade.findUnique({ where: { id } });
      if (!t || t.state !== 'open' || (t.fromUserId !== me.id && t.toUserId !== me.id)) throw notFound('trade_not_found');
      assertChildCan(me.allowTrades, 'trading');
      const side = t.fromUserId === me.id ? 'from' : 'to';
      const mine = side === 'from' ? t.fromConfirms : t.toConfirms;
      const theirs = side === 'from' ? t.toConfirms : t.fromConfirms;
      if (mine >= 2) throw badRequest('already_confirmed');
      // The second confirm only unlocks once both sides confirmed once.
      if (mine === 1 && theirs < 1) throw badRequest('waiting', 'Wait for the other player to confirm first.');
      const next = mine + 1;
      const updated = await tx.trade.update({ where: { id }, data: side === 'from' ? { fromConfirms: next } : { toConfirms: next } });
      if (updated.fromConfirms < 2 || updated.toConfirms < 2) return { state: 'open', trade: updated };

      // Both confirmed twice: swap. Rate-limit one completed trade per pair per hour.
      const recent = await tx.trade.count({
        where: {
          state: 'completed', updatedAt: { gt: new Date(Date.now() - 3_600_000) },
          OR: [{ fromUserId: t.fromUserId, toUserId: t.toUserId }, { fromUserId: t.toUserId, toUserId: t.fromUserId }],
        },
      });
      if (recent >= BALANCE.trader.tradesPerPairPerHour) throw badRequest('trade_limit', 'You two already traded this hour. Try again later.');
      const [from, to] = await Promise.all([tx.user.findUniqueOrThrow({ where: { id: t.fromUserId } }), tx.user.findUniqueOrThrow({ where: { id: t.toUserId } })]);
      if (await isBlockedEither(from.id, to.id, tx)) throw forbidden('blocked');
      for (const mid of t.fromMonsterIds) await assertMonsterFree(tx, mid, from.id);
      for (const mid of t.toMonsterIds) await assertMonsterFree(tx, mid, to.id);
      await assertCollectionSpace(tx, from.id, from.isMember, t.toMonsterIds.length - t.fromMonsterIds.length);
      await assertCollectionSpace(tx, to.id, to.isMember, t.fromMonsterIds.length - t.toMonsterIds.length);
      await tx.monster.updateMany({ where: { id: { in: t.fromMonsterIds } }, data: { ownerId: to.id } });
      await tx.monster.updateMany({ where: { id: { in: t.toMonsterIds } }, data: { ownerId: from.id } });
      await tx.potionActive.deleteMany({ where: { monsterId: { in: [...t.fromMonsterIds, ...t.toMonsterIds] } } });
      const done = await tx.trade.update({ where: { id }, data: { state: 'completed' } });
      return { state: 'completed', trade: done };
    });
  });

  app.post('/trades/:id/cancel', async req => {
    const me = await requireChild(req);
    const id = (req.params as { id: string }).id;
    const n = await prisma.trade.updateMany({ where: { id, state: 'open', OR: [{ fromUserId: me.id }, { toUserId: me.id }] }, data: { state: 'cancelled' } });
    if (!n.count) throw notFound('trade_not_found');
    return { ok: true };
  });
}
