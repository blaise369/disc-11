import { BALANCE } from './balance';
import { resolveRound, type RoundPick, type RoundResult, type Side } from './strategy';

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function assertStrength(s: number): void {
  if (!Number.isFinite(s) || s < 0) throw new RangeError(`Strength must be a non-negative number, got ${s}`);
}

/** Monster A's starting wheel share: its share of total strength, clamped. */
export function startingSplit(strengthA: number, strengthB: number): number {
  assertStrength(strengthA);
  assertStrength(strengthB);
  const total = strengthA + strengthB;
  const raw = total === 0 ? 0.5 : strengthA / total;
  return clamp(raw, BALANCE.fight.startSplitMin, BALANCE.fight.startSplitMax);
}

/**
 * Starting split with one-fight Lucky Charm bonuses (wheel share added for each side),
 * still clamped to the starting range.
 */
export function startingSplitWithLuck(strengthA: number, strengthB: number, luckA = 0, luckB = 0): number {
  return clamp(startingSplit(strengthA, strengthB) + luckA - luckB, BALANCE.fight.startSplitMin, BALANCE.fight.startSplitMax);
}

export function assertRoundCount(n: number): void {
  const f = BALANCE.fight;
  if (!Number.isInteger(n) || n < f.minSkillRounds || n > f.maxSkillRounds) {
    throw new RangeError(`Skill rounds must be an integer from ${f.minSkillRounds} to ${f.maxSkillRounds}, got ${n}`);
  }
}

export interface PlayedRound extends RoundResult {
  roundNo: number;
  a: RoundPick;
  b: RoundPick;
  /** A's wheel share after this round (before the final clamp). */
  shareA: number;
}

export interface WheelResult {
  pStart: number;
  pFinal: number;
  rounds: PlayedRound[];
}

/**
 * Play the skill rounds and move the wheel. The running total shift is capped at
 * BALANCE.fight.totalShiftCap either way (so the wheel never shows more movement than
 * the cap mid-fight), then the final share is clamped.
 */
export function playRounds(pStart: number, picks: ReadonlyArray<{ a: RoundPick; b: RoundPick }>): WheelResult {
  assertRoundCount(picks.length);
  const { totalShiftCap: cap, finalSplitMin, finalSplitMax } = BALANCE.fight;
  let shift = 0;
  const rounds = picks.map(({ a, b }, i): PlayedRound => {
    const r = resolveRound(a, b);
    const signed = r.winner === 'A' ? r.delta : r.winner === 'B' ? -r.delta : 0;
    shift = clamp(shift + signed, -cap, cap);
    return { ...r, roundNo: i + 1, a, b, shareA: pStart + shift };
  });
  return { pStart, pFinal: clamp(pStart + shift, finalSplitMin, finalSplitMax), rounds };
}

/** The spin: draw r uniformly from [0, 1); A wins if r < pFinal. */
export function spinWinner(pFinal: number, r: number): Side {
  if (!(r >= 0 && r < 1)) throw new RangeError(`Spin roll must be in [0, 1), got ${r}`);
  return r < pFinal ? 'A' : 'B';
}
