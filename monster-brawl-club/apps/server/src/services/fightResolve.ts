import {
  applyXp, BALANCE, collectionLimit, fightRewards, graveyardLimit, resolveStake, REGIONS,
  type FightResultView, type FightStake, type RoundView, type Side, type SideRewards, type Stake,
} from '@mbc/shared';
import { transaction, type Tx } from '../db';
import { badRequest } from '../errors';
import { MARKET_BOT } from './bots';
import { bumpActivity, changeNuggets } from './ledger';

export interface ResolveInput {
  fightId: string;
  winnerSide: Side;
  /** Set when a player left after accepting: they lose. */
  abandonedBy: Side | null;
  rounds: RoundView[];
  pFinal: number | null;
  roll: number | null;
  seed: string | null;
}

const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

/**
 * Settle a fight in one transaction: stake (strength, ownership or graveyard), XP, nuggets,
 * level-ups, potions used, monster unlocks, mission counters and boss progress.
 */
export async function resolveFight(input: ResolveInput): Promise<FightResultView> {
  return transaction(tx => resolveInTx(tx, input));
}

async function resolveInTx(tx: Tx, input: ResolveInput): Promise<FightResultView> {
  const fight = await tx.fight.findUniqueOrThrow({ where: { id: input.fightId } });
  if (['RESOLVED', 'ABANDONED', 'DECLINED', 'EXPIRED'].includes(fight.state)) throw badRequest('fight_already_over');

  const monsters = {
    A: await tx.monster.findUniqueOrThrow({ where: { id: fight.monsterAId } }),
    B: await tx.monster.findUniqueOrThrow({ where: { id: fight.monsterBId } }),
  };
  const users = {
    A: await tx.user.findUniqueOrThrow({ where: { id: fight.challengerId } }),
    B: await tx.user.findUniqueOrThrow({ where: { id: fight.defenderId } }),
  };
  const winner = input.winnerSide;
  const loser = other(winner);
  const practice = fight.kind !== 'pvp';
  const strengths = { A: monsters.A.strength, B: monsters.B.strength };
  const owners = { A: monsters.A.ownerId, B: monsters.B.ownerId };
  let loserStatus = monsters[loser].status;

  // ---- Stake ----
  let stake: FightResultView['stake'] = null;
  if (!practice) {
    const winnerStake = (winner === 'A' ? fight.stakeA : fight.stakeB) as Stake;
    const winnerUser = users[winner];
    const loserUser = users[loser];
    const [collectionCount, graveyardCount] = await Promise.all([
      tx.monster.count({ where: { ownerId: winnerUser.id, status: 'alive' } }),
      tx.monster.count({ where: { ownerId: loserUser.id, status: 'graveyard' } }),
    ]);
    const outcome = resolveStake({
      winnerStake,
      winnerStrength: strengths[winner],
      loserStrength: strengths[loser],
      winnerCollectionFull: collectionCount >= collectionLimit(winnerUser.isMember),
      loserGraveyardFull: graveyardCount >= graveyardLimit(loserUser.isMember),
    });
    stake = { ...outcome, winnerStake: winnerStake as FightStake };
    strengths[winner] = outcome.winnerStrength;
    strengths[loser] = outcome.loserStrength;
    if (outcome.loserMonster === 'transferred') owners[loser] = winnerUser.id;
    if (outcome.loserMonster === 'sold') {
      const market = await tx.user.findUniqueOrThrow({ where: { username: MARKET_BOT } });
      owners[loser] = market.id;
      await changeNuggets(tx, winnerUser.id, outcome.nuggetsToWinner, 'collect_autosell', fight.id);
    }
    if (outcome.loserMonster === 'graveyard') loserStatus = 'graveyard';
  }

  // ---- Rewards, XP and level-ups ----
  const roundsWon = { A: input.rounds.filter(r => r.winner === 'A').length, B: input.rounds.filter(r => r.winner === 'B').length };
  const rewards: Record<Side, SideRewards | null> = { A: null, B: null };
  let bossBeaten: number | null = null;

  for (const side of ['A', 'B'] as const) {
    const user = users[side];
    const m = monsters[side];
    const won = side === winner;
    const isHuman = user.role !== 'bot';
    const left = input.abandonedBy === side;
    const r = isHuman && !left ? fightRewards({ won, skillRoundsWon: roundsWon[side], practice }) : { xp: 0, nuggets: 0 };
    const lvl = applyXp({ level: m.level, xp: m.xp, strength: strengths[side], skillPoints: m.skillPoints }, r.xp);

    await tx.monster.update({
      where: { id: m.id },
      data: {
        strength: lvl.strength, level: lvl.level, xp: lvl.xp, skillPoints: lvl.skillPoints,
        wins: { increment: won ? 1 : 0 }, losses: { increment: won ? 0 : 1 },
        ownerId: owners[side], status: side === loser ? loserStatus : m.status,
        lockedFightId: null,
      },
    });
    // One-fight potions are used up whoever wins.
    await tx.potionActive.updateMany({ where: { monsterId: m.id, fightsLeft: { gt: 0 } }, data: { fightsLeft: { decrement: 1 } } });
    await tx.potionActive.deleteMany({ where: { monsterId: m.id, fightsLeft: { lte: 0 } } });

    if (!isHuman) continue;
    const levelNuggets = lvl.levelsGained * BALANCE.rewards.nuggetsLevelUp;
    if (!left) await changeNuggets(tx, user.id, r.nuggets, won ? 'fight_win' : 'fight_loss', fight.id);
    if (levelNuggets) await changeNuggets(tx, user.id, levelNuggets, 'level_up', m.id);
    rewards[side] = { xp: r.xp, nuggets: left ? 0 : r.nuggets + levelNuggets, levelsGained: lvl.levelsGained };

    const data: { profileXp: { increment: number }; mapRegion?: number } = { profileXp: { increment: r.xp } };
    if (fight.kind === 'boss' && won && side === 'A') {
      bossBeaten = monsters.B.botRegion;
      if (bossBeaten !== null) data.mapRegion = Math.min(REGIONS.length, Math.max(user.mapRegion, bossBeaten + 1));
      await bumpActivity(tx, user.id, 'bossWins');
    }
    await tx.user.update({ where: { id: user.id }, data });
    await bumpActivity(tx, user.id, 'fightsPlayed');
    if (won) await bumpActivity(tx, user.id, 'fightsWon');
    await bumpActivity(tx, user.id, 'skillRoundsWon', roundsWon[side]);
  }

  const result: FightResultView = { winnerSide: winner, abandonedBy: input.abandonedBy, stake, rewards, bossBeaten };
  await tx.fightRound.createMany({
    data: input.rounds.map(r => ({ fightId: fight.id, roundNo: r.roundNo, pickA: r.pickA, pickB: r.pickB, winner: r.winner, delta: r.delta })),
  });
  await tx.fight.update({
    where: { id: fight.id },
    data: {
      state: input.abandonedBy ? 'ABANDONED' : 'RESOLVED',
      pFinal: input.pFinal, roll: input.roll, seed: input.seed ?? fight.seed,
      winnerMonsterId: monsters[winner].id, outcome: JSON.parse(JSON.stringify(result)), resolvedAt: new Date(),
    },
  });
  return result;
}
