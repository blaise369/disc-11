import { defineConfig } from 'vitest/config';

const TEST_DB = 'postgresql://mbc:mbc@localhost:5432/mbc_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { DATABASE_URL: TEST_DB, REDIS_URL: 'redis://localhost:6379/1' },
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
