import { describe, expect, it } from 'vitest';
import { assertRoundCount, clamp, playRounds, spinWinner, startingSplit, type RoundPick } from '../src';

const pick = (strategy: RoundPick['strategy'], skill: number): RoundPick => ({ strategy, skill });

describe('startingSplit', () => {
  it("is A's share of total strength", () => {
    expect(startingSplit(120, 180)).toBeCloseTo(0.4);
    expect(startingSplit(100, 100)).toBeCloseTo(0.5);
  });
  it('is clamped to 0.10 to 0.90 so nothing is certain', () => {
    expect(startingSplit(1, 999)).toBeCloseTo(0.1);
    expect(startingSplit(999, 1)).toBeCloseTo(0.9);
    expect(startingSplit(0, 50)).toBeCloseTo(0.1);
  });
  it('is even when both strengths are zero', () => {
    expect(startingSplit(0, 0)).toBe(0.5);
  });
  it('rejects negative or non-finite strengths', () => {
    expect(() => startingSplit(-1, 10)).toThrow(RangeError);
    expect(() => startingSplit(10, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => startingSplit(Number.NaN, 10)).toThrow(RangeError);
  });
});

describe('clamp', () => {
  it('bounds values', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.3, 0, 1)).toBe(0.3);
  });
});

describe('playRounds', () => {
  it('allows 0 rounds (straight to the spin)', () => {
    const r = playRounds(0.4, []);
    expect(r.rounds).toEqual([]);
    expect(r.pFinal).toBeCloseTo(0.4);
  });

  it('rejects more than 3 rounds', () => {
    const p = { a: pick('attack', 5), b: pick('attack', 5) };
    expect(() => playRounds(0.5, [p, p, p, p])).toThrow(RangeError);
    expect(() => assertRoundCount(-1)).toThrow(RangeError);
    expect(() => assertRoundCount(1.5)).toThrow(RangeError);
  });

  it('records the running share after each round', () => {
    const r = playRounds(0.5, [
      { a: pick('attack', 5), b: pick('defense', 5) },
      { a: pick('defense', 5), b: pick('attack', 5) },
    ]);
    expect(r.rounds.map(x => x.roundNo)).toEqual([1, 2]);
    expect(r.rounds[0]!.shareA).toBeCloseTo(0.55);
    expect(r.rounds[1]!.shareA).toBeCloseTo(0.5);
  });

  it('caps total movement at 0.30 either way', () => {
    const big = { a: pick('attack', 10), b: pick('defense', 1) }; // A +0.12 each
    const r = playRounds(0.5, [big, big, big]);
    expect(r.rounds.map(x => x.shareA)).toEqual([expect.closeTo(0.62), expect.closeTo(0.74), expect.closeTo(0.8)]);
    expect(r.pFinal).toBeCloseTo(0.8);

    const bigB = { a: pick('defense', 1), b: pick('attack', 10) };
    expect(playRounds(0.5, [bigB, bigB, bigB]).pFinal).toBeCloseTo(0.2);
  });

  it('clamps the final share to 0.05 to 0.95', () => {
    const big = { a: pick('attack', 10), b: pick('defense', 1) };
    expect(playRounds(0.9, [big, big, big]).pFinal).toBeCloseTo(0.95);
    const bigB = { a: pick('defense', 1), b: pick('attack', 10) };
    expect(playRounds(0.1, [bigB, bigB, bigB]).pFinal).toBeCloseTo(0.05);
  });
});

describe('spinWinner', () => {
  it('gives A the win when r < pFinal', () => {
    expect(spinWinner(0.43, 0)).toBe('A');
    expect(spinWinner(0.43, 0.4299)).toBe('A');
    expect(spinWinner(0.43, 0.43)).toBe('B');
    expect(spinWinner(0.43, 0.9999)).toBe('B');
  });
  it('rejects rolls outside [0, 1)', () => {
    expect(() => spinWinner(0.5, 1)).toThrow(RangeError);
    expect(() => spinWinner(0.5, -0.01)).toThrow(RangeError);
    expect(() => spinWinner(0.5, Number.NaN)).toThrow(RangeError);
  });
});
