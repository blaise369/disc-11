import { describe, expect, it } from 'vitest';
import { aiPick, STRATEGIES, type Rng, type Skills, type Strategy } from '../src';

const seq = (...xs: number[]): Rng => () => {
  const x = xs.shift();
  if (x === undefined) throw new Error('rng exhausted');
  return x;
};
const skills: Skills = { attack: 2, defense: 8, tricks: 3, brains: 6 };

describe('aiPick', () => {
  it('picks uniformly at random 25% of the time', () => {
    expect(aiPick(skills, seq(0.1, 0))).toBe('attack');
    expect(aiPick(skills, seq(0.1, 0.6))).toBe('tricks');
    expect(aiPick(skills, seq(0.24, 0.99))).toBe('brains');
  });

  it('copes with an rng that returns exactly 1', () => {
    expect(aiPick(skills, seq(0, 1))).toBe('brains');
  });

  it('otherwise picks from the two highest skills, weighted by value', () => {
    // top two: defense 8, brains 6 (total 14)
    expect(aiPick(skills, seq(0.5, 0))).toBe('defense');
    expect(aiPick(skills, seq(0.5, 7.9 / 14))).toBe('defense');
    expect(aiPick(skills, seq(0.5, 8.1 / 14))).toBe('brains');
    expect(aiPick(skills, seq(0.5, 1))).toBe('brains');
  });

  it('breaks skill ties by cycle order', () => {
    expect(aiPick({ attack: 5, defense: 5, tricks: 5, brains: 5 }, seq(0.9, 0.99))).toBe('defense');
  });

  it('roughly follows the intended distribution with a real rng', () => {
    const counts = Object.fromEntries(STRATEGIES.map(s => [s, 0])) as Record<Strategy, number>;
    let s = 12345;
    const lcg: Rng = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const n = 20000;
    for (let i = 0; i < n; i++) counts[aiPick(skills, lcg)]++;
    // expected: random 0.25/4 each, plus 0.75 split 8:6 between defense and brains
    expect(counts.attack / n).toBeCloseTo(0.0625, 1);
    expect(counts.tricks / n).toBeCloseTo(0.0625, 1);
    expect(counts.defense / n).toBeCloseTo(0.0625 + 0.75 * 8 / 14, 1);
    expect(counts.brains / n).toBeCloseTo(0.0625 + 0.75 * 6 / 14, 1);
  });

  it('defaults to Math.random', () => {
    expect(STRATEGIES).toContain(aiPick(skills));
  });
});
