import { BALANCE } from './balance';
import { STRATEGIES, type Skills, type Strategy } from './strategy';

/** A source of uniform numbers in [0, 1). Injectable so picks are testable. */
export type Rng = () => number;

const pickIndex = (rng: Rng, n: number): number => Math.min(n - 1, Math.floor(rng() * n));

/**
 * Bot strategy pick: usually weighted toward its highest skills (by skill value), with a
 * flat random pick some of the time so players can't exploit it.
 */
export function aiPick(skills: Skills, rng: Rng = Math.random): Strategy {
  const { randomPickChance, favouredSkillCount } = BALANCE.ai;
  if (rng() < randomPickChance) return STRATEGIES[pickIndex(rng, STRATEGIES.length)]!;
  // Stable sort keeps the cycle order on equal skills, so picks are deterministic per rng.
  const top = [...STRATEGIES].sort((x, y) => skills[y] - skills[x]).slice(0, favouredSkillCount);
  let t = rng() * top.reduce((sum, s) => sum + skills[s], 0);
  for (const s of top) {
    t -= skills[s];
    if (t < 0) return s;
  }
  return top[top.length - 1]!;
}
