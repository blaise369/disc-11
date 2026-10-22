// Loads apps/server/.env if present (Node's built-in loader), then exposes typed config.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env file: rely on the real environment.
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://mbc:mbc@localhost:5432/mbc',
  /** Optional: without it, presence and rate limits live in memory (fine for one server). */
  redisUrl: process.env.REDIS_URL || null,
  port: Number(process.env.PORT ?? 3001),
  production: process.env.NODE_ENV === 'production',
  /** Secure (HTTPS-only) cookies. On by default in production; turn off to play over plain http://localhost. */
  secureCookies: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
};
process.env.DATABASE_URL = env.databaseUrl;
