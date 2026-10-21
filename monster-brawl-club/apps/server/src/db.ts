import './env';
import { PrismaClient, type Prisma } from '@prisma/client';

export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/** Run fn in a serializable transaction, retrying on write conflicts. */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15_000 });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'P2034' && attempt < 4) continue;
      throw e;
    }
  }
}
