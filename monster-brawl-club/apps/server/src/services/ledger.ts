import type { MissionMetric } from '@mbc/shared';
import type { Tx } from '../db';
import { badRequest } from '../errors';
import { dayKey } from '../time';

/** Change a user's nuggets and record it in the ledger. Fails if the balance would go negative. */
export async function changeNuggets(tx: Tx, userId: string, amount: number, reason: string, refId?: string): Promise<number> {
  if (amount === 0) return (await tx.user.findUniqueOrThrow({ where: { id: userId } })).nuggets;
  const u = await tx.user.update({ where: { id: userId }, data: { nuggets: { increment: amount } } });
  if (u.nuggets < 0) throw badRequest('not_enough_nuggets', 'Not enough nuggets.');
  await tx.ledgerEntry.create({ data: { userId, amount, reason, refId: refId ?? null } });
  return u.nuggets;
}

/** Bump a daily mission counter. */
export async function bumpActivity(tx: Tx, userId: string, metric: MissionMetric, by = 1): Promise<void> {
  if (by <= 0) return;
  const day = dayKey();
  await tx.activity.upsert({
    where: { userId_metric_day: { userId, metric, day } },
    create: { userId, metric, day, count: by },
    update: { count: { increment: by } },
  });
}
