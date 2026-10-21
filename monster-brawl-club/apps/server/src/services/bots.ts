import {
  BALANCE, power, randomLook, randomSkillSpread, REGIONS, rollRarity, rollVariant, type Rng, type Skills, type Variant,
} from '@mbc/shared';
import { prisma, type Db } from '../db';
import { hashSecret } from '../auth';

export const ARENA_BOT = 'Arena Bots';
export const MARKET_BOT = 'Gristle the Trader';
const PRACTICE_PER_REGION = 4;

/** Small deterministic RNG so bosses look the same on every server. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_A = ['Grub', 'Snarl', 'Blob', 'Mog', 'Zix', 'Krunk', 'Fizz', 'Gor', 'Wib', 'Thud', 'Splat', 'Nib', 'Bork', 'Grizz', 'Mungo', 'Scuz', 'Wobb', 'Drool'];
const NAME_B = ['o', 'zilla', 'bert', 'nax', 'ster', 'gle', 'tron', 'ix', 'wump', 'ling', 'saur', 'muncher', 'kins', 'oid'];
export function botName(rng: Rng): string {
  return NAME_A[Math.floor(rng() * NAME_A.length)]! + NAME_B[Math.floor(rng() * NAME_B.length)]!;
}

async function botUser(username: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing.id;
  const u = await prisma.user.create({
    data: { username, role: 'bot', passwordHash: await hashSecret(crypto.randomUUID()), nuggets: 0 },
  });
  return u.id;
}

interface BotSpec {
  name: string;
  strength: number;
  skills: Skills;
  rng: Rng;
  botRole: 'practice' | 'boss' | 'market';
  botRegion: number | null;
  level?: number;
}

async function createBotMonster(db: Db, ownerId: string, spec: BotSpec): Promise<string> {
  const look = randomLook(spec.rng, true);
  const m = await db.monster.create({
    data: {
      ownerId, name: spec.name, species: look.parts.species, parts: { ...look.parts }, palette: { ...look.palette },
      strength: spec.strength, atk: spec.skills.attack, def: spec.skills.defense, tricks: spec.skills.tricks, brains: spec.skills.brains,
      level: spec.level ?? 1, rarity: spec.botRole === 'boss' ? 'legendary' : rollRarity(spec.rng()),
      // Market stock can roll rare variants like any grown monster; arena bots stay plain.
      variant: spec.botRole === 'market' ? rollVariant(spec.rng()) : 'normal',
      botRole: spec.botRole, botRegion: spec.botRegion,
    },
  });
  return m.id;
}

/** Create the bot accounts, bosses and practice opponents if missing. Safe to run on every start. */
export async function ensureBots(): Promise<void> {
  const arena = await botUser(ARENA_BOT);
  await botUser(MARKET_BOT);
  for (const region of REGIONS) {
    const bossExists = await prisma.monster.count({ where: { ownerId: arena, botRole: 'boss', botRegion: region.id } });
    if (!bossExists) {
      await createBotMonster(prisma, arena, {
        name: region.boss.name, strength: region.boss.strength, skills: region.boss.skills,
        rng: seededRng(region.id * 7919), botRole: 'boss', botRegion: region.id, level: region.id * 2,
      });
    }
    const have = await prisma.monster.count({ where: { ownerId: arena, botRole: 'practice', botRegion: region.id } });
    const rng = seededRng(region.id * 104729 + have);
    for (let i = have; i < PRACTICE_PER_REGION; i++) {
      const top = Math.min(region.maxStrength, region.minStrength + 120);
      const strength = Math.round(region.minStrength + 10 + ((top - region.minStrength - 10) * (i + 0.5)) / PRACTICE_PER_REGION);
      await createBotMonster(prisma, arena, {
        name: botName(rng), strength, skills: randomSkillSpread(8 + region.id + 4, rng),
        rng, botRole: 'practice', botRegion: region.id, level: Math.max(1, region.id + i - 1),
      });
    }
  }
  await ensureMarketStock();
}

/** Keep the market stocked with bot-listed monsters. */
export async function ensureMarketStock(): Promise<void> {
  const market = await botUser(MARKET_BOT);
  const open = await prisma.marketListing.count({ where: { sellerId: market, state: 'open' } });
  const rng: Rng = Math.random;
  for (let i = open; i < BALANCE.market.botListings; i++) {
    const region = REGIONS[Math.floor(rng() * 4)]!;
    const strength = Math.round(region.minStrength + 20 + rng() * (region.maxStrength - region.minStrength - 20));
    const monsterId = await createBotMonster(prisma, market, {
      name: botName(rng), strength, skills: randomSkillSpread(12 + Math.floor(rng() * 6), rng),
      rng, botRole: 'market', botRegion: region.id,
    });
    const { variant } = await prisma.monster.findUniqueOrThrow({ where: { id: monsterId }, select: { variant: true } });
    await prisma.marketListing.create({ data: { sellerId: market, monsterId, price: Math.round(power(strength, variant as Variant) * 3 + 40) } });
  }
}

/** Pick the practice bot closest in strength to the player's monster, from their region. */
export async function pickPracticeBot(strength: number, region: number): Promise<string> {
  const bots = await prisma.monster.findMany({ where: { botRole: 'practice', botRegion: region } });
  bots.sort((a, b) => Math.abs(a.strength - strength) - Math.abs(b.strength - strength));
  const nearest = bots.slice(0, 2);
  const pick = nearest[Math.floor(Math.random() * nearest.length)];
  if (!pick) throw new Error('No practice bots: run ensureBots first');
  return pick.id;
}

export async function bossFor(region: number): Promise<string> {
  const boss = await prisma.monster.findFirst({ where: { botRole: 'boss', botRegion: region } });
  if (!boss) throw new Error('No boss: run ensureBots first');
  return boss.id;
}
