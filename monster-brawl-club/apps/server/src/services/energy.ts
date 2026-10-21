import { BALANCE, currentEnergy } from '@mbc/shared';
import type { Tx } from '../db';
import { badRequest } from '../errors';

/** Spend PvP energy, applying refills first. */
export async function spendEnergy(tx: Tx, userId: string, amount = BALANCE.energy.perPvpFight): Promise<void> {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const now = Date.now();
  const e = currentEnergy({ energy: u.energy, updatedAt: u.energyUpdatedAt.getTime() }, now);
  if (e.energy < amount) throw badRequest('no_energy', `${u.username} is out of energy. It refills over time.`);
  // When spending from full, the refill clock starts now.
  const updatedAt = e.energy >= BALANCE.energy.max ? now : e.updatedAt;
  await tx.user.update({ where: { id: userId }, data: { energy: e.energy - amount, energyUpdatedAt: new Date(updatedAt) } });
}

export function hasEnergy(u: { energy: number; energyUpdatedAt: Date }, amount = BALANCE.energy.perPvpFight): boolean {
  return currentEnergy({ energy: u.energy, updatedAt: u.energyUpdatedAt.getTime() }, Date.now()).energy >= amount;
}
