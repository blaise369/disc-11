import { Redis } from 'ioredis';
import { env } from './env';

/** Presence, rate limits and in-flight fight snapshots live in Redis. */
export const redis = new Redis(env.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });

const PRESENCE_TTL = 90;

export async function markOnline(userId: string): Promise<void> {
  await redis.set(`presence:${userId}`, '1', 'EX', PRESENCE_TTL);
}

export async function markOffline(userId: string): Promise<void> {
  await redis.del(`presence:${userId}`);
}

export async function onlineSet(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const vals = await redis.mget(userIds.map(id => `presence:${id}`));
  return new Set(userIds.filter((_, i) => vals[i] !== null));
}

/** Fixed-window rate limit. Returns true if the action is allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const k = `rl:${key}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSeconds);
  return n <= limit;
}

export async function saveFightSnapshot(fightId: string, data: unknown): Promise<void> {
  await redis.set(`fight:${fightId}`, JSON.stringify(data), 'EX', 60 * 60);
}

export async function loadFightSnapshot<T>(fightId: string): Promise<T | null> {
  const raw = await redis.get(`fight:${fightId}`);
  return raw ? (JSON.parse(raw) as T) : null;
}
