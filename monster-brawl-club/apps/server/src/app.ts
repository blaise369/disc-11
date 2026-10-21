import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { HttpError } from './errors';
import { createSocketServer } from './realtime/socket';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/game';
import { villageRoutes } from './routes/village';
import { socialRoutes } from './routes/social';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<{ app: FastifyInstance; io: ReturnType<typeof createSocketServer> }> {
  const app = Fastify({ logger: opts.logger ?? false });
  await app.register(cookie);

  app.setErrorHandler((error, _req, reply) => {
    const err = error as Error & { statusCode?: number };
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    const status = err.statusCode;
    if (status && status < 500) return reply.status(status).send({ error: 'bad_request', message: err.message });
    app.log.error(err);
    return reply.status(500).send({ error: 'server_error', message: 'Something went wrong.' });
  });

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(gameRoutes, { prefix: '/api' });
  await app.register(villageRoutes, { prefix: '/api' });
  await app.register(socialRoutes, { prefix: '/api' });
  app.get('/api/health', async () => ({ ok: true }));

  // In production, serve the built web app (SPA fallback to index.html).
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) return reply.status(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  const io = createSocketServer(app.server);
  return { app, io };
}
