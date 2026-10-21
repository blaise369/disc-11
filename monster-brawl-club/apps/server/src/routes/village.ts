import type { FastifyInstance } from 'fastify';
import {
  applyXp, BALANCE, dojoSlots, dojoStrength, listingFee, profileLevel, resurrectCost, resurrectedStrength, STRATEGIES,
} from '@mbc/shared';
import { z } from 'zod';
import { requirePlayer } from '../auth';
import { prisma, transaction } from '../db';
import { badRequest, forbidden, notFound, parse } from '../errors';
import { ensureMarketStock } from '../services/bots';
import { bumpActivity, changeNuggets } from '../services/ledger';
import { assertCollectionSpace, assertMonsterFree, raiseSkill } from '../services/monsters';
import { dayKey } from '../time';
import { loadCard, loadCards, toMe } from '../views';

type Op = '+' | '-' | 'x';
interface Question { a: number; b: number; op: Op }
const answerOf = (q: Question) => (q.op === '+' ? q.a + q.b : q.op === '-' ? q.a - q.b : q.a * q.b);

function makeQuestions(n: number): Question[] {
  const r = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  return Array.from({ length: n }, () => {
    const op = (['+', '-', 'x'] as const)[r(0, 2)]!;
    if (op === 'x') return { a: r(2, 12), b: r(2, 12), op };
    const a = r(5, 60), b = r(1, op === '-' ? a : 40);
    return { a, b, op };
  });
}

async function arcadeEarnedToday(userId: string): Promise<number> {
  const start = new Date(dayKey() + 'T00:00:00Z');
  const agg = await prisma.ledgerEntry.aggregate({ where: { userId, reason: 'arcade', createdAt: { gte: start } }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

export async function villageRoutes(app: FastifyInstance): Promise<void> {
  // ---------- Potion shop ----------
  app.post('/potions/buy', async req => {
    const me = await requirePlayer(req);
    const body = parse(z.object({
      monsterId: z.string(),
      type: z.enum(['strengthBoost', 'luckyCharm', 'skillPlusOne']),
      strategy: z.enum(STRATEGIES).optional(),
    }), req.body);
    await transaction(async tx => {
      const m = await assertMonsterFree(tx, body.monsterId, me.id);
      await changeNuggets(tx, me.id, -BALANCE.potions[body.type].cost, `potion_${body.type}`, m.id);
      if (body.type === 'skillPlusOne') {
        if (!body.strategy) throw badRequest('pick_skill', 'Pick which skill to raise.');
        await raiseSkill(tx, m, body.strategy);
        return;
      }
      const existing = await tx.potionActive.findFirst({ where: { monsterId: m.id, potionType: body.type } });
      if (existing) throw badRequest('potion_active', `${m.name} already has that potion for the next fight.`);
      await tx.potionActive.create({ data: { monsterId: m.id, potionType: body.type, fightsLeft: BALANCE.potions[body.type].fights } });
    });
    return { monster: await loadCard(prisma, body.monsterId) };
  });

  // ---------- Dojo ----------
  app.get('/dojo', async req => {
    const me = await requirePlayer(req);
    const training = await loadCards(prisma, { ownerId: me.id, status: 'alive', dojoUntil: { not: null } });
    return { slots: dojoSlots(me.isMember), training, unlocked: profileLevel(me.profileXp) >= BALANCE.profileUnlocks.dojoLevel };
  });

  app.post('/dojo/start', async req => {
    const me = await requirePlayer(req);
    if (profileLevel(me.profileXp) < BALANCE.profileUnlocks.dojoLevel) throw forbidden('locked', `The dojo opens at profile level ${BALANCE.profileUnlocks.dojoLevel}.`);
    const body = parse(z.object({ monsterId: z.string(), reward: z.enum(['skill', 'strength']) }), req.body);
    await transaction(async tx => {
      const busy = await tx.monster.count({ where: { ownerId: me.id, dojoUntil: { not: null } } });
      if (busy >= dojoSlots(me.isMember)) throw badRequest('dojo_full', 'All your dojo slots are in use.');
      const m = await assertMonsterFree(tx, body.monsterId, me.id);
      await changeNuggets(tx, me.id, -BALANCE.dojo.cost, 'dojo', m.id);
      await tx.monster.update({ where: { id: m.id }, data: { dojoUntil: new Date(Date.now() + BALANCE.dojo.minutes * 60_000), dojoReward: body.reward } });
    });
    return { monster: await loadCard(prisma, body.monsterId) };
  });

  app.post('/dojo/collect', async req => {
    const me = await requirePlayer(req);
    const { monsterId } = parse(z.object({ monsterId: z.string() }), req.body);
    await transaction(async tx => {
      const m = await tx.monster.findUnique({ where: { id: monsterId } });
      if (!m || m.ownerId !== me.id || !m.dojoUntil) throw notFound('monster_not_in_dojo');
      if (m.dojoUntil.getTime() > Date.now()) throw badRequest('still_training', `${m.name} is still training.`);
      const strength = m.dojoReward === 'strength' ? dojoStrength(m.strength) : m.strength;
      const lvl = applyXp({ level: m.level, xp: m.xp, strength, skillPoints: m.skillPoints + (m.dojoReward === 'skill' ? BALANCE.dojo.skillPoints : 0) }, BALANCE.dojo.xp);
      await tx.monster.update({
        where: { id: m.id },
        data: { strength: lvl.strength, level: lvl.level, xp: lvl.xp, skillPoints: lvl.skillPoints, dojoUntil: null, dojoReward: null },
      });
      await tx.user.update({ where: { id: me.id }, data: { profileXp: { increment: BALANCE.dojo.xp } } });
      if (lvl.levelsGained) await changeNuggets(tx, me.id, lvl.levelsGained * BALANCE.rewards.nuggetsLevelUp, 'level_up', m.id);
      await bumpActivity(tx, me.id, 'dojoSessions');
    });
    return { monster: await loadCard(prisma, monsterId) };
  });

  // ---------- Graveyard ----------
  app.post('/graveyard/:id/resurrect', async req => {
    const me = await requirePlayer(req);
    const id = (req.params as { id: string }).id;
    await transaction(async tx => {
      const m = await tx.monster.findUnique({ where: { id } });
      if (!m || m.ownerId !== me.id || m.status !== 'graveyard') throw notFound('monster_not_in_graveyard');
      await assertCollectionSpace(tx, me.id, me.isMember);
      await changeNuggets(tx, me.id, -resurrectCost(m.strength), 'resurrect', m.id);
      await tx.monster.update({ where: { id }, data: { status: 'alive', strength: resurrectedStrength(m.strength) } });
    });
    return { monster: await loadCard(prisma, id) };
  });

  app.post('/graveyard/:id/incinerate', async req => {
    const me = await requirePlayer(req);
    const id = (req.params as { id: string }).id;
    await transaction(async tx => {
      const m = await tx.monster.findUnique({ where: { id } });
      if (!m || m.ownerId !== me.id || m.status !== 'graveyard') throw notFound('monster_not_in_graveyard');
      await tx.monster.update({ where: { id }, data: { status: 'incinerated' } });
      await changeNuggets(tx, me.id, BALANCE.graveyard.incinerateRefund, 'incinerate', m.id);
    });
    return { ok: true };
  });

  // ---------- Market ----------
  app.get('/market', async req => {
    await requirePlayer(req);
    await ensureMarketStock();
    const listings = await prisma.marketListing.findMany({ where: { state: 'open' }, orderBy: { createdAt: 'desc' }, take: 60 });
    const cards = new Map((await loadCards(prisma, { id: { in: listings.map(l => l.monsterId) } })).map(c => [c.id, c]));
    return {
      listings: listings.filter(l => cards.has(l.monsterId)).map(l => ({ id: l.id, price: l.price, sellerId: l.sellerId, monster: cards.get(l.monsterId)! })),
    };
  });

  app.post('/market/list', async req => {
    const me = await requirePlayer(req);
    const body = parse(z.object({ monsterId: z.string(), price: z.number().int().min(BALANCE.market.minPrice).max(BALANCE.market.maxPrice) }), req.body);
    const listing = await transaction(async tx => {
      await assertMonsterFree(tx, body.monsterId, me.id);
      const fee = listingFee(body.price);
      const l = await tx.marketListing.create({ data: { sellerId: me.id, monsterId: body.monsterId, price: body.price } });
      await changeNuggets(tx, me.id, -fee, 'market_fee', l.id);
      return l;
    });
    return { listing };
  });

  app.post('/market/:id/buy', async req => {
    const me = await requirePlayer(req);
    const id = (req.params as { id: string }).id;
    const monsterId = await transaction(async tx => {
      const l = await tx.marketListing.findUnique({ where: { id } });
      if (!l || l.state !== 'open') throw badRequest('listing_gone', 'Someone else got there first!');
      if (l.sellerId === me.id) throw badRequest('own_listing');
      await assertCollectionSpace(tx, me.id, me.isMember);
      await changeNuggets(tx, me.id, -l.price, 'market_buy', l.id);
      const seller = await tx.user.findUniqueOrThrow({ where: { id: l.sellerId } });
      if (seller.role !== 'bot') await changeNuggets(tx, seller.id, l.price, 'market_sale', l.id);
      await tx.marketListing.update({ where: { id }, data: { state: 'sold', buyerId: me.id } });
      await tx.monster.update({ where: { id: l.monsterId }, data: { ownerId: me.id, botRole: null, botRegion: null } });
      return l.monsterId;
    });
    void ensureMarketStock();
    return { monster: await loadCard(prisma, monsterId) };
  });

  app.post('/market/:id/cancel', async req => {
    const me = await requirePlayer(req);
    const id = (req.params as { id: string }).id;
    const n = await prisma.marketListing.updateMany({ where: { id, sellerId: me.id, state: 'open' }, data: { state: 'cancelled' } });
    if (!n.count) throw notFound('listing_not_found');
    return { ok: true };
  });

  // ---------- Club membership (bought with nuggets, permanent) ----------
  app.post('/membership/buy', async req => {
    const me = await requirePlayer(req);
    if (me.isMember) throw badRequest('already_member', "You're already in the club!");
    const user = await transaction(async tx => {
      await changeNuggets(tx, me.id, -BALANCE.membership.cost, 'membership');
      return tx.user.update({ where: { id: me.id }, data: { isMember: true } });
    });
    return { me: toMe(user) };
  });

  // ---------- Arcade: Maths Sprint ----------
  app.get('/arcade', async req => {
    const me = await requirePlayer(req);
    return { earnedToday: await arcadeEarnedToday(me.id), maxPerDay: BALANCE.arcade.maxPerDay, maxPerGame: BALANCE.arcade.maxPerGame };
  });

  app.post('/arcade/start', async req => {
    const me = await requirePlayer(req);
    const questions = makeQuestions(BALANCE.arcade.questionsPerGame);
    const game = await prisma.arcadeGame.create({ data: { userId: me.id, questions: questions as unknown as object } });
    return { gameId: game.id, questions: questions.map(q => ({ a: q.a, b: q.b, op: q.op })), seconds: BALANCE.arcade.secondsPerGame };
  });

  app.post('/arcade/:id/finish', async req => {
    const me = await requirePlayer(req);
    const { answers } = parse(z.object({ answers: z.array(z.number().int().nullable()).max(50) }), req.body);
    const id = (req.params as { id: string }).id;
    return transaction(async tx => {
      const game = await tx.arcadeGame.findUnique({ where: { id } });
      if (!game || game.userId !== me.id || game.finishedAt) throw notFound('game_not_found');
      const late = Date.now() - game.startedAt.getTime() > (BALANCE.arcade.secondsPerGame + 5) * 1000;
      const questions = game.questions as unknown as Question[];
      const correct = late ? 0 : questions.filter((q, i) => answers[i] === answerOf(q)).length;
      const earned = await arcadeEarnedToday(me.id);
      const reward = Math.max(0, Math.min(correct * BALANCE.arcade.nuggetsPerCorrect, BALANCE.arcade.maxPerGame, BALANCE.arcade.maxPerDay - earned));
      await tx.arcadeGame.update({ where: { id }, data: { finishedAt: new Date(), correct, reward } });
      if (reward) await changeNuggets(tx, me.id, reward, 'arcade', id);
      await bumpActivity(tx, me.id, 'arcadeGames');
      return { correct, total: questions.length, reward, late, capped: reward < Math.min(correct * BALANCE.arcade.nuggetsPerCorrect, BALANCE.arcade.maxPerGame) };
    });
  });
}
