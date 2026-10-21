import { BALANCE } from './balance';
import type { Rng } from './ai';
import { STRATEGIES, type Skills } from './strategy';

export type GrowTier = keyof typeof BALANCE.growTiers;
export const GROW_TIERS = Object.keys(BALANCE.growTiers) as GrowTier[];
export type Rarity = keyof typeof BALANCE.rarity;
export const RARITIES = Object.keys(BALANCE.rarity) as Rarity[];
export type CardFrame = keyof typeof BALANCE.cardFrames;
export type SpecialVariant = keyof typeof BALANCE.variants;
export type Variant = 'normal' | SpecialVariant;
/** Rarest first. */
export const SPECIAL_VARIANTS = Object.keys(BALANCE.variants) as SpecialVariant[];
export const VARIANTS: Variant[] = ['normal', ...[...SPECIAL_VARIANTS].reverse()];

// ---------- Levels ----------

export function xpToNextLevel(level: number): number {
  const l = BALANCE.levels;
  return level >= l.max ? Number.POSITIVE_INFINITY : l.xpBase + l.xpPerLevel * (level - 1);
}

export interface LevelState {
  level: number;
  xp: number;
  strength: number;
  skillPoints: number;
}

/** Add XP; each level gained adds 4% strength and one unspent skill point. */
export function applyXp(m: LevelState, gain: number): LevelState & { levelsGained: number } {
  let { level, xp, strength, skillPoints } = m;
  let levelsGained = 0;
  xp += Math.max(0, Math.round(gain));
  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level++;
    levelsGained++;
    strength = Math.round(strength * (1 + BALANCE.levels.strengthBonusPerLevel));
    skillPoints += BALANCE.levels.skillPointsPerLevel;
  }
  if (level >= BALANCE.levels.max) xp = 0;
  return { level, xp, strength, skillPoints, levelsGained };
}

export function profileLevel(accountXp: number): number {
  return 1 + Math.floor(Math.max(0, accountXp) / BALANCE.profile.xpPerLevel);
}

export function cardFrame(level: number): CardFrame {
  const f = BALANCE.cardFrames;
  return level >= f.cosmic ? 'cosmic' : level >= f.gold ? 'gold' : level >= f.silver ? 'silver' : 'bronze';
}

// ---------- Growing ----------

export function rollRarity(r: number): Rarity {
  let acc = 0;
  for (const rarity of RARITIES) {
    acc += BALANCE.rarity[rarity].chance;
    if (r < acc) return rarity;
  }
  return 'common';
}

/** Roll a variant from r in [0, 1): each tier has its own exact chance. */
export function rollVariant(r: number): Variant {
  let acc = 0;
  for (const v of SPECIAL_VARIANTS) {
    acc += BALANCE.variants[v].chance;
    if (r < acc) return v;
  }
  return 'normal';
}

export function variantMultiplier(v: Variant): number {
  return v === 'normal' ? 1 : BALANCE.variants[v].multiplier;
}

/** Strength shown on the card and used for the wheel: base strength times the variant boost. */
export function power(strength: number, variant: Variant): number {
  return Math.round(strength * variantMultiplier(variant));
}

export interface GrowRoll {
  strength: number;
  rarity: Rarity;
  variant: Variant;
}

export function rollGrow(tier: GrowTier, rng: Rng = Math.random): GrowRoll {
  const t = BALANCE.growTiers[tier];
  const span = t.strengthMax - t.strengthMin + 1;
  const base = t.strengthMin + Math.min(span - 1, Math.floor(rng() * span));
  const rarity = rollRarity(rng());
  return {
    strength: Math.round(base * (1 + BALANCE.rarity[rarity].strengthBonus)),
    rarity,
    variant: rollVariant(rng()),
  };
}

/** Skills the builder must spread for a tier: tier points plus the base of 4 (one per skill). */
export function skillTotalForTier(tier: GrowTier): number {
  return BALANCE.growTiers[tier].skillPoints + BALANCE.skillPointBase;
}

export function isValidSkillSpread(skills: Skills, tier: GrowTier): boolean {
  let sum = 0;
  for (const s of STRATEGIES) {
    const v = skills[s];
    if (!Number.isInteger(v) || v < BALANCE.skills.min || v > BALANCE.skills.max) return false;
    sum += v;
  }
  return sum === skillTotalForTier(tier);
}

/** A random valid spread, for bots. */
export function randomSkillSpread(total: number, rng: Rng = Math.random): Skills {
  const skills: Skills = { attack: 1, defense: 1, tricks: 1, brains: 1 };
  let left = Math.min(total, BALANCE.skills.max * 4) - 4;
  while (left > 0) {
    const open = STRATEGIES.filter(s => skills[s] < BALANCE.skills.max);
    const s = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
    skills[s]++;
    left--;
  }
  return skills;
}

// ---------- Energy ----------

export interface EnergyState {
  energy: number;
  /** ms timestamp the stored energy value was last correct at. */
  updatedAt: number;
}

/** Energy refills one point every refillMinutes up to max. */
export function currentEnergy(stored: EnergyState, now: number): EnergyState {
  const { max, refillMinutes } = BALANCE.energy;
  if (stored.energy >= max) return { energy: max, updatedAt: now };
  const per = refillMinutes * 60_000;
  const gained = Math.max(0, Math.floor((now - stored.updatedAt) / per));
  const energy = Math.min(max, stored.energy + gained);
  return { energy, updatedAt: energy >= max ? now : stored.updatedAt + gained * per };
}

export function msUntilNextEnergy(state: EnergyState, now: number): number {
  if (state.energy >= BALANCE.energy.max) return 0;
  const per = BALANCE.energy.refillMinutes * 60_000;
  return Math.max(0, state.updatedAt + per - now);
}

// ---------- Fight modifiers ----------

/** Strength used for the wheel: variant boost, plus a one-fight strength potion. */
export function fightStrength(strength: number, strengthPotion: boolean, variant: Variant = 'normal'): number {
  const potion = strengthPotion ? 1 + BALANCE.potions.strengthBoost.strengthMultiplier : 1;
  return Math.round(strength * variantMultiplier(variant) * potion);
}

// ---------- Village maths ----------

export function collectionLimit(isMember: boolean): number {
  return isMember ? BALANCE.collection.memberLimit : BALANCE.collection.freeLimit;
}

export function graveyardLimit(isMember: boolean): number {
  return isMember ? BALANCE.graveyard.memberLimit : BALANCE.graveyard.freeLimit;
}

export function dojoSlots(isMember: boolean): number {
  return isMember ? BALANCE.dojo.memberSlots : BALANCE.dojo.freeSlots;
}

export function resurrectCost(strength: number): number {
  return strength * BALANCE.graveyard.resurrectCostPerStrength;
}

export function resurrectedStrength(strength: number): number {
  return Math.max(BALANCE.stakes.minStrength, Math.round(strength * BALANCE.graveyard.resurrectStrengthShare));
}

export function listingFee(price: number): number {
  return Math.max(1, Math.ceil(price * BALANCE.market.listingFee));
}

/** Dojo session result: either +1 skill point to spend or +3% strength. */
export function dojoStrength(strength: number): number {
  return Math.max(strength + 1, Math.round(strength * (1 + BALANCE.dojo.strengthShare)));
}
