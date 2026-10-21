import { execSync } from 'node:child_process';

/**
 * Bring the test database schema up to date (non-destructive). Tests create their own
 * uniquely named players, so they don't need an empty database.
 */
export default function setup(): void {
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: 'postgresql://mbc:mbc@localhost:5432/mbc_test' },
    stdio: 'inherit',
  });
}
