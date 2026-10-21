// Server-authoritative fight state machine. The client only ever sends picks and
// accept/decline; every number (split, shifts, roll) is computed here.
import {
  aiPick, BALANCE, fightStrength, generateSeed, hashSeed, playRounds, rollFromSeed, spinWinner,
  stakesAreValid, startingSplitWithLuck, STRATEGIES,
  type ChallengeRequest, type FightKind, type FightResultView, type FightSideView, type FightStake,
  type FightStateName, type FightView, type RoundView, type Side, type Stake, type Strategy,
} from '@mbc/shared';
import { prisma, transaction } from '../db';
import { badRequest, forbidden, notFound } from '../errors';
import { rateLimit, saveFightSnapshot } from '../redis';
import { bossFor, pickPracticeBot } from '../services/bots';
import { spendEnergy, hasEnergy } from '../services/energy';
import { resolveFight } from '../services/fightResolve';
import { assertMonsterFree } from '../services/monsters';
import { isBlockedEither } from '../services/social';
import { loadCard } from '../views';

export interface Emitter {
  toUser(userId: string, event: 'fight:state' | 'challenge:incoming', fight: FightView): void;
  toUserRaw(userId: string, event: string, payload: unknown): void;
  isOnline(userId: string): boolean;
}

interface LiveFight {
  id: string;
  kind: FightKind;
  state: FightStateName;
  roundsPlanned: number;
  users: Record<Side, string>;
  bot: Record<Side, boolean>;
  sides: Record<Side, FightSideView>;
  pStart: number | null;
  seed: string | null;
  seedHash: string | null;
  picks: { a: { strategy: Strategy; skill: number }; b: { strategy: Strategy; skill: number } }[];
  current: Partial<Record<Side, Strategy>>;
  rounds: RoundView[];
  deadline: number | null;
  timer: NodeJS.Timeout | null;
  spin: FightView['spin'];
  result: FightResultView | null;
  createdAt: string;
  graceTimers: Partial<Record<Side, NodeJS.Timeout>>;
}

const ACTIVE: FightStateName[] = ['ACCEPTED', 'ROUND_PICKING', 'ROUND_REVEAL', 'SPINNING'];
const live = new Map<string, LiveFight>();
let emitter: Emitter;

export function setEmitter(e: Emitter): void {
  emitter = e;
}

const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

function sideOf(f: LiveFight, userId: string): Side | null {
  if (f.users.A === userId && !f.bot.A) return 'A';
  if (f.users.B === userId && !f.bot.B) return 'B';
  return null;
}

export function view(f: LiveFight): FightView {
  return {
    id: f.id, kind: f.kind, state: f.state, roundsPlanned: f.roundsPlanned,
    a: f.sides.A, b: f.sides.B, pStart: f.pStart,
    shareA: f.rounds.length ? f.rounds[f.rounds.length - 1]!.shareA : f.pStart,
    seedHash: f.seedHash, rounds: f.rounds,
    currentRound: f.state === 'ROUND_PICKING' ? f.rounds.length + 1 : null,
    deadline: f.deadline,
    picked: { A: f.current.A !== undefined, B: f.current.B !== undefined },
    spin: f.spin, result: f.result, createdAt: f.createdAt,
  };
}

function broadcast(f: LiveFight): void {
  const v = view(f);
  void saveFightSnapshot(f.id, v);
  for (const s of ['A', 'B'] as const) if (!f.bot[s]) emitter.toUser(f.users[s], 'fight:state', v);
}

function clearTimer(f: LiveFight): void {
  if (f.timer) clearTimeout(f.timer);
  f.timer = null;
}

function finishLater(f: LiveFight): void {
  // Keep finished fights around briefly so late joiners still see the result.
  setTimeout(() => live.delete(f.id), 10 * 60_000).unref();
}

async function sideView(userId: string, monsterId: string, stake: FightStake | null): Promise<FightSideView> {
  const [user, card, potions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    loadCard(prisma, monsterId),
    prisma.potionActive.findMany({ where: { monsterId, fightsLeft: { gt: 0 } } }),
  ]);
  if (!card) throw notFound('monster_not_found');
  const strengthPotion = potions.some(p => p.potionType === 'strengthBoost');
  // Variant boosts (shiny, radioactive...) apply on the wheel forever.
  const luck = potions.some(p => p.potionType === 'luckyCharm') ? BALANCE.potions.luckyCharm.wheelShare : 0;
  return {
    userId, username: user.username, isBot: user.role === 'bot', monster: card, stake,
    fightStrength: fightStrength(card.strength, strengthPotion, card.variant), luck,
  };
}

function snapshot(f: LiveFight) {
  return JSON.parse(JSON.stringify({ a: f.sides.A, b: f.sides.B }));
}

// ---------- Challenges ----------

export async function sendChallenge(userId: string, req: ChallengeRequest): Promise<string> {
  if (!(await rateLimit(`challenge:${userId}`, BALANCE.rateLimits.challengesPerMinute, 60))) {
    throw badRequest('rate_limited', 'Slow down! Too many challenges this minute.');
  }
  if (!Number.isInteger(req.rounds) || req.rounds < BALANCE.fight.minSkillRounds || req.rounds > BALANCE.fight.maxSkillRounds) {
    throw badRequest('bad_rounds');
  }
  if (!['bite', 'collect', 'eat'].includes(req.stake)) throw badRequest('bad_stake');
  if (req.defenderId === userId) throw badRequest('cant_fight_self');
  const [me, them] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.user.findUnique({ where: { id: req.defenderId } }),
  ]);
  if (!them || them.role !== 'player') throw notFound('player_not_found');
  if (await isBlockedEither(userId, them.id)) throw forbidden('blocked', "You can't challenge this player.");
  if (!emitter.isOnline(them.id)) throw badRequest('player_offline', `${them.username} is not online.`);
  if (!hasEnergy(me)) throw badRequest('no_energy', 'You are out of energy. It refills one point every 20 minutes.');
  await assertMonsterFree(prisma, req.monsterAId, me.id);
  await assertMonsterFree(prisma, req.monsterBId, them.id);
  for (const f of live.values()) {
    if (f.state === 'PENDING' && f.users.A === userId && f.users.B === them.id) throw badRequest('already_challenged', 'You already challenged this player.');
  }

  const sides = {
    A: await sideView(me.id, req.monsterAId, req.stake),
    B: await sideView(them.id, req.monsterBId, null),
  };
  const row = await prisma.fight.create({
    data: {
      kind: 'pvp', challengerId: me.id, defenderId: them.id, monsterAId: req.monsterAId, monsterBId: req.monsterBId,
      stakeA: req.stake, roundsPlanned: req.rounds, state: 'PENDING', snapshot: JSON.parse(JSON.stringify({ a: sides.A, b: sides.B })),
    },
  });
  const f: LiveFight = {
    id: row.id, kind: 'pvp', state: 'PENDING', roundsPlanned: req.rounds,
    users: { A: me.id, B: them.id }, bot: { A: false, B: false }, sides,
    pStart: null, seed: null, seedHash: null, picks: [], current: {}, rounds: [],
    deadline: Date.now() + BALANCE.fight.challengeAcceptSeconds * 1000, timer: null,
    spin: null, result: null, createdAt: row.createdAt.toISOString(), graceTimers: {},
  };
  live.set(f.id, f);
  f.timer = setTimeout(() => void closeChallenge(f, 'EXPIRED'), BALANCE.fight.challengeAcceptSeconds * 1000);
  emitter.toUser(them.id, 'challenge:incoming', view(f));
  emitter.toUser(me.id, 'fight:state', view(f));
  return f.id;
}

async function closeChallenge(f: LiveFight, state: 'DECLINED' | 'EXPIRED'): Promise<void> {
  if (f.state !== 'PENDING') return;
  clearTimer(f);
  f.state = state;
  f.deadline = null;
  await prisma.fight.update({ where: { id: f.id }, data: { state } });
  broadcast(f);
  for (const s of ['A', 'B'] as const) emitter.toUserRaw(f.users[s], 'challenge:update', { fightId: f.id, state });
  finishLater(f);
}

export async function respondChallenge(userId: string, fightId: string, accept: boolean, stake?: Stake): Promise<void> {
  const f = live.get(fightId);
  if (!f || f.state !== 'PENDING') throw badRequest('challenge_gone', 'That challenge has gone.');
  if (f.users.B !== userId) throw forbidden('not_your_challenge');
  if (!accept) return closeChallenge(f, 'DECLINED');

  const stakeA = f.sides.A.stake as Stake;
  if (!stake || !['bite', 'collect', 'eat'].includes(stake)) throw badRequest('bad_stake', 'Pick a stake.');
  if (!stakesAreValid(stakeA, stake)) {
    throw badRequest('bad_stake', stakeA === 'bite' ? 'This is a Bite fight: both players must pick Bite.' : 'Bite needs both players to agree. Pick Collect or Eat.');
  }

  const seed = generateSeed();
  await transaction(async tx => {
    await assertMonsterFree(tx, f.sides.A.monster.id, f.users.A);
    await assertMonsterFree(tx, f.sides.B.monster.id, f.users.B);
    // Lock both monsters so they can't be traded or entered in a second fight.
    const locked = await tx.monster.updateMany({
      where: { id: { in: [f.sides.A.monster.id, f.sides.B.monster.id] }, lockedFightId: null },
      data: { lockedFightId: f.id },
    });
    if (locked.count !== 2) throw badRequest('monster_locked', 'One of the monsters is busy.');
    await spendEnergy(tx, f.users.A);
    await spendEnergy(tx, f.users.B);
  });
  clearTimer(f);
  // Refresh both sides now that they're locked in (potions, latest strength).
  f.sides = { A: await sideView(f.users.A, f.sides.A.monster.id, stakeA), B: await sideView(f.users.B, f.sides.B.monster.id, stake) };
  await startFight(f, seed, stake);
}

export async function cancelChallenge(userId: string, fightId: string): Promise<void> {
  const f = live.get(fightId);
  if (!f || f.state !== 'PENDING' || f.users.A !== userId) throw badRequest('challenge_gone');
  await closeChallenge(f, 'EXPIRED');
}

// ---------- Practice and boss fights (against bots, no stake) ----------

export async function startPractice(userId: string, monsterId: string, rounds: number, boss: boolean): Promise<string> {
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > BALANCE.fight.maxSkillRounds) throw badRequest('bad_rounds');
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const mine = await assertMonsterFree(prisma, monsterId, userId);
  const botMonsterId = boss ? await bossFor(me.mapRegion) : await pickPracticeBot(mine.strength, me.mapRegion);
  const bot = await prisma.monster.findUniqueOrThrow({ where: { id: botMonsterId } });
  const lock = await prisma.monster.updateMany({ where: { id: monsterId, lockedFightId: null }, data: { lockedFightId: 'pending' } });
  if (lock.count !== 1) throw badRequest('monster_locked');

  const kind: FightKind = boss ? 'boss' : 'practice';
  const unlock = () => prisma.monster.updateMany({ where: { id: monsterId, lockedFightId: 'pending' }, data: { lockedFightId: null } });
  let sides: Record<Side, FightSideView>;
  let row: Awaited<ReturnType<typeof prisma.fight.create>>;
  try {
    sides = { A: await sideView(userId, monsterId, 'none'), B: await sideView(bot.ownerId, botMonsterId, 'none') };
    row = await prisma.fight.create({
    data: {
      kind, challengerId: userId, defenderId: bot.ownerId, monsterAId: monsterId, monsterBId: botMonsterId,
      stakeA: 'none', stakeB: 'none', roundsPlanned: rounds, state: 'ACCEPTED', snapshot: JSON.parse(JSON.stringify({ a: sides.A, b: sides.B })),
      },
    });
  } catch (e) {
    await unlock();
    throw e;
  }
  await prisma.monster.update({ where: { id: monsterId }, data: { lockedFightId: row.id } });
  const f: LiveFight = {
    id: row.id, kind, state: 'ACCEPTED', roundsPlanned: rounds,
    users: { A: userId, B: bot.ownerId }, bot: { A: false, B: true }, sides,
    pStart: null, seed: null, seedHash: null, picks: [], current: {}, rounds: [], deadline: null, timer: null,
    spin: null, result: null, createdAt: row.createdAt.toISOString(), graceTimers: {},
  };
  live.set(f.id, f);
  await startFight(f, generateSeed(), 'none');
  return f.id;
}

// ---------- The fight itself ----------

async function startFight(f: LiveFight, seed: string, stakeB: FightStake): Promise<void> {
  f.seed = seed;
  f.seedHash = await hashSeed(seed);
  f.pStart = startingSplitWithLuck(f.sides.A.fightStrength, f.sides.B.fightStrength, f.sides.A.luck, f.sides.B.luck);
  f.state = 'ACCEPTED';
  await prisma.fight.update({
    where: { id: f.id },
    data: { state: 'ACCEPTED', stakeB, pStart: f.pStart, seedHash: f.seedHash, seed, snapshot: snapshot(f) },
  });
  broadcast(f);
  for (const s of ['A', 'B'] as const) if (!f.bot[s]) emitter.toUserRaw(f.users[s], 'me:update', {});
  f.timer = setTimeout(() => (f.roundsPlanned > 0 ? beginRound(f) : void spin(f)), 1500);
}

function beginRound(f: LiveFight): void {
  if (!ACTIVE.includes(f.state)) return;
  f.state = 'ROUND_PICKING';
  f.current = {};
  f.deadline = Date.now() + BALANCE.fight.roundPickSeconds * 1000;
  for (const s of ['A', 'B'] as const) {
    if (f.bot[s]) f.current[s] = aiPick(f.sides[s].monster.skills);
  }
  clearTimer(f);
  // A little grace past the visible timer for network lag.
  f.timer = setTimeout(() => reveal(f), BALANCE.fight.roundPickSeconds * 1000 + 500);
  broadcast(f);
}

export function pick(userId: string, fightId: string, strategy: Strategy): void {
  const f = live.get(fightId);
  if (!f) throw notFound('fight_not_found');
  const side = sideOf(f, userId);
  if (!side) throw forbidden('not_in_fight');
  if (f.state !== 'ROUND_PICKING') throw badRequest('not_picking');
  if (!STRATEGIES.includes(strategy)) throw badRequest('bad_strategy');
  if (f.current[side]) throw badRequest('already_picked');
  f.current[side] = strategy;
  if (f.current.A && f.current.B) reveal(f);
  else broadcast(f);
}

function reveal(f: LiveFight): void {
  if (f.state !== 'ROUND_PICKING') return;
  clearTimer(f);
  // No pick in time means a random one.
  const randomPick = () => STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)]!;
  const a = f.current.A ?? randomPick();
  const b = f.current.B ?? randomPick();
  f.picks.push({
    a: { strategy: a, skill: f.sides.A.monster.skills[a] },
    b: { strategy: b, skill: f.sides.B.monster.skills[b] },
  });
  const played = playRounds(f.pStart!, f.picks).rounds;
  const last = played[played.length - 1]!;
  f.rounds.push({ roundNo: last.roundNo, pickA: a, pickB: b, winner: last.winner, delta: last.delta, shareA: last.shareA });
  f.state = 'ROUND_REVEAL';
  f.deadline = null;
  broadcast(f);
  f.timer = setTimeout(() => {
    if (f.rounds.length < f.roundsPlanned) beginRound(f);
    else void spin(f);
  }, BALANCE.fightTiming.revealSeconds * 1000);
}

async function spin(f: LiveFight): Promise<void> {
  if (!ACTIVE.includes(f.state)) return;
  clearTimer(f);
  const { pFinal } = playRounds(f.pStart!, f.picks);
  const roll = await rollFromSeed(f.seed!);
  const winner = spinWinner(pFinal, roll);
  f.state = 'SPINNING';
  f.spin = { roll, pFinal, seed: f.seed!, winner };
  broadcast(f);
  try {
    f.result = await resolveFight({ fightId: f.id, winnerSide: winner, abandonedBy: null, rounds: f.rounds, pFinal, roll, seed: f.seed });
    f.state = 'RESOLVED';
  } catch (e) {
    console.error('fight resolve failed', f.id, e);
    await voidFight(f.id);
    f.state = 'ABANDONED';
  }
  broadcast(f);
  for (const s of ['A', 'B'] as const) if (!f.bot[s]) emitter.toUserRaw(f.users[s], 'me:update', {});
  finishLater(f);
}

/** A player left after accepting: it counts as a loss for them. */
async function abandon(f: LiveFight, leaver: Side): Promise<void> {
  if (!ACTIVE.includes(f.state) || f.state === 'SPINNING') return;
  clearTimer(f);
  f.state = 'SPINNING'; // block other transitions while we settle
  const pFinal = f.picks.length ? playRounds(f.pStart!, f.picks).pFinal : f.pStart;
  f.result = await resolveFight({ fightId: f.id, winnerSide: other(leaver), abandonedBy: leaver, rounds: f.rounds, pFinal, roll: null, seed: null });
  f.state = 'ABANDONED';
  broadcast(f);
  for (const s of ['A', 'B'] as const) if (!f.bot[s]) emitter.toUserRaw(f.users[s], 'me:update', {});
  finishLater(f);
}

export async function leave(userId: string, fightId: string): Promise<void> {
  const f = live.get(fightId);
  if (!f) throw notFound('fight_not_found');
  const side = sideOf(f, userId);
  if (!side) throw forbidden('not_in_fight');
  if (f.state === 'PENDING') return side === 'A' ? closeChallenge(f, 'EXPIRED') : closeChallenge(f, 'DECLINED');
  await abandon(f, side);
}

// ---------- Presence hooks ----------

export function onUserDisconnected(userId: string): void {
  for (const f of live.values()) {
    const side = sideOf(f, userId);
    if (!side) continue;
    if (f.state === 'PENDING' && side === 'A') void closeChallenge(f, 'EXPIRED');
    if (ACTIVE.includes(f.state) && f.state !== 'SPINNING' && !f.graceTimers[side]) {
      f.graceTimers[side] = setTimeout(() => {
        delete f.graceTimers[side];
        void abandon(f, side);
      }, BALANCE.fightTiming.reconnectGraceSeconds * 1000);
    }
  }
}

export function onUserConnected(userId: string): void {
  for (const f of live.values()) {
    const side = sideOf(f, userId);
    const t = side ? f.graceTimers[side] : undefined;
    if (side && t) {
      clearTimeout(t);
      delete f.graceTimers[side];
    }
  }
}

export function pendingChallengesFor(userId: string): FightView[] {
  return [...live.values()].filter(f => f.state === 'PENDING' && f.users.B === userId).map(view);
}

/** Fight view for a participant: live state if in memory, else rebuilt from the database. */
export async function fightView(userId: string, fightId: string): Promise<FightView> {
  const f = live.get(fightId);
  if (f) {
    if (!sideOf(f, userId)) throw forbidden('not_in_fight');
    return view(f);
  }
  const row = await prisma.fight.findUnique({ where: { id: fightId }, include: { rounds: { orderBy: { roundNo: 'asc' } } } });
  if (!row || (row.challengerId !== userId && row.defenderId !== userId)) throw notFound('fight_not_found');
  return dbFightView(row);
}

export function dbFightView(row: Awaited<ReturnType<typeof prisma.fight.findUniqueOrThrow>> & { rounds: { roundNo: number; pickA: string; pickB: string; winner: string; delta: number }[] }): FightView {
  const snap = row.snapshot as unknown as { a: FightSideView; b: FightSideView };
  const rounds = row.pStart === null ? [] : playRounds(row.pStart, row.rounds.map(r => ({
    a: { strategy: r.pickA as Strategy, skill: snap.a.monster.skills[r.pickA as Strategy] },
    b: { strategy: r.pickB as Strategy, skill: snap.b.monster.skills[r.pickB as Strategy] },
  }))).rounds.map(r => ({ roundNo: r.roundNo, pickA: r.a.strategy, pickB: r.b.strategy, winner: r.winner, delta: r.delta, shareA: r.shareA }));
  const outcome = row.outcome as unknown as FightResultView | null;
  const result = outcome && outcome.winnerSide ? outcome : null;
  const done = row.state === 'RESOLVED';
  return {
    id: row.id, kind: row.kind as FightKind, state: row.state as FightStateName, roundsPlanned: row.roundsPlanned,
    a: { ...snap.a, stake: row.stakeA as FightStake }, b: { ...snap.b, stake: (row.stakeB as FightStake | null) ?? null },
    pStart: row.pStart, shareA: rounds.length ? rounds[rounds.length - 1]!.shareA : row.pStart,
    seedHash: row.seedHash, rounds, currentRound: null, deadline: null, picked: { A: false, B: false },
    spin: done && row.roll !== null && row.pFinal !== null && row.seed && result
      ? { roll: row.roll, pFinal: row.pFinal, seed: row.seed, winner: result.winnerSide } : null,
    result, createdAt: row.createdAt.toISOString(),
  };
}

/** Undo an unfinished fight with no winner: unlock monsters, nobody loses anything. */
async function voidFight(fightId: string): Promise<void> {
  await prisma.$transaction([
    prisma.monster.updateMany({ where: { lockedFightId: fightId }, data: { lockedFightId: null } }),
    prisma.fight.update({ where: { id: fightId }, data: { state: 'ABANDONED', outcome: { voided: true } } }),
  ]);
}

/** After a server restart, in-memory fights are gone: void them so no monster stays locked. */
export async function recoverStaleFights(): Promise<void> {
  await prisma.fight.updateMany({ where: { state: 'PENDING' }, data: { state: 'EXPIRED' } });
  const stale = await prisma.fight.findMany({ where: { state: { in: ACTIVE } }, select: { id: true } });
  for (const { id } of stale) await voidFight(id);
  await prisma.monster.updateMany({ where: { lockedFightId: 'pending' }, data: { lockedFightId: null } });
}
