import type { FastifyInstance } from 'fastify';
import {
  BALANCE, isNearbyRegion, MISSIONS, PALETTE, profileLevel, REGIONS, STRATEGIES,
  type PlayerProfile, type PlayerSummary,
} from '@mbc/shared';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { requirePlayer, requireUser } from '../auth';
import { prisma, transaction } from '../db';
import { badRequest, notFound, parse } from '../errors';
import { dbFightView, fightView } from '../realtime/engine';
import { onlineSet } from '../redis';
import { changeNuggets } from '../services/ledger';
import { growMonster, spendSkillPoint } from '../services/monsters';
import { blockedIds } from '../services/social';
import { dayKey, sameUtcDay } from '../time';
import { loadCard, loadCards, toMe } from '../views';

const strategy = z.enum(STRATEGIES);
const partId = z.string().max(40);
const growSchema = z.object({
  name: z.string().max(40),
  tier: z.enum(['standard', 'super', 'xtreme']),
  parts: z.object({ species: partId, eyes: partId, mouth: partId, head: partId, arms: partId, legs: partId, pattern: partId }),
  palette: z.object({ body: z.number().int().min(0).max(PALETTE.length - 1), accent: z.number().int().min(0).max(PALETTE.length - 1) }),
  skills: z.object({ attack: z.number().int(), defense: z.number().int(), tricks: z.number().int(), brains: z.number().int() }),
});

function summary(u: User, online: Set<string>): PlayerSummary {
  return {
    id: u.id, username: u.username, mapRegion: u.mapRegion, profileLevel: profileLevel(u.profileXp),
    online: online.has(u.id),
  };
}

async function record(userId: string): Promise<{ wins: number; losses: number }> {
  const fights = await prisma.fight.findMany({
    where: { kind: 'pvp', state: { in: ['RESOLVED', 'ABANDONED'] }, winnerMonsterId: { not: null }, OR: [{ challengerId: userId }, { defenderId: userId }] },
    select: { challengerId: true, monsterAId: true, monsterBId: true, winnerMonsterId: true },
    take: 1000,
  });
  let wins = 0;
  for (const f of fights) {
    const mine = f.challengerId === userId ? f.monsterAId : f.monsterBId;
    if (f.winnerMonsterId === mine) wins++;
  }
  return { wins, losses: fights.length - wins };
}

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  // ---------- Monsters ----------
  app.get('/monsters', async req => {
    const me = await requirePlayer(req);
    const [alive, graveyard] = await Promise.all([
      loadCards(prisma, { ownerId: me.id, status: 'alive' }),
      loadCards(prisma, { ownerId: me.id, status: 'graveyard' }),
    ]);
    return { alive, graveyard };
  });

  app.get('/monsters/:id', async req => {
    await requireUser(req);
    const card = await loadCard(prisma, (req.params as { id: string }).id);
    if (!card || card.status === 'incinerated') throw notFound('monster_not_found');
    return { monster: card };
  });

  app.post('/monsters/grow', async req => {
    const me = await requirePlayer(req);
    const body = parse(growSchema, req.body);
    const m = await transaction(tx => growMonster(tx, me.id, body));
    return { monster: await loadCard(prisma, m.id) };
  });

  app.post('/monsters/:id/skill', async req => {
    const me = await requirePlayer(req);
    const { strategy: s } = parse(z.object({ strategy }), req.body);
    const id = (req.params as { id: string }).id;
    await transaction(tx => spendSkillPoint(tx, me.id, id, s));
    return { monster: await loadCard(prisma, id) };
  });

  // ---------- Daily reward ----------
  app.post('/daily', async req => {
    const me = await requirePlayer(req);
    const user = await transaction(async tx => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: me.id } });
      if (sameUtcDay(u.lastDailyReward)) throw badRequest('already_claimed', 'Come back tomorrow for more nuggets!');
      await tx.user.update({ where: { id: me.id }, data: { lastDailyReward: new Date() } });
      await changeNuggets(tx, me.id, BALANCE.rewards.nuggetsDailyLogin, 'daily_login');
      return tx.user.findUniqueOrThrow({ where: { id: me.id } });
    });
    return { me: toMe(user), amount: BALANCE.rewards.nuggetsDailyLogin };
  });

  // ---------- Players ----------
  app.get('/players/nearby', async req => {
    const me = await requirePlayer(req);
    const blocked = await blockedIds(me.id);
    const friends = await prisma.friendship.findMany({ where: { status: 'accepted', OR: [{ userId: me.id }, { friendId: me.id }] } });
    const friendIds = friends.map(f => (f.userId === me.id ? f.friendId : f.userId));
    const candidates = await prisma.user.findMany({
      where: {
        role: 'player', id: { not: me.id },
        OR: [{ mapRegion: { gte: me.mapRegion - 1, lte: me.mapRegion + 1 } }, { id: { in: friendIds } }],
      },
      take: 500,
    });
    const online = await onlineSet(candidates.map(c => c.id));
    const list = candidates
      .filter(c => online.has(c.id) && !blocked.has(c.id))
      .map(c => ({ ...summary(c, online), friend: friendIds.includes(c.id), nearby: isNearbyRegion(me.mapRegion, c.mapRegion) }));
    list.sort((a, b) => Number(b.friend) - Number(a.friend) || Math.abs(a.mapRegion - me.mapRegion) - Math.abs(b.mapRegion - me.mapRegion));
    return { players: list.slice(0, 50) };
  });

  app.get('/players/:username', async req => {
    const me = await requirePlayer(req);
    const u = await prisma.user.findUnique({ where: { username: (req.params as { username: string }).username } });
    if (!u || u.role !== 'player') throw notFound('player_not_found');
    const [monsters, rec, online, friendship, block] = await Promise.all([
      loadCards(prisma, { ownerId: u.id, status: 'alive' }, 'strength'),
      record(u.id),
      onlineSet([u.id]),
      prisma.friendship.findFirst({ where: { OR: [{ userId: me.id, friendId: u.id }, { userId: u.id, friendId: me.id }] } }),
      prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: me.id, blockedId: u.id } } }),
    ]);
    const profile: PlayerProfile = {
      ...summary(u, online), monsters, ...rec,
      isFriend: friendship?.status === 'accepted',
      friendRequest: !friendship || friendship.status === 'accepted' ? 'none' : friendship.userId === me.id ? 'sent' : 'received',
      blockedByMe: !!block,
    };
    return { player: profile };
  });

  // ---------- Fights ----------
  app.get('/fights', async req => {
    const me = await requirePlayer(req);
    const rows = await prisma.fight.findMany({
      where: { OR: [{ challengerId: me.id }, { defenderId: me.id }], state: { in: ['RESOLVED', 'ABANDONED'] } },
      include: { rounds: true }, orderBy: { createdAt: 'desc' }, take: 30,
    });
    return { fights: rows.map(dbFightView).filter(f => f.result) };
  });

  app.get('/fights/:id', async req => {
    const me = await requireUser(req);
    return { fight: await fightView(me.id, (req.params as { id: string }).id) };
  });

  // ---------- Map ladder ----------
  app.get('/map', async req => {
    const me = await requirePlayer(req);
    const bosses = await loadCards(prisma, { botRole: 'boss' }, 'strength');
    return { mapRegion: me.mapRegion, regions: REGIONS, bosses: bosses.sort((a, b) => a.strength - b.strength) };
  });

  // ---------- Missions ----------
  app.get('/missions', async req => {
    const me = await requirePlayer(req);
    const day = dayKey();
    const [activity, claims] = await Promise.all([
      prisma.activity.findMany({ where: { userId: me.id, day } }),
      prisma.missionClaim.findMany({ where: { userId: me.id, day } }),
    ]);
    const counts = new Map(activity.map(a => [a.metric, a.count]));
    const claimed = new Set(claims.map(c => c.missionId));
    return {
      missions: MISSIONS.map(m => ({ ...m, progress: Math.min(m.goal, counts.get(m.metric) ?? 0), claimed: claimed.has(m.id) })),
    };
  });

  app.post('/missions/:id/claim', async req => {
    const me = await requirePlayer(req);
    const mission = MISSIONS.find(m => m.id === (req.params as { id: string }).id);
    if (!mission) throw notFound('mission_not_found');
    const day = dayKey();
    await transaction(async tx => {
      const a = await tx.activity.findUnique({ where: { userId_metric_day: { userId: me.id, metric: mission.metric, day } } });
      if ((a?.count ?? 0) < mission.goal) throw badRequest('mission_not_done', 'Not finished yet!');
      if (await tx.missionClaim.findUnique({ where: { userId_missionId_day: { userId: me.id, missionId: mission.id, day } } })) {
        throw badRequest('already_claimed');
      }
      await tx.missionClaim.create({ data: { userId: me.id, missionId: mission.id, day } });
      await changeNuggets(tx, me.id, mission.reward, 'mission', mission.id);
    });
    return { reward: mission.reward };
  });
}
