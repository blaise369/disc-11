import { buildApp } from './app';
import { env } from './env';
import { recoverStaleFights } from './realtime/engine';
import { ensureBots } from './services/bots';

await recoverStaleFights();
await ensureBots();
const { app } = await buildApp({ logger: true });
await app.listen({ port: env.port, host: '0.0.0.0' });
