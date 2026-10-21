// Types shared by the REST API, the Socket.IO events and the web client. Types only.
import type { MonsterPalette, MonsterParts } from './parts';
import type { CardFrame, GrowTier, Rarity } from './progression';
import type { Stake, StakeOutcome } from './stakes';
import type { Side, Skills, Strategy } from './strategy';

export type Role = 'child' | 'parent' | 'bot';
export type MonsterStatus = 'alive' | 'graveyard' | 'incinerated';
export type FightKind = 'pvp' | 'practice' | 'boss';
export type FightStake = Stake | 'none';
export type FightStateName =
  | 'PENDING' | 'ACCEPTED' | 'ROUND_PICKING' | 'ROUND_REVEAL' | 'SPINNING'
  | 'RESOLVED' | 'DECLINED' | 'EXPIRED' | 'ABANDONED';
export type PotionType = 'strengthBoost' | 'luckyCharm' | 'skillPlusOne';

export interface MonsterCard {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  species: string;
  parts: MonsterParts;
  palette: MonsterPalette;
  strength: number;
  skills: Skills;
  skillPoints: number;
  level: number;
  xp: number;
  xpToNext: number | null;
  rarity: Rarity;
  sheen: boolean;
  status: MonsterStatus;
  wins: number;
  losses: number;
  frame: CardFrame;
  /** ISO time it finishes growing; null when grown. */
  growingUntil: string | null;
  locked: boolean;
  dojoUntil: string | null;
  dojoReward: 'skill' | 'strength' | null;
  listed: boolean;
  potions: { type: PotionType; fightsLeft: number }[];
  isBot: boolean;
}

export interface Me {
  id: string;
  username: string;
  role: Role;
  nuggets: number;
  energy: number;
  energyMax: number;
  nextEnergyMs: number;
  profileXp: number;
  profileLevel: number;
  isMember: boolean;
  mapRegion: number;
  unlocks: { trader: boolean; dojo: boolean };
  allowTrades: boolean;
  allowRiskyStakes: boolean;
  dailyRewardAvailable: boolean;
  standardGrowAvailable: boolean;
  playSecondsToday: number;
  dailyPlayCapMinutes: number | null;
  collectionLimit: number;
  graveyardLimit: number;
}

export interface PlayerSummary {
  id: string;
  username: string;
  mapRegion: number;
  profileLevel: number;
  online: boolean;
  allowRiskyStakes: boolean;
}

export interface PlayerProfile extends PlayerSummary {
  monsters: MonsterCard[];
  wins: number;
  losses: number;
  isFriend: boolean;
  friendRequest: 'none' | 'sent' | 'received';
  blockedByMe: boolean;
}

export interface GrowRequest {
  name: string;
  tier: GrowTier;
  parts: MonsterParts;
  palette: MonsterPalette;
  skills: Skills;
}

// ---------- Fights ----------

export interface FightSideView {
  userId: string;
  username: string;
  isBot: boolean;
  monster: MonsterCard;
  stake: FightStake | null;
  /** Strength used for the wheel (includes a strength potion). */
  fightStrength: number;
  luck: number;
}

export interface RoundView {
  roundNo: number;
  pickA: Strategy;
  pickB: Strategy;
  winner: Side | 'tie';
  delta: number;
  shareA: number;
}

export interface SideRewards {
  xp: number;
  nuggets: number;
  levelsGained: number;
}

export interface FightResultView {
  winnerSide: Side;
  abandonedBy: Side | null;
  stake: (StakeOutcome & { winnerStake: FightStake }) | null;
  rewards: Record<Side, SideRewards | null>;
  bossBeaten: number | null;
}

export interface FightView {
  id: string;
  kind: FightKind;
  state: FightStateName;
  roundsPlanned: number;
  a: FightSideView;
  b: FightSideView;
  pStart: number | null;
  shareA: number | null;
  seedHash: string | null;
  rounds: RoundView[];
  /** 1-based round being picked, or null. */
  currentRound: number | null;
  /** ms epoch the current pick or challenge closes. */
  deadline: number | null;
  picked: Record<Side, boolean>;
  spin: { roll: number; pFinal: number; seed: string; winner: Side } | null;
  result: FightResultView | null;
  createdAt: string;
}

export interface ChallengeRequest {
  defenderId: string;
  monsterAId: string;
  monsterBId: string;
  stake: Stake;
  rounds: number;
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ServerToClientEvents {
  'challenge:incoming': (fight: FightView) => void;
  'challenge:update': (u: { fightId: string; state: FightStateName }) => void;
  'fight:state': (fight: FightView) => void;
  'chat:phrase': (m: { fightId: string; side: Side; text: string }) => void;
  'me:update': () => void;
  'playtime:over': () => void;
}

export interface ClientToServerEvents {
  'challenge:send': (req: ChallengeRequest, ack: Ack<{ fightId: string }>) => void;
  'challenge:respond': (req: { fightId: string; accept: boolean; stake?: Stake }, ack: Ack) => void;
  'challenge:cancel': (req: { fightId: string }, ack: Ack) => void;
  'practice:start': (req: { monsterId: string; rounds: number; boss?: boolean }, ack: Ack<{ fightId: string }>) => void;
  'fight:join': (req: { fightId: string }, ack: Ack<{ fight: FightView }>) => void;
  'round:pick': (req: { fightId: string; strategy: Strategy }, ack: Ack) => void;
  'fight:leave': (req: { fightId: string }, ack: Ack) => void;
  'chat:phrase': (req: { fightId: string; phraseId: string }, ack: Ack) => void;
}
