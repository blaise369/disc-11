import { BALANCE } from './balance';

export const STAKES = ['bite', 'collect', 'eat'] as const;
export type Stake = (typeof STAKES)[number];

/**
 * Bite needs both players to agree; Collect and Eat are chosen alone and can be mixed.
 * So a pairing is valid when both pick Bite, or neither does.
 */
export function stakesAreValid(a: Stake, b: Stake): boolean {
  return (a === 'bite') === (b === 'bite');
}

export interface StakeInput {
  /** The winner's own stake decides what happens. */
  winnerStake: Stake;
  winnerStrength: number;
  loserStrength: number;
  /** Winner's collection is at its limit (Collect then auto-sells). */
  winnerCollectionFull: boolean;
  /** Loser's graveyard is at its limit (Eat then downgrades to Bite). */
  loserGraveyardFull: boolean;
}

export interface StakeOutcome {
  /** The stake actually applied; Eat into a full graveyard becomes Bite. */
  applied: Stake;
  downgraded: boolean;
  /** What happens to the losing monster. */
  loserMonster: 'stays' | 'transferred' | 'sold' | 'graveyard';
  winnerStrength: number;
  /** Loser's strength afterwards (a collected or eaten monster keeps its strength). */
  loserStrength: number;
  /** Nuggets paid to the winner (Collect into a full collection). */
  nuggetsToWinner: number;
}

function bite(winner: number, loser: number, downgraded: boolean): StakeOutcome {
  const { biteShare, minStrength } = BALANCE.stakes;
  const taken = Math.max(0, Math.min(Math.round(loser * biteShare), loser - minStrength));
  return {
    applied: 'bite', downgraded, loserMonster: 'stays',
    winnerStrength: winner + taken, loserStrength: loser - taken, nuggetsToWinner: 0,
  };
}

export function resolveStake(input: StakeInput): StakeOutcome {
  const { winnerStake, winnerStrength: w, loserStrength: l } = input;
  if (winnerStake === 'bite') return bite(w, l, false);
  if (winnerStake === 'collect') {
    return input.winnerCollectionFull
      ? { applied: 'collect', downgraded: false, loserMonster: 'sold', winnerStrength: w, loserStrength: l, nuggetsToWinner: l }
      : { applied: 'collect', downgraded: false, loserMonster: 'transferred', winnerStrength: w, loserStrength: l, nuggetsToWinner: 0 };
  }
  if (input.loserGraveyardFull) return bite(w, l, true);
  return {
    applied: 'eat', downgraded: false, loserMonster: 'graveyard',
    winnerStrength: w + Math.round(l * BALANCE.stakes.eatShare), loserStrength: l, nuggetsToWinner: 0,
  };
}

export interface RewardInput {
  won: boolean;
  /** Skill rounds this player won (ties don't count). */
  skillRoundsWon: number;
  /** Practice fights against bots: no stake, reduced XP. */
  practice: boolean;
}

export function fightRewards({ won, skillRoundsWon, practice }: RewardInput): { xp: number; nuggets: number } {
  const r = BALANCE.rewards;
  const baseXp = won ? r.xpWin : r.xpLoss;
  return {
    xp: Math.round(practice ? baseXp * r.practiceXpMultiplier : baseXp),
    nuggets: won ? r.nuggetsWin + r.nuggetsPerSkillRoundWon * skillRoundsWon : r.nuggetsLoss,
  };
}
