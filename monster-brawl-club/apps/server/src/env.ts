// Loads apps/server/.env if present (Node's built-in loader), then exposes typed config.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env file: rely on the real environment.
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://mbc:mbc@localhost:5432/mbc',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  port: Number(process.env.PORT ?? 3001),
  production: process.env.NODE_ENV === 'production',
};
process.env.DATABASE_URL = env.databaseUrl;
