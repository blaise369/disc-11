// A private Postgres that lives in a folder on this computer (used by `pnpm play` and the .exe).
import { existsSync, mkdirSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

export async function startLocalDatabase(dataDir: string, port: number) {
  if (process.getuid?.() === 0) {
    console.error('Postgres refuses to run as the root user. Run the game as your normal user.');
    process.exit(1);
  }
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'mbc',
    password: 'mbc',
    port,
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

  process.env.DATABASE_URL = `postgresql://mbc:mbc@localhost:${port}/mbc`;
  process.env.NODE_ENV ??= 'production';
  // Plain http on this computer or your home network: secure cookies would be dropped.
  process.env.COOKIE_SECURE ??= 'false';

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
  // Closing the console window on Windows.
  process.on('SIGHUP', () => void stop());

  return { pg, firstRun };
}
