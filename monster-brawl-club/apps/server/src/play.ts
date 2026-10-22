// `pnpm play`: run the whole game on one computer with nothing but Node installed.
// Starts a private Postgres from node_modules (data kept in .play-data/), uses in-memory
// presence instead of Redis, brings the schema up to date, then starts the game server.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startLocalDatabase } from './localdb';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const dataDir = fileURLToPath(new URL('../../../.play-data/postgres', import.meta.url));

await startLocalDatabase(dataDir, Number(process.env.PLAY_PG_PORT ?? 54329));

// Also (re)generates the database client, so a fresh install just works.
execSync('npx prisma db push', { cwd: serverDir, stdio: 'ignore', env: process.env });

await import('./index');
const port = process.env.PORT ?? 3001;
console.log(`\n  🎮 Monster Brawl Club is running!  Open http://localhost:${port}\n  Press Ctrl+C to stop.\n`);
