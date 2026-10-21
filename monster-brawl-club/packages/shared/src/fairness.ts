// Provably fair spin. The server publishes hashSeed(seed) before round 1 and the seed
// after the spin; anyone can then check the hash and recompute the roll.
// Uses Web Crypto, which exists in both browsers and Node 20+.

const toHex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

async function sha256(text: string): Promise<Uint8Array> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(buf);
}

/** 32 cryptographically random bytes as hex. Call on the server only. */
export function generateSeed(): string {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

/** The commitment published before round 1. */
export async function hashSeed(seed: string): Promise<string> {
  return toHex(await sha256(seed));
}

/**
 * The spin roll in [0, 1) derived from the seed. It uses a separate "roll:" domain so
 * the published commitment reveals nothing about the roll.
 */
export async function rollFromSeed(seed: string): Promise<number> {
  const h = await sha256('roll:' + seed);
  let n = 0;
  for (let i = 0; i < 6; i++) n = n * 256 + h[i]!;
  return n / 2 ** 48;
}

/** Check a revealed seed against its earlier commitment. */
export async function verifySeed(seed: string, publishedHash: string): Promise<boolean> {
  return (await hashSeed(seed)) === publishedHash.toLowerCase();
}
