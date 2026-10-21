import { prisma, type Db } from '../db';

export async function isBlockedEither(a: string, b: string, db: Db = prisma): Promise<boolean> {
  const n = await db.block.count({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return n > 0;
}

export async function areFriends(a: string, b: string, db: Db = prisma): Promise<boolean> {
  const n = await db.friendship.count({
    where: { status: 'accepted', OR: [{ userId: a, friendId: b }, { userId: b, friendId: a }] },
  });
  return n > 0;
}

/** Ids of everyone a user has blocked or is blocked by. */
export async function blockedIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
  return new Set(rows.map(r => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}
