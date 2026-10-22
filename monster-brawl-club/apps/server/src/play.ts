// `pnpm play`: run the whole game on one computer with nothing but Node installed.
// Starts a private Postgres from node_modules (data kept in .play-data/), uses in-memory
// presence instead of Redis, brings the schema up to date, then starts the game server.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const dataDir = fileURLToPath(new URL('../../../.play-data/postgres', import.meta.url));
const PG_PORT = Number(process.env.PLAY_PG_PORT ?? 54329);

if (process.getuid?.() === 0) {
  console.error('Postgres refuses to run as the root user. Run `pnpm play` as your normal user.');
  process.exit(1);
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'mbc',
  password: 'mbc',
  port: PG_PORT,
  persistent: true,
  onLog: () => undefined,
});

const firstRun = !existsSync(`${dataDir}/PG_VERSION`);
if (firstRun) {
  console.log('First run: setting up the game database (takes a few seconds)...');
  mkdirSync(dataDir, { recursive: true });
  await pg.initialise();
}
await pg.start();
if (firstRun) await pg.createDatabase('mbc');

process.env.DATABASE_URL = `postgresql://mbc:mbc@localhost:${PG_PORT}/mbc`;
process.env.NODE_ENV ??= 'production';
// Plain http on this computer or your home network: secure cookies would be dropped.
process.env.COOKIE_SECURE ??= 'false';

// Also (re)generates the database client, so a fresh install just works.
execSync('npx prisma db push', { cwd: serverDir, stdio: 'ignore', env: process.env });

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping...');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

await import('./index');
const port = process.env.PORT ?? 3001;
console.log(`\n  🎮 Monster Brawl Club is running!  Open http://localhost:${port}\n  Press Ctrl+C to stop.\n`);
