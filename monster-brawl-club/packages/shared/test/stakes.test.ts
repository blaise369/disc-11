import { describe, expect, it } from 'vitest';
import { fightRewards, resolveStake, stakesAreValid, type StakeInput } from '../src';

const base: StakeInput = {
  winnerStake: 'bite', winnerStrength: 100, loserStrength: 80,
  winnerCollectionFull: false, loserGraveyardFull: false,
};

describe('stakesAreValid', () => {
  it('needs both players to agree to Bite', () => {
    expect(stakesAreValid('bite', 'bite')).toBe(true);
    expect(stakesAreValid('bite', 'collect')).toBe(false);
    expect(stakesAreValid('eat', 'bite')).toBe(false);
  });
  it('lets Collect and Eat mix freely', () => {
    expect(stakesAreValid('collect', 'eat')).toBe(true);
    expect(stakesAreValid('eat', 'eat')).toBe(true);
    expect(stakesAreValid('collect', 'collect')).toBe(true);
  });
});

describe('resolveStake', () => {
  it('Bite: winner takes 10% of the loser’s strength, loser keeps the monster', () => {
    expect(resolveStake(base)).toEqual({
      applied: 'bite', downgraded: false, loserMonster: 'stays',
      winnerStrength: 108, loserStrength: 72, nuggetsToWinner: 0,
    });
  });

  it('Bite rounds to whole strength and never drops the loser below 1', () => {
    expect(resolveStake({ ...base, loserStrength: 45 })).toMatchObject({ winnerStrength: 105, loserStrength: 40 }); // 4.5 rounds to 5
    expect(resolveStake({ ...base, loserStrength: 1 })).toMatchObject({ winnerStrength: 100, loserStrength: 1 });
    expect(resolveStake({ ...base, loserStrength: 0 })).toMatchObject({ winnerStrength: 100, loserStrength: 0 });
  });

  it('Collect: the loser’s monster joins the winner at full strength', () => {
    expect(resolveStake({ ...base, winnerStake: 'collect' })).toEqual({
      applied: 'collect', downgraded: false, loserMonster: 'transferred',
      winnerStrength: 100, loserStrength: 80, nuggetsToWinner: 0,
    });
  });

  it('Collect into a full collection auto-sells for nuggets equal to its strength', () => {
    expect(resolveStake({ ...base, winnerStake: 'collect', winnerCollectionFull: true })).toEqual({
      applied: 'collect', downgraded: false, loserMonster: 'sold',
      winnerStrength: 100, loserStrength: 80, nuggetsToWinner: 80,
    });
  });

  it('Eat: winner gains 40% of the loser’s strength, loser goes to the graveyard', () => {
    expect(resolveStake({ ...base, winnerStake: 'eat' })).toEqual({
      applied: 'eat', downgraded: false, loserMonster: 'graveyard',
      winnerStrength: 132, loserStrength: 80, nuggetsToWinner: 0,
    });
  });

  it('Eat into a full graveyard downgrades to Bite', () => {
    expect(resolveStake({ ...base, winnerStake: 'eat', loserGraveyardFull: true })).toEqual({
      applied: 'bite', downgraded: true, loserMonster: 'stays',
      winnerStrength: 108, loserStrength: 72, nuggetsToWinner: 0,
    });
  });
});

describe('fightRewards', () => {
  it('pays 30 XP and 15 nuggets + 5 per skill round won for a win', () => {
    expect(fightRewards({ won: true, skillRoundsWon: 2, practice: false })).toEqual({ xp: 30, nuggets: 25 });
  });
  it('pays 10 XP and 5 nuggets for a loss', () => {
    expect(fightRewards({ won: false, skillRoundsWon: 3, practice: false })).toEqual({ xp: 10, nuggets: 5 });
  });
  it('halves XP for practice fights', () => {
    expect(fightRewards({ won: true, skillRoundsWon: 0, practice: true })).toEqual({ xp: 15, nuggets: 15 });
    expect(fightRewards({ won: false, skillRoundsWon: 0, practice: true })).toEqual({ xp: 5, nuggets: 5 });
  });
});
