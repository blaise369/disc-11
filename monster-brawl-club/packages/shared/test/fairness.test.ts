import { describe, expect, it } from 'vitest';
import { generateSeed, hashSeed, rollFromSeed, spinWinner, verifySeed } from '../src';

describe('seeded spin', () => {
  it('generates 32-byte hex seeds that differ each time', () => {
    const a = generateSeed(), b = generateSeed();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashes with SHA-256', async () => {
    expect(await hashSeed('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('derives a deterministic roll in [0, 1)', async () => {
    const seed = generateSeed();
    const r = await rollFromSeed(seed);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
    expect(await rollFromSeed(seed)).toBe(r);
    expect(() => spinWinner(0.5, r)).not.toThrow();
  });

  it('keeps the roll independent of the published hash', async () => {
    const seed = 'fixed-seed';
    const hash = await hashSeed(seed);
    expect(await rollFromSeed(seed)).not.toBe(await rollFromSeed(hash));
  });

  it('verifies a revealed seed against its commitment', async () => {
    const seed = generateSeed();
    const hash = await hashSeed(seed);
    expect(await verifySeed(seed, hash)).toBe(true);
    expect(await verifySeed(seed, hash.toUpperCase())).toBe(true);
    expect(await verifySeed(seed + '0', hash)).toBe(false);
  });

  it('spreads rolls roughly evenly', async () => {
    let below = 0;
    for (let i = 0; i < 400; i++) if ((await rollFromSeed('s' + i)) < 0.5) below++;
    expect(below).toBeGreaterThan(150);
    expect(below).toBeLessThan(250);
  });
});
