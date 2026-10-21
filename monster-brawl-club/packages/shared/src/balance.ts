// Every tunable number in the game lives here. Change balance in this file only.
// Values marked "spec" are copied from the build spec; tweak freely.

export const BALANCE = {
  fight: {
    /** Skill rounds a challenger may plan (spec: 0 to 3). */
    minSkillRounds: 0,
    maxSkillRounds: 3,
    /** Clamp on A's starting wheel share, so nothing is ever certain. */
    startSplitMin: 0.1,
    startSplitMax: 0.9,
    /** Round shift: min(base + perSkillGap * max(0, k_win - k_lose), max). */
    roundShiftBase: 0.05,
    roundShiftPerSkillGap: 0.01,
    roundShiftMax: 0.12,
    /** Total movement from all rounds is capped at this either way. */
    totalShiftCap: 0.3,
    /** Clamp on the final share after all rounds. */
    finalSplitMin: 0.05,
    finalSplitMax: 0.95,
    /** Seconds each player has to pick a strategy in a skill round. */
    roundPickSeconds: 10,
    /** Seconds a defender has to accept or decline a challenge. */
    challengeAcceptSeconds: 60,
  },

  skills: {
    min: 1,
    max: 10,
  },

  ai: {
    /** Chance a bot ignores its skills and picks a strategy uniformly at random. */
    randomPickChance: 0.25,
    /** How many of its highest skills a bot favours otherwise. */
    favouredSkillCount: 2,
  },

  stakes: {
    /** Bite: winner gains this share of the loser's strength; loser loses the same amount. */
    biteShare: 0.1,
    /** Eat: winner gains this share of the loser's strength; loser goes to the graveyard. */
    eatShare: 0.4,
    /** A Bite can never drop a monster below this strength. */
    minStrength: 1,
  },

  rewards: {
    xpWin: 30,
    xpLoss: 10,
    /** Practice fights against bots have no stake and pay this fraction of XP. */
    practiceXpMultiplier: 0.5,
    nuggetsWin: 15,
    nuggetsPerSkillRoundWon: 5,
    nuggetsLoss: 5,
    nuggetsLevelUp: 50,
    nuggetsDailyLogin: 20,
  },

  growTiers: {
    standard: { cost: 0, perDay: 1, strengthMin: 40, strengthMax: 80, skillPoints: 8, growMinutes: 0 },
    super: { cost: 150, perDay: Infinity, strengthMin: 80, strengthMax: 150, skillPoints: 12, growMinutes: 10 },
    xtreme: { cost: 500, perDay: Infinity, strengthMin: 150, strengthMax: 260, skillPoints: 16, growMinutes: 60 },
  },
  /** Skills sum to the tier's skill points plus this (so each of 4 skills starts at 1). */
  skillPointBase: 4,

  rarity: {
    common: { chance: 0.7, strengthBonus: 0 },
    rare: { chance: 0.22, strengthBonus: 0.1 },
    epic: { chance: 0.07, strengthBonus: 0.25 },
    legendary: { chance: 0.01, strengthBonus: 0.5 },
  },
  /**
   * Rare variants rolled when a monster grows, rarest first. The multiplier is a forever
   * boost to the strength used on the wheel, at every level: a shiny is always 1.5x the
   * same monster without the shine.
   */
  variants: {
    celestial: { chance: 1 / 100_000, multiplier: 5 },
    void: { chance: 1 / 10_000, multiplier: 3 },
    radioactive: { chance: 1 / 1_000, multiplier: 2 },
    shiny: { chance: 1 / 200, multiplier: 1.5 },
  },

  levels: {
    max: 20,
    strengthBonusPerLevel: 0.04,
    skillPointsPerLevel: 1,
    /** XP to go from level L to L+1 is xpBase + xpPerLevel * (L - 1). */
    xpBase: 40,
    xpPerLevel: 20,
  },

  profile: {
    /** Account XP (sum of all monster XP earned) per profile level. */
    xpPerLevel: 150,
  },

  /** Card frame by monster level: the frame applies from this level up. */
  cardFrames: { bronze: 1, silver: 5, gold: 10, cosmic: 15 },

  collection: { freeLimit: 12, memberLimit: 40 },

  graveyard: {
    freeLimit: 5,
    memberLimit: 15,
    resurrectCostPerStrength: 2,
    resurrectStrengthShare: 0.5,
    incinerateRefund: 10,
  },

  potions: {
    strengthBoost: { cost: 40, strengthMultiplier: 0.1, fights: 1 },
    skillPlusOne: { cost: 120 },
    luckyCharm: { cost: 80, wheelShare: 0.03, fights: 1 },
  },

  dojo: { minutes: 30, cost: 25, skillPoints: 1, strengthShare: 0.03, xp: 20, freeSlots: 1, memberSlots: 2 },
  arcade: { maxPerGame: 20, maxPerDay: 200, questionsPerGame: 10, nuggetsPerCorrect: 2, secondsPerGame: 60 },
  market: { listingFee: 0.05, botListings: 6, minPrice: 10, maxPrice: 100000 },
  trader: { tradesPerPairPerHour: 1, maxMonstersPerSide: 3 },
  energy: { max: 10, perPvpFight: 1, refillMinutes: 20 },
  mapLadder: { regions: 10 },
  profileUnlocks: { traderLevel: 3, dojoLevel: 5 },
  rateLimits: { challengesPerMinute: 10, tradesPerMinute: 10 },
  fightTiming: {
    /** Seconds the reveal stays on screen before the next round. */
    revealSeconds: 3,
    /** Seconds a disconnected player has to come back before the fight counts as abandoned. */
    reconnectGraceSeconds: 20,
  },
  /** Permanent club membership, bought with nuggets in the village. */
  membership: { cost: 1500 },
  presence: {
    /** How often a connected player's online status is refreshed. */
    refreshSeconds: 60,
  },
} as const;
