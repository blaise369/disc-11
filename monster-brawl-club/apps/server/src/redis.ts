import { Redis } from 'ioredis';
import { env } from './env';

/** The few key-value operations the game needs (presence, rate limits, fight snapshots). */
interface Kv {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  del(key: string): Promise<void>;
  /** Increment a counter, starting its expiry window on first use. */
  incr(key: string, windowSeconds: number): Promise<number>;
}

function redisKv(url: string): Kv {
  const r = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  return {
    set: async (k, v, ttl) => void (await r.set(k, v, 'EX', ttl)),
    get: k => r.get(k),
    mget: keys => r.mget(keys),
    del: async k => void (await r.del(k)),
    incr: async (k, window) => {
      const n = await r.incr(k);
      if (n === 1) await r.expire(k, window);
      return n;
    },
  };
}

/** In-process store for running on one machine without Redis. */
function memoryKv(): Kv {
  const m = new Map<string, { v: string; until: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.until <= Date.now()) m.delete(k);
    return m.get(k) ?? null;
  };
  return {
    set: async (k, v, ttl) => void m.set(k, { v, until: Date.now() + ttl * 1000 }),
    get: async k => live(k)?.v ?? null,
    mget: async keys => keys.map(k => live(k)?.v ?? null),
    del: async k => void m.delete(k),
    incr: async (k, window) => {
      const e = live(k);
      const n = (e ? Number(e.v) : 0) + 1;
      m.set(k, { v: String(n), until: e?.until ?? Date.now() + window * 1000 });
      return n;
    },
  };
}

/** Redis when REDIS_URL is set (needed for several servers); otherwise memory. */
const kv: Kv = env.redisUrl ? redisKv(env.redisUrl) : memoryKv();

const PRESENCE_TTL = 90;

export async function markOnline(userId: string): Promise<void> {
  await kv.set(`presence:${userId}`, '1', PRESENCE_TTL);
}

export async function markOffline(userId: string): Promise<void> {
  await kv.del(`presence:${userId}`);
}

export async function onlineSet(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const vals = await kv.mget(userIds.map(id => `presence:${id}`));
  return new Set(userIds.filter((_, i) => vals[i] !== null));
}

/** Fixed-window rate limit. Returns true if the action is allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const k = `rl:${key}`;
  return (await kv.incr(k, windowSeconds)) <= limit;
}

export async function saveFightSnapshot(fightId: string, data: unknown): Promise<void> {
  await kv.set(`fight:${fightId}`, JSON.stringify(data), 60 * 60);
}

export async function loadFightSnapshot<T>(fightId: string): Promise<T | null> {
  const raw = await kv.get(`fight:${fightId}`);
  return raw ? (JSON.parse(raw) as T) : null;
}
