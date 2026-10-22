// Packages the game as a folder with one program to double-click (MonsterBrawlClub.exe on
// Windows), for players who don't want to install Node or pnpm. Builds for the computer it
// runs on: run it on Windows (the GitHub workflow does) to get the Windows version.
//
//   release/MonsterBrawlClub/
//     MonsterBrawlClub(.exe)   Node single-executable launcher
//     app/server.mjs           the server, bundled
//     app/web/                 the built web app
//     app/schema.sql           database schema (no Prisma CLI at runtime)
//     app/node_modules/        Prisma client + engine, Postgres binaries
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, realpathSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverDir = join(root, 'apps/server');
const outDir = join(root, 'release/MonsterBrawlClub');
const appDir = join(outDir, 'app');
const work = join(root, 'release/.work');
const isWin = process.platform === 'win32';
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

rmSync(join(root, 'release'), { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
mkdirSync(work, { recursive: true });

console.log('• Building the web app');
run('pnpm --filter @mbc/web build');
cpSync(join(root, 'apps/web/dist'), join(appDir, 'web'), { recursive: true });

console.log('• Bundling the server');
await build({
  entryPoints: [join(serverDir, 'src/standalone.ts')],
  outfile: join(appDir, 'server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Prisma loads its engine relative to its own files; the Postgres package points at its binaries.
  external: ['@prisma/client', '.prisma/client', '@embedded-postgres/*', 'pg-native'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
// Bundled modules all share one folder, so `index` must be found next to the bundle.
writeFileSync(join(appDir, 'launch.cjs'),
  "// Loaded by the launcher. Runs the bundled server (an ES module).\n" +
  "const { pathToFileURL } = require('node:url');\n" +
  "const { join } = require('node:path');\n" +
  "module.exports = import(pathToFileURL(join(__dirname, 'server.mjs')).href);\n");

console.log('• Database schema');
const sql = execSync('pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script', { cwd: serverDir });
writeFileSync(join(appDir, 'schema.sql'), sql);

console.log('• Copying Prisma and Postgres');
const nm = join(appDir, 'node_modules');
const prismaClient = realpathSync(join(serverDir, 'node_modules/@prisma/client'));
cpSync(prismaClient, join(nm, '@prisma/client'), { recursive: true, dereference: true });
cpSync(join(prismaClient, '../../.prisma/client'), join(nm, '.prisma/client'), { recursive: true, dereference: true });
const pgPkg = `@embedded-postgres/${isWin ? 'windows' : process.platform}-${process.arch}`;
const requireFromEp = createRequire(realpathSync(join(serverDir, 'node_modules/embedded-postgres/package.json')));
const pgDir = resolve(dirname(requireFromEp.resolve(pgPkg)), '..');
for (const part of ['package.json', 'dist', 'native']) {
  cpSync(join(pgDir, part), join(nm, pgPkg, part), { recursive: true, dereference: true });
}

console.log('• Making the launcher');
writeFileSync(join(work, 'launcher.cjs'), `
const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');
const appDir = join(dirname(process.execPath), 'app');
const fail = (e) => {
  console.error('\\nMonster Brawl Club could not start:\\n', e && e.stack || e);
  console.error('\\nPress Enter to close.');
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
};
process.on('uncaughtException', fail);
try {
  createRequire(join(appDir, 'launch.cjs'))('./launch.cjs').catch(fail);
} catch (e) { fail(e); }
`);
writeFileSync(join(work, 'sea-config.json'), JSON.stringify({
  main: join(work, 'launcher.cjs'),
  output: join(work, 'sea.blob'),
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
}));
execFileSync(process.execPath, ['--experimental-sea-config', join(work, 'sea-config.json')], { stdio: 'inherit' });
const exe = join(outDir, isWin ? 'MonsterBrawlClub.exe' : 'MonsterBrawlClub');
copyFileSync(process.execPath, exe);
run(`pnpm exec postject "${exe}" NODE_SEA_BLOB "${join(work, 'sea.blob')}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2${process.platform === 'darwin' ? ' --macho-segment-name NODE_SEA' : ''}`);

writeFileSync(join(outDir, 'READ ME.txt'),
`Monster Brawl Club

1. Double-click ${isWin ? 'MonsterBrawlClub.exe' : 'MonsterBrawlClub'}.
   ${isWin ? 'If Windows says "Windows protected your PC", click "More info", then "Run anyway".\n   ' : ''}The first start takes a few seconds while it sets up the game's database.
2. Your browser opens the game at http://localhost:3001. Pick a username and play.
3. Keep the black window open while you play. Close it to stop the game.

Your monsters are saved on this computer, so they are still there next time
(and when you download a newer version).
Friends on the same Wi-Fi can play too: they open http://<your computer's IP>:3001.
`);
rmSync(work, { recursive: true, force: true });
console.log(`\nDone: ${outDir}`);
