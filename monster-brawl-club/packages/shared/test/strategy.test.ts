import { describe, expect, it } from 'vitest';
import { assertSkill, assertSkills, beats, resolveRound, roundShift, STRATEGIES, type Strategy } from '../src';

describe('strategy cycle', () => {
  it.each<[Strategy, Strategy]>([
    ['attack', 'defense'],
    ['defense', 'tricks'],
    ['tricks', 'brains'],
    ['brains', 'attack'],
  ])('%s beats %s, and not the other way round', (a, b) => {
    expect(beats(a, b)).toBe(true);
    expect(beats(b, a)).toBe(false);
  });

  it('treats opposite pairs and mirrors as neutral', () => {
    for (const [a, b] of [['attack', 'tricks'], ['defense', 'brains']] as const) {
      expect(beats(a, b)).toBe(false);
      expect(beats(b, a)).toBe(false);
    }
    for (const s of STRATEGIES) expect(beats(s, s)).toBe(false);
  });

  it('has exactly one winner in every non-neutral pairing', () => {
    let wins = 0;
    for (const a of STRATEGIES) for (const b of STRATEGIES) if (beats(a, b)) wins++;
    expect(wins).toBe(4);
  });
});

describe('roundShift', () => {
  it('is 0.05 base plus 0.01 per point of skill gap', () => {
    expect(roundShift(5, 5)).toBeCloseTo(0.05);
    expect(roundShift(7, 4)).toBeCloseTo(0.08);
  });
  it('ignores a negative gap (winner had the lower skill)', () => {
    expect(roundShift(6, 7)).toBeCloseTo(0.05);
  });
  it('is capped at 0.12', () => {
    expect(roundShift(10, 3)).toBeCloseTo(0.12);
    expect(roundShift(10, 1)).toBeCloseTo(0.12);
  });
});

describe('resolveRound', () => {
  it('lets the cycle decide even when the winner has lower skill', () => {
    expect(resolveRound({ strategy: 'tricks', skill: 6 }, { strategy: 'brains', skill: 7 }))
      .toEqual({ winner: 'A', delta: expect.closeTo(0.05) as number, byCycle: true });
    expect(resolveRound({ strategy: 'brains', skill: 7 }, { strategy: 'tricks', skill: 6 }))
      .toEqual({ winner: 'B', delta: expect.closeTo(0.05) as number, byCycle: true });
  });

  it('uses the higher skill on a neutral pair', () => {
    const r = resolveRound({ strategy: 'attack', skill: 9 }, { strategy: 'tricks', skill: 4 });
    expect(r.winner).toBe('A');
    expect(r.delta).toBeCloseTo(0.1);
    expect(r.byCycle).toBe(false);
    expect(resolveRound({ strategy: 'defense', skill: 2 }, { strategy: 'brains', skill: 3 }).winner).toBe('B');
  });

  it('uses the higher skill on a mirror and ties on equal skill', () => {
    expect(resolveRound({ strategy: 'defense', skill: 8 }, { strategy: 'defense', skill: 5 }).winner).toBe('A');
    expect(resolveRound({ strategy: 'defense', skill: 5 }, { strategy: 'defense', skill: 5 }))
      .toEqual({ winner: 'tie', delta: 0, byCycle: false });
  });

  it('rejects skills outside 1 to 10 or non-integers', () => {
    expect(() => resolveRound({ strategy: 'attack', skill: 0 }, { strategy: 'attack', skill: 5 })).toThrow(RangeError);
    expect(() => resolveRound({ strategy: 'attack', skill: 5 }, { strategy: 'attack', skill: 11 })).toThrow(RangeError);
    expect(() => assertSkill(2.5)).toThrow(RangeError);
    expect(() => assertSkill(Number.NaN)).toThrow(RangeError);
    expect(() => assertSkills({ attack: 1, defense: 10, tricks: 5, brains: 5 })).not.toThrow();
    expect(() => assertSkills({ attack: 1, defense: 10, tricks: 5, brains: 0 })).toThrow(RangeError);
  });
});
