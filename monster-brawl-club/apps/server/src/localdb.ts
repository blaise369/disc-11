// A private Postgres that lives in a folder on this computer (used by `pnpm play` and the .exe).
// embedded-postgres supplies the binaries and creates the cluster; starting and stopping go
// through pg_ctl, which (unlike running postgres directly) also works from a Windows admin account.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

async function pgCtlPath(): Promise<string> {
  const pkg = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  let bins: { pg_ctl: string };
  try {
    bins = await import(pkg); // the packaged game ships it next to the server
  } catch {
    const fromEmbedded = createRequire(import.meta.resolve('embedded-postgres'));
    bins = await import(pathToFileURL(fromEmbedded.resolve(pkg)).href);
  }
  return bins.pg_ctl;
}

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
  const pgCtl = await pgCtlPath();
  const logFile = join(dirname(dataDir), 'postgres.log');
  const ctl = (...args: string[]) => spawnSync(pgCtl, [...args, '-D', dataDir], { stdio: 'ignore', windowsHide: true }).status;

  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log('First run: setting up the game database (takes a few seconds)...');
    rmSync(dataDir, { recursive: true, force: true }); // a half-made one from an interrupted first run
    mkdirSync(dataDir, { recursive: true });
    await pg.initialise();
  }
  // Still running if the game was closed without stopping it: just use it.
  if (ctl('status') !== 0 && ctl('start', '-w', '-t', '60', '-l', logFile, '-o', `-p ${port}`) !== 0) {
    const log = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').slice(-15).join('\n') : '';
    throw new Error(`The game database would not start.\n${log}`);
  }

  const admin = pg.getPgClient('postgres');
  await admin.connect();
  const { rowCount } = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'mbc'`);
  if (!rowCount) await admin.query('CREATE DATABASE mbc');
  await admin.end();

  process.env.DATABASE_URL = `postgresql://mbc:mbc@localhost:${port}/mbc`;
  process.env.NODE_ENV ??= 'production';
  // Plain http on this computer or your home network: secure cookies would be dropped.
  process.env.COOKIE_SECURE ??= 'false';

  let stopped = false;
  const stopDb = () => {
    if (stopped) return;
    stopped = true;
    ctl('stop', '-m', 'fast', '-w');
  };
  const stop = () => {
    console.log('\nStopping...');
    stopDb();
    process.exit(0);
  };
  process.on('exit', stopDb);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // Closing the console window on Windows.
  process.on('SIGHUP', stop);

  return { pg };
}
