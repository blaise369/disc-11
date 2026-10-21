import { defineConfig, devices } from '@playwright/test';

// Runs the built web app served by the game server against the test database.
// Needs Postgres and Redis running (see README).
const PORT = 3101;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, ...devices['Desktop Chrome'] },
  webServer: {
    command: 'pnpm --filter @mbc/web build && pnpm --filter @mbc/server exec prisma db push --skip-generate && pnpm --filter @mbc/server start',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://mbc:mbc@localhost:5432/mbc_test',
      REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/2',
    },
  },
});
