// Entry point of the packaged game (MonsterBrawlClub.exe): bundled by scripts/build-exe.mjs.
// Saves to the user's app-data folder so a newer download keeps the same monsters.
import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalDatabase } from './localdb';

const appDir = fileURLToPath(new URL('.', import.meta.url));
const dataDir = process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'MonsterBrawlClub', 'postgres')
  : join(homedir(), '.monster-brawl-club', 'postgres');
process.env.WEB_DIST ??= join(appDir, 'web');

const { pg } = await startLocalDatabase(dataDir, Number(process.env.PLAY_PG_PORT ?? 54329));
// No Prisma CLI in the package: the build ships the schema as plain SQL.
const client = pg.getPgClient('mbc');
await client.connect();
const { rows } = await client.query(`SELECT to_regclass('"User"') AS t`);
if (!rows[0].t) await client.query(readFileSync(join(appDir, 'schema.sql'), 'utf8'));
await client.end();

await import('./index');
const url = `http://localhost:${process.env.PORT ?? 3001}`;
console.log(`\n  🎮 Monster Brawl Club is running!  Open ${url}\n  Keep this window open while you play. Close it to stop.\n`);
if (!process.env.MBC_NO_BROWSER) {
  const open = process.platform === 'win32' ? `start "" ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  exec(open, () => undefined);
}
