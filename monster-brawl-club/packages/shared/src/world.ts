// The map ladder and daily missions.
import type { Skills } from './strategy';

export interface Region {
  id: number;
  name: string;
  /** Strength band of monsters that belong here. */
  minStrength: number;
  maxStrength: number;
  boss: { name: string; strength: number; skills: Skills };
}

const boss = (name: string, strength: number, a: number, d: number, t: number, b: number) =>
  ({ name, strength, skills: { attack: a, defense: d, tricks: t, brains: b } });

export const REGIONS: readonly Region[] = [
  { id: 1, name: 'Mudflat Meadow', minStrength: 0, maxStrength: 90, boss: boss('Sir Squelch', 85, 4, 3, 3, 4) },
  { id: 2, name: 'Grumble Gully', minStrength: 70, maxStrength: 130, boss: boss('Old Grumbleguts', 125, 5, 4, 3, 4) },
  { id: 3, name: 'Soggy Swamp', minStrength: 110, maxStrength: 170, boss: boss('Bogwump', 165, 4, 5, 5, 4) },
  { id: 4, name: 'Fizzle Forest', minStrength: 150, maxStrength: 210, boss: boss('Twiggy Tremor', 205, 5, 5, 5, 5) },
  { id: 5, name: 'Boulder Bluffs', minStrength: 190, maxStrength: 260, boss: boss('Rockbottom', 255, 6, 7, 4, 5) },
  { id: 6, name: 'Gloom Grotto', minStrength: 240, maxStrength: 320, boss: boss('The Murkling', 315, 5, 6, 7, 6) },
  { id: 7, name: 'Rustbucket Ruins', minStrength: 300, maxStrength: 390, boss: boss('Clanktron 9000', 385, 7, 7, 5, 7) },
  { id: 8, name: 'Frostbite Peaks', minStrength: 370, maxStrength: 470, boss: boss('Brrrzerker', 465, 8, 6, 7, 7) },
  { id: 9, name: 'Magma Maw', minStrength: 450, maxStrength: 560, boss: boss('Scorchbelly', 555, 8, 8, 7, 8) },
  { id: 10, name: 'Thunderdome Summit', minStrength: 540, maxStrength: 100000, boss: boss('King Kabloom', 680, 9, 9, 9, 9) },
];

export function regionById(id: number): Region | undefined {
  return REGIONS.find(r => r.id === id);
}

/** PvP matchmaking prefers players in your region or one either side. */
export function isNearbyRegion(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1;
}

export type MissionMetric = 'fightsPlayed' | 'fightsWon' | 'arcadeGames' | 'dojoSessions' | 'bossWins' | 'skillRoundsWon';

export interface Mission {
  id: string;
  text: string;
  metric: MissionMetric;
  goal: number;
  reward: number;
}

/** Daily missions; progress resets at midnight UTC. Rewards 25 to 100 nuggets. */
export const MISSIONS: readonly Mission[] = [
  { id: 'play3', text: 'Play 3 fights', metric: 'fightsPlayed', goal: 3, reward: 25 },
  { id: 'win2', text: 'Win 2 fights', metric: 'fightsWon', goal: 2, reward: 40 },
  { id: 'rounds5', text: 'Win 5 skill rounds', metric: 'skillRoundsWon', goal: 5, reward: 40 },
  { id: 'arcade', text: 'Play a game in the arcade', metric: 'arcadeGames', goal: 1, reward: 25 },
  { id: 'dojo', text: 'Finish a dojo session', metric: 'dojoSessions', goal: 1, reward: 50 },
  { id: 'boss', text: 'Beat a region boss', metric: 'bossWins', goal: 1, reward: 100 },
];

export function missionById(id: string): Mission | undefined {
  return MISSIONS.find(m => m.id === id);
}
