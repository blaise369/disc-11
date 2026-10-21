import { describe, expect, it } from 'vitest';
import { resolveFight } from '../src';

describe('worked example from the spec', () => {
  // A has strength 120 and B has 180, so A starts at 0.40.
  const picks = [
    { a: { strategy: 'brains', skill: 7 }, b: { strategy: 'attack', skill: 4 } }, // Brains beats Attack, A +0.08
    { a: { strategy: 'defense', skill: 5 }, b: { strategy: 'defense', skill: 5 } }, // mirror, equal skill: tie
    { a: { strategy: 'brains', skill: 7 }, b: { strategy: 'tricks', skill: 6 } }, // Tricks beats Brains, B +0.05
  ] as const;

  it('matches the table round by round and ends at 0.43', () => {
    const r = resolveFight({ strengthA: 120, strengthB: 180, picks, roll: 0.2 });
    expect(r.pStart).toBeCloseTo(0.4);
    expect(r.rounds.map(x => x.winner)).toEqual(['A', 'tie', 'B']);
    expect(r.rounds.map(x => x.delta)).toEqual([expect.closeTo(0.08), 0, expect.closeTo(0.05)]);
    expect(r.rounds.map(x => x.shareA)).toEqual([expect.closeTo(0.48), expect.closeTo(0.48), expect.closeTo(0.43)]);
    expect(r.pFinal).toBeCloseTo(0.43);
    expect(r.roundsWonA).toBe(1);
    expect(r.roundsWonB).toBe(1);
  });

  it('lets the spin decide: A wins below 0.43, B at or above', () => {
    expect(resolveFight({ strengthA: 120, strengthB: 180, picks, roll: 0.42 }).winner).toBe('A');
    expect(resolveFight({ strengthA: 120, strengthB: 180, picks, roll: 0.44 }).winner).toBe('B');
  });
});

describe('resolveFight', () => {
  it('works with no skill rounds', () => {
    const r = resolveFight({ strengthA: 300, strengthB: 100, picks: [], roll: 0.8 });
    expect(r.pFinal).toBeCloseTo(0.75);
    expect(r.winner).toBe('B');
    expect(r.roundsWonA + r.roundsWonB).toBe(0);
  });

  it('gives an underdog a real chance (never below 5%)', () => {
    const big = { a: { strategy: 'defense', skill: 1 }, b: { strategy: 'attack', skill: 10 } } as const;
    const r = resolveFight({ strengthA: 1, strengthB: 10_000, picks: [big, big, big], roll: 0.04 });
    expect(r.pFinal).toBeCloseTo(0.05);
    expect(r.winner).toBe('A');
  });
});
