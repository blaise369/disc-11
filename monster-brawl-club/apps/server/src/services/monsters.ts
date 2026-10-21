import type { Monster } from '@prisma/client';
import {
  BALANCE, collectionLimit, isMonsterNameAllowed, isValidParts, isValidSkillSpread, rollGrow,
  type GrowRequest, type Strategy,
} from '@mbc/shared';
import type { Db, Tx } from '../db';
import { badRequest, forbidden, notFound } from '../errors';
import { sameUtcDay } from '../time';
import { changeNuggets } from './ledger';

const SKILL_COLUMN: Record<Strategy, 'atk' | 'def' | 'tricks' | 'brains'> = {
  attack: 'atk', defense: 'def', tricks: 'tricks', brains: 'brains',
};
export const skillColumn = (s: Strategy) => SKILL_COLUMN[s];

/**
 * A monster that can fight, train, trade or be listed: owned by this user, alive, fully
 * grown, not in a fight, not in the dojo and not on the market.
 */
export async function assertMonsterFree(db: Db, monsterId: string, ownerId: string): Promise<Monster> {
  const m = await db.monster.findUnique({ where: { id: monsterId } });
  if (!m || m.ownerId !== ownerId) throw notFound('monster_not_found');
  if (m.status !== 'alive') throw badRequest('monster_not_alive', `${m.name} is in the graveyard.`);
  if (m.readyAt.getTime() > Date.now()) throw badRequest('monster_growing', `${m.name} is still growing.`);
  if (m.lockedFightId) throw badRequest('monster_locked', `${m.name} is in a fight.`);
  if (m.dojoUntil) throw badRequest('monster_in_dojo', `${m.name} is training in the dojo.`);
  const listed = await db.marketListing.count({ where: { monsterId, state: 'open' } });
  if (listed) throw badRequest('monster_listed', `${m.name} is on the market.`);
  return m;
}

export async function assertCollectionSpace(db: Db, userId: string, isMember: boolean, incoming = 1): Promise<void> {
  const n = await db.monster.count({ where: { ownerId: userId, status: 'alive' } });
  if (n + incoming > collectionLimit(isMember)) {
    throw badRequest('collection_full', `Your collection is full (${collectionLimit(isMember)} monsters).`);
  }
}

export async function growMonster(tx: Tx, userId: string, req: GrowRequest): Promise<Monster> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const name = req.name.trim();
  if (!isMonsterNameAllowed(name)) throw badRequest('bad_name', 'Please pick a different name (letters and numbers, 2 to 16 long).');
  if (!isValidParts(req.parts, req.palette, user.isMember)) throw badRequest('bad_parts', 'Some of those parts are not available.');
  if (!isValidSkillSpread(req.skills, req.tier)) throw badRequest('bad_skills', 'Spread exactly the skill points for this tier.');
  await assertCollectionSpace(tx, userId, user.isMember);

  const tier = BALANCE.growTiers[req.tier];
  if (req.tier === 'standard') {
    if (sameUtcDay(user.lastStandardGrow)) throw badRequest('standard_used', 'You already grew your free monster today.');
    await tx.user.update({ where: { id: userId }, data: { lastStandardGrow: new Date() } });
  } else {
    await changeNuggets(tx, userId, -tier.cost, `grow_${req.tier}`);
  }
  const roll = rollGrow(req.tier);
  return tx.monster.create({
    data: {
      ownerId: userId, name, species: req.parts.species, parts: { ...req.parts }, palette: { ...req.palette },
      strength: roll.strength, rarity: roll.rarity, sheen: roll.sheen,
      atk: req.skills.attack, def: req.skills.defense, tricks: req.skills.tricks, brains: req.skills.brains,
      readyAt: new Date(Date.now() + tier.growMinutes * 60_000),
    },
  });
}

/** Spend one unspent skill point (from level-ups or the dojo). */
export async function spendSkillPoint(tx: Tx, userId: string, monsterId: string, strategy: Strategy): Promise<void> {
  const m = await tx.monster.findUnique({ where: { id: monsterId } });
  if (!m || m.ownerId !== userId) throw notFound('monster_not_found');
  if (m.skillPoints < 1) throw badRequest('no_skill_points');
  await raiseSkill(tx, m, strategy);
  await tx.monster.update({ where: { id: m.id }, data: { skillPoints: { decrement: 1 } } });
}

export async function raiseSkill(tx: Tx, m: Monster, strategy: Strategy): Promise<void> {
  const col = skillColumn(strategy);
  if (m[col] >= BALANCE.skills.max) throw badRequest('skill_maxed', 'That skill is already at 10.');
  await tx.monster.update({ where: { id: m.id }, data: { [col]: { increment: 1 } } });
}

export function assertChildCan(flag: boolean, what: string): void {
  if (!flag) throw forbidden('parent_approval_needed', `A parent needs to turn on ${what} first.`);
}
