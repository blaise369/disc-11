import { describe, expect, it } from 'vitest';
import {
  applyXp, BALANCE, cardFrame, collectionLimit, currentEnergy, dojoSlots, dojoStrength, fightStrength,
  graveyardLimit, isValidSkillSpread, listingFee, msUntilNextEnergy, profileLevel, randomSkillSpread,
  resurrectCost, resurrectedStrength, rollGrow, rollRarity, skillTotalForTier, xpToNextLevel, type Rng,
} from '../src';

const seq = (...xs: number[]): Rng => () => xs.shift() ?? 0;
const MIN = 60_000;

describe('levels', () => {
  it('needs 40 XP for level 2, then 20 more per level', () => {
    expect(xpToNextLevel(1)).toBe(40);
    expect(xpToNextLevel(2)).toBe(60);
    expect(xpToNextLevel(20)).toBe(Number.POSITIVE_INFINITY);
  });

  it('adds 4% strength and a skill point per level', () => {
    const r = applyXp({ level: 1, xp: 30, strength: 100, skillPoints: 0 }, 30);
    expect(r).toEqual({ level: 2, xp: 20, strength: 104, skillPoints: 1, levelsGained: 1 });
  });

  it('can gain several levels at once and ignores negative XP', () => {
    const r = applyXp({ level: 1, xp: 0, strength: 100, skillPoints: 0 }, 100);
    expect(r.level).toBe(3);
    expect(r.levelsGained).toBe(2);
    expect(r.strength).toBe(108);
    expect(applyXp({ level: 3, xp: 5, strength: 50, skillPoints: 1 }, -10)).toMatchObject({ level: 3, xp: 5 });
  });

  it('stops at level 20 with XP zeroed', () => {
    const r = applyXp({ level: 19, xp: 0, strength: 100, skillPoints: 0 }, 100_000);
    expect(r.level).toBe(20);
    expect(r.xp).toBe(0);
  });

  it('computes profile level and card frames', () => {
    expect(profileLevel(0)).toBe(1);
    expect(profileLevel(-5)).toBe(1);
    expect(profileLevel(299)).toBe(2);
    expect(profileLevel(300)).toBe(3);
    expect([1, 4, 5, 9, 10, 14, 15, 20].map(cardFrame)).toEqual(['bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'cosmic', 'cosmic']);
  });
});

describe('growing', () => {
  it('rolls rarity 70 / 22 / 7 / 1 percent', () => {
    expect(rollRarity(0)).toBe('common');
    expect(rollRarity(0.6999)).toBe('common');
    expect(rollRarity(0.7)).toBe('rare');
    expect(rollRarity(0.9199)).toBe('rare');
    expect(rollRarity(0.92)).toBe('epic');
    expect(rollRarity(0.99)).toBe('legendary');
    expect(rollRarity(0.99999)).toBe('legendary');
    expect(rollRarity(1)).toBe('common');
  });

  it('rolls strength inside the tier range, boosted by rarity', () => {
    expect(rollGrow('standard', seq(0, 0, 0.5))).toEqual({ strength: 40, rarity: 'common', sheen: false });
    expect(rollGrow('standard', seq(1, 0, 0.5)).strength).toBe(80);
    expect(rollGrow('super', seq(0, 0.995, 0))).toEqual({ strength: 120, rarity: 'legendary', sheen: true });
    expect(rollGrow('xtreme', seq(0, 0.8, 1)).strength).toBe(165);
    const r = rollGrow('standard');
    expect(r.strength).toBeGreaterThanOrEqual(40);
    expect(r.strength).toBeLessThanOrEqual(120);
  });

  it('checks skill spreads add up to tier points + 4 with each skill 1 to 10', () => {
    expect(skillTotalForTier('standard')).toBe(12);
    expect(skillTotalForTier('xtreme')).toBe(20);
    expect(isValidSkillSpread({ attack: 3, defense: 3, tricks: 3, brains: 3 }, 'standard')).toBe(true);
    expect(isValidSkillSpread({ attack: 3, defense: 3, tricks: 3, brains: 4 }, 'standard')).toBe(false);
    expect(isValidSkillSpread({ attack: 0, defense: 4, tricks: 4, brains: 4 }, 'standard')).toBe(false);
    expect(isValidSkillSpread({ attack: 11, defense: 3, tricks: 3, brains: 3 }, 'xtreme')).toBe(false);
    expect(isValidSkillSpread({ attack: 2.5, defense: 3.5, tricks: 3, brains: 3 }, 'standard')).toBe(false);
  });

  it('makes random valid spreads, capped at 10 per skill', () => {
    const s = randomSkillSpread(12, seq(0, 0.3, 0.6, 0.9, 0, 0, 0, 0));
    expect(isValidSkillSpread(s, 'standard')).toBe(true);
    expect(randomSkillSpread(50, seq(1))).toEqual({ attack: 10, defense: 10, tricks: 10, brains: 10 });
    expect(Object.values(randomSkillSpread(16)).reduce((a, b) => a + b)).toBe(16);
  });
});

describe('energy', () => {
  it('refills one point every 20 minutes up to 10', () => {
    expect(currentEnergy({ energy: 3, updatedAt: 0 }, 19 * MIN)).toEqual({ energy: 3, updatedAt: 0 });
    expect(currentEnergy({ energy: 3, updatedAt: 0 }, 45 * MIN)).toEqual({ energy: 5, updatedAt: 40 * MIN });
    expect(currentEnergy({ energy: 9, updatedAt: 0 }, 500 * MIN)).toEqual({ energy: 10, updatedAt: 500 * MIN });
    expect(currentEnergy({ energy: 10, updatedAt: 0 }, 7)).toEqual({ energy: 10, updatedAt: 7 });
    expect(currentEnergy({ energy: 2, updatedAt: 100 }, 50)).toEqual({ energy: 2, updatedAt: 100 });
  });
  it('reports time until the next point', () => {
    expect(msUntilNextEnergy({ energy: 4, updatedAt: 0 }, 5 * MIN)).toBe(15 * MIN);
    expect(msUntilNextEnergy({ energy: 10, updatedAt: 0 }, 5 * MIN)).toBe(0);
    expect(msUntilNextEnergy({ energy: 4, updatedAt: 0 }, 25 * MIN)).toBe(0);
  });
});

describe('village maths', () => {
  it('applies the strength potion', () => {
    expect(fightStrength(100, false)).toBe(100);
    expect(fightStrength(100, true)).toBe(110);
  });
  it('has member limits', () => {
    expect([collectionLimit(false), collectionLimit(true)]).toEqual([12, 40]);
    expect([graveyardLimit(false), graveyardLimit(true)]).toEqual([5, 15]);
    expect([dojoSlots(false), dojoSlots(true)]).toEqual([1, 2]);
  });
  it('prices resurrection at 2 per strength and returns half strength', () => {
    expect(resurrectCost(80)).toBe(160);
    expect(resurrectedStrength(80)).toBe(40);
    expect(resurrectedStrength(1)).toBe(BALANCE.stakes.minStrength);
  });
  it('charges a 5% market listing fee, at least 1', () => {
    expect(listingFee(200)).toBe(10);
    expect(listingFee(10)).toBe(1);
    expect(listingFee(101)).toBe(6);
  });
  it('dojo strength adds 3%, at least 1', () => {
    expect(dojoStrength(100)).toBe(103);
    expect(dojoStrength(10)).toBe(11);
  });
});
