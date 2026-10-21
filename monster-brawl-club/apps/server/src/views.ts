import type { Monster, PotionActive, Prisma, User } from '@prisma/client';
import {
  BALANCE, cardFrame, collectionLimit, currentEnergy, graveyardLimit, msUntilNextEnergy, profileLevel, xpToNextLevel,
  type Me, type MonsterCard, type MonsterPalette, type MonsterParts, type MonsterStatus, type PotionType, type Rarity,
} from '@mbc/shared';
import type { Db } from './db';
import { dayKey, sameUtcDay } from './time';

type MonsterRow = Monster & { owner: { username: string; role: string }; potions: PotionActive[] };

export const monsterInclude = { owner: { select: { username: true, role: true } }, potions: true } as const;

export function toCard(m: MonsterRow, listed = false): MonsterCard {
  const now = Date.now();
  const toNext = xpToNextLevel(m.level);
  return {
    id: m.id, ownerId: m.ownerId, ownerName: m.owner.username, name: m.name, species: m.species,
    parts: m.parts as unknown as MonsterParts, palette: m.palette as unknown as MonsterPalette,
    strength: m.strength,
    skills: { attack: m.atk, defense: m.def, tricks: m.tricks, brains: m.brains },
    skillPoints: m.skillPoints, level: m.level, xp: m.xp, xpToNext: Number.isFinite(toNext) ? toNext : null,
    rarity: m.rarity as Rarity, sheen: m.sheen, status: m.status as MonsterStatus,
    wins: m.wins, losses: m.losses, frame: cardFrame(m.level),
    growingUntil: m.readyAt.getTime() > now ? m.readyAt.toISOString() : null,
    locked: m.lockedFightId !== null,
    dojoUntil: m.dojoUntil ? m.dojoUntil.toISOString() : null,
    dojoReward: (m.dojoReward as 'skill' | 'strength' | null) ?? null,
    listed,
    potions: m.potions.map(p => ({ type: p.potionType as PotionType, fightsLeft: p.fightsLeft })),
    isBot: m.owner.role === 'bot',
  };
}

/** Load monsters as cards, with their market-listing flag. */
export async function loadCards(db: Db, where: Prisma.MonsterWhereInput, orderBy: 'strength' | 'createdAt' = 'createdAt'): Promise<MonsterCard[]> {
  const rows = await db.monster.findMany({
    where, include: monsterInclude,
    orderBy: orderBy === 'strength' ? { strength: 'desc' } : { createdAt: 'asc' },
  });
  const listed = new Set((await db.marketListing.findMany({
    where: { state: 'open', monsterId: { in: rows.map(r => r.id) } }, select: { monsterId: true },
  })).map(l => l.monsterId));
  return rows.map(r => toCard(r, listed.has(r.id)));
}

export async function loadCard(db: Db, id: string): Promise<MonsterCard | null> {
  const [card] = await loadCards(db, { id });
  return card ?? null;
}

export function toMe(u: User): Me {
  const now = Date.now();
  const e = currentEnergy({ energy: u.energy, updatedAt: u.energyUpdatedAt.getTime() }, now);
  const level = profileLevel(u.profileXp);
  return {
    id: u.id, username: u.username, role: u.role as Me['role'], nuggets: u.nuggets,
    energy: e.energy, energyMax: BALANCE.energy.max, nextEnergyMs: msUntilNextEnergy(e, now),
    profileXp: u.profileXp, profileLevel: level, isMember: u.isMember, mapRegion: u.mapRegion,
    unlocks: { trader: level >= BALANCE.profileUnlocks.traderLevel, dojo: level >= BALANCE.profileUnlocks.dojoLevel },
    allowTrades: u.allowTrades, allowRiskyStakes: u.allowRiskyStakes,
    dailyRewardAvailable: !sameUtcDay(u.lastDailyReward),
    standardGrowAvailable: !sameUtcDay(u.lastStandardGrow),
    playSecondsToday: u.playDay === dayKey() ? u.playSecondsToday : 0,
    dailyPlayCapMinutes: u.dailyPlayCapMinutes,
    collectionLimit: collectionLimit(u.isMember), graveyardLimit: graveyardLimit(u.isMember),
  };
}
