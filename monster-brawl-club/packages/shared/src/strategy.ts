import { BALANCE } from './balance';

export const STRATEGIES = ['attack', 'defense', 'tricks', 'brains'] as const;
export type Strategy = (typeof STRATEGIES)[number];

/** A monster's four strategy skills, each from BALANCE.skills.min to max. */
export type Skills = Record<Strategy, number>;

export type Side = 'A' | 'B';
export type RoundWinner = Side | 'tie';

/**
 * The cycle Attack -> Defense -> Tricks -> Brains -> Attack: each strategy beats the
 * one after it. Opposite pairs (Attack/Tricks, Defense/Brains) and mirrors are neutral.
 */
export function beats(a: Strategy, b: Strategy): boolean {
  const i = STRATEGIES.indexOf(a);
  return STRATEGIES[(i + 1) % STRATEGIES.length] === b;
}

export function assertSkill(value: number): void {
  if (!Number.isInteger(value) || value < BALANCE.skills.min || value > BALANCE.skills.max) {
    throw new RangeError(`Skill must be an integer from ${BALANCE.skills.min} to ${BALANCE.skills.max}, got ${value}`);
  }
}

export function assertSkills(skills: Skills): void {
  for (const s of STRATEGIES) assertSkill(skills[s]);
}

/** Wheel share gained by the round winner: grows with the skill gap, capped. */
export function roundShift(kWin: number, kLose: number): number {
  const f = BALANCE.fight;
  return Math.min(f.roundShiftBase + f.roundShiftPerSkillGap * Math.max(0, kWin - kLose), f.roundShiftMax);
}

export interface RoundPick {
  strategy: Strategy;
  /** The picking monster's skill value for that strategy. */
  skill: number;
}

export interface RoundResult {
  winner: RoundWinner;
  /** Share moved toward the winner (always >= 0; 0 on a tie). */
  delta: number;
  /** True if the cycle decided it; false if decided by skill value or tied. */
  byCycle: boolean;
}

export function resolveRound(a: RoundPick, b: RoundPick): RoundResult {
  assertSkill(a.skill);
  assertSkill(b.skill);
  if (beats(a.strategy, b.strategy)) return { winner: 'A', delta: roundShift(a.skill, b.skill), byCycle: true };
  if (beats(b.strategy, a.strategy)) return { winner: 'B', delta: roundShift(b.skill, a.skill), byCycle: true };
  // Neutral pair or mirror: the higher skill in the chosen strategy wins.
  if (a.skill > b.skill) return { winner: 'A', delta: roundShift(a.skill, b.skill), byCycle: false };
  if (b.skill > a.skill) return { winner: 'B', delta: roundShift(b.skill, a.skill), byCycle: false };
  return { winner: 'tie', delta: 0, byCycle: false };
}
