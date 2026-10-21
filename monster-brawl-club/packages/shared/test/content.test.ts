import { describe, expect, it } from 'vitest';
import {
  CHAT_PHRASES, generateUsername, generateUsernameChoices, isGeneratedUsername, isMonsterNameAllowed,
  isNearbyRegion, isValidParts, MISSIONS, missionById, normaliseForFilter, PALETTE, PART_SLOT_NAMES, PART_SLOTS,
  phraseText, randomLook, regionById, REGIONS, SPECIES, startingSplitWithLuck, resolveFight, type MonsterParts, type Rng,
} from '../src';

const seq = (...xs: number[]): Rng => () => xs.shift() ?? 0;
const free: MonsterParts = { species: 'furball', eyes: 'googly', mouth: 'grin', head: 'none', arms: 'stubby', legs: 'stumpy', pattern: 'plain' };

describe('parts', () => {
  it('has about 60 parts across 12 species', () => {
    const total = SPECIES.length + PART_SLOT_NAMES.reduce((n, s) => n + PART_SLOTS[s].length, 0);
    expect(SPECIES).toHaveLength(12);
    expect(total).toBe(58);
    expect(PALETTE).toHaveLength(16);
  });
  it('validates parts, member-only parts and palette', () => {
    expect(isValidParts(free, { body: 0, accent: 15 }, false)).toBe(true);
    expect(isValidParts({ ...free, species: 'drake' }, { body: 0, accent: 1 }, false)).toBe(false);
    expect(isValidParts({ ...free, species: 'drake' }, { body: 0, accent: 1 }, true)).toBe(true);
    expect(isValidParts({ ...free, eyes: 'starry' }, { body: 0, accent: 1 }, false)).toBe(false);
    expect(isValidParts({ ...free, legs: 'nope' }, { body: 0, accent: 1 }, true)).toBe(false);
    expect(isValidParts({ ...free, species: 'nope' }, { body: 0, accent: 1 }, true)).toBe(false);
    expect(isValidParts(free, { body: 16, accent: 1 }, false)).toBe(false);
    expect(isValidParts(free, { body: 1, accent: 1.5 }, false)).toBe(false);
  });
  it('generates random valid looks', () => {
    const a = randomLook(seq(0, 0, 0, 0, 0, 0, 0, 0, 0));
    expect(a.parts).toEqual(free);
    expect(isValidParts(randomLook(seq(1, 1, 1, 1, 1, 1, 1, 1, 1)).parts, { body: 0, accent: 0 }, false)).toBe(true);
    expect(randomLook(seq(1, 1, 1, 1, 1, 1, 1, 1, 1), true).parts.species).toBe('cosmo');
    const b = randomLook();
    expect(isValidParts(b.parts, b.palette, false)).toBe(true);
  });
});

describe('usernames', () => {
  it('generates word-pair usernames', () => {
    expect(generateUsername(seq(0, 0, 0))).toBe('BraveBadger10');
    expect(generateUsername(seq(1, 1, 1))).toBe('ZippyYeti99');
    expect(isGeneratedUsername(generateUsername())).toBe(true);
    expect(isGeneratedUsername('BraveBadger1')).toBe(false);
    expect(isGeneratedUsername('NastyBadger10')).toBe(false);
    expect(isGeneratedUsername('hello')).toBe(false);
  });
  it('generates distinct choices', () => {
    const c = generateUsernameChoices(5);
    expect(new Set(c).size).toBe(5);
  });
});

describe('monster name filter', () => {
  it('allows ordinary names', () => {
    for (const n of ['Grubzilla', 'Mr Wiggles', 'Grape Ape', 'Shelly', 'Scrappy', 'Skillz', 'Hello', 'Rex 2']) expect(isMonsterNameAllowed(n)).toBe(true);
  });
  it('blocks rude words, including spaced, repeated and number-swapped ones', () => {
    for (const n of ['fuuuck', 'Sh1t head', 'b i t c h', 'Kill', 'big butt', 'Hell']) expect(isMonsterNameAllowed(n)).toBe(false);
  });
  it('enforces length and characters', () => {
    expect(isMonsterNameAllowed('A')).toBe(false);
    expect(isMonsterNameAllowed('A'.repeat(17))).toBe(false);
    expect(isMonsterNameAllowed('Bob!')).toBe(false);
  });
  it('normalises lookalike characters', () => {
    expect(normaliseForFilter('$h1t @ss')).toBe('shitas');
  });
});

describe('chat, map and missions', () => {
  it('only knows fixed phrases', () => {
    expect(CHAT_PHRASES.length).toBeGreaterThan(5);
    expect(phraseText('gf')).toBe('Good fight!');
    expect(phraseText('anything else')).toBeUndefined();
  });
  it('has 10 regions with rising bosses', () => {
    expect(REGIONS).toHaveLength(10);
    for (let i = 1; i < REGIONS.length; i++) expect(REGIONS[i]!.boss.strength).toBeGreaterThan(REGIONS[i - 1]!.boss.strength);
    expect(regionById(3)?.name).toBe('Soggy Swamp');
    expect(regionById(11)).toBeUndefined();
    expect(isNearbyRegion(3, 4)).toBe(true);
    expect(isNearbyRegion(3, 5)).toBe(false);
  });
  it('has missions worth 25 to 100', () => {
    for (const m of MISSIONS) {
      expect(m.reward).toBeGreaterThanOrEqual(25);
      expect(m.reward).toBeLessThanOrEqual(100);
    }
    expect(missionById('boss')?.reward).toBe(100);
    expect(missionById('nope')).toBeUndefined();
  });
});

describe('lucky charm', () => {
  it('shifts the starting split and stays clamped', () => {
    expect(startingSplitWithLuck(100, 100, 0.03, 0)).toBeCloseTo(0.53);
    expect(startingSplitWithLuck(100, 100, 0, 0.03)).toBeCloseTo(0.47);
    expect(startingSplitWithLuck(100, 100)).toBeCloseTo(0.5);
    expect(startingSplitWithLuck(999, 1, 0.03, 0)).toBeCloseTo(0.9);
    expect(resolveFight({ strengthA: 100, strengthB: 100, picks: [], roll: 0.52, luckA: 0.03 }).winner).toBe('A');
  });
});
