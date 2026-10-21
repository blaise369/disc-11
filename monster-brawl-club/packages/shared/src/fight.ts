import type { RoundPick, Side } from './strategy';
import { playRounds, spinWinner, startingSplit, type WheelResult } from './wheel';

export interface FightInput {
  strengthA: number;
  strengthB: number;
  /** One entry per skill round, 0 to 3. */
  picks: ReadonlyArray<{ a: RoundPick; b: RoundPick }>;
  /** The spin roll in [0, 1), e.g. from rollFromSeed. */
  roll: number;
}

export interface FightResult extends WheelResult {
  roll: number;
  winner: Side;
  roundsWonA: number;
  roundsWonB: number;
}

/** Resolve a whole fight: starting split, skill rounds, spin. */
export function resolveFight({ strengthA, strengthB, picks, roll }: FightInput): FightResult {
  const wheel = playRounds(startingSplit(strengthA, strengthB), picks);
  return {
    ...wheel,
    roll,
    winner: spinWinner(wheel.pFinal, roll),
    roundsWonA: wheel.rounds.filter(r => r.winner === 'A').length,
    roundsWonB: wheel.rounds.filter(r => r.winner === 'B').length,
  };
}
