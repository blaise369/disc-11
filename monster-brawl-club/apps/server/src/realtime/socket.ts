import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  BALANCE, phraseText,
  type ClientToServerEvents, type ServerToClientEvents, type Side,
} from '@mbc/shared';
import { playTimeOver, tokenFromCookieHeader, userFromToken } from '../auth';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { markOffline, markOnline, rateLimit } from '../redis';
import { isBlockedEither } from '../services/social';
import { dayKey } from '../time';
import * as engine from './engine';

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { userId: string }>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { userId: string }>;

const connections = new Map<string, number>();
const room = (userId: string) => `user:${userId}`;

function errMessage(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  console.error(e);
  return 'Something went wrong.';
}

/** Wrap a handler so errors come back through the ack instead of crashing. */
function handle<Req, Res extends object>(fn: (req: Req) => Promise<Res> | Res) {
  return async (req: Req, ack: (r: ({ ok: true } & Res) | { ok: false; error: string }) => void) => {
    const reply = typeof ack === 'function' ? ack : () => undefined;
    try {
      reply({ ok: true, ...(await fn(req)) });
    } catch (e) {
      reply({ ok: false, error: errMessage(e) });
    }
  };
}

export function createSocketServer(http: HttpServer): IO {
  const io: IO = new Server(http, { cors: { origin: true, credentials: true } });

  engine.setEmitter({
    toUser: (userId, event, fight) => io.to(room(userId)).emit(event, fight),
    toUserRaw: (userId, event, payload) => {
      const target = io.to(room(userId)) as unknown as { emit: (ev: string, p: unknown) => boolean };
      target.emit(event, payload);
    },
    isOnline: userId => (connections.get(userId) ?? 0) > 0,
  });

  io.use(async (socket, next) => {
    const user = await userFromToken(tokenFromCookieHeader(socket.handshake.headers.cookie));
    if (!user || user.role !== 'child') return next(new Error('not_logged_in'));
    if (playTimeOver(user)) return next(new Error('play_time_over'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket: Sock) => {
    const userId = socket.data.userId;
    void socket.join(room(userId));
    connections.set(userId, (connections.get(userId) ?? 0) + 1);
    void markOnline(userId);
    engine.onUserConnected(userId);
    for (const f of engine.pendingChallengesFor(userId)) socket.emit('challenge:incoming', f);

    socket.on('challenge:send', handle(async req => ({ fightId: await engine.sendChallenge(userId, req) })));
    socket.on('challenge:respond', handle(async req => {
      await engine.respondChallenge(userId, req.fightId, req.accept, req.stake);
      return {};
    }));
    socket.on('challenge:cancel', handle(async req => {
      await engine.cancelChallenge(userId, req.fightId);
      return {};
    }));
    socket.on('practice:start', handle(async req => ({ fightId: await engine.startPractice(userId, req.monsterId, req.rounds, !!req.boss) })));
    socket.on('fight:join', handle(async req => ({ fight: await engine.fightView(userId, req.fightId) })));
    socket.on('round:pick', handle(req => {
      engine.pick(userId, req.fightId, req.strategy);
      return {};
    }));
    socket.on('fight:leave', handle(async req => {
      await engine.leave(userId, req.fightId);
      return {};
    }));
    socket.on('chat:phrase', handle(async req => {
      const text = phraseText(req.phraseId);
      if (!text) throw new HttpError(400, 'bad_phrase', 'Pick a phrase from the list.');
      if (!(await rateLimit(`chat:${userId}`, 1, 2))) throw new HttpError(429, 'rate_limited', 'Wait a moment before sending another.');
      const v = await engine.fightView(userId, req.fightId);
      const side: Side = v.a.userId === userId ? 'A' : 'B';
      const otherId = side === 'A' ? v.b.userId : v.a.userId;
      if (await isBlockedEither(userId, otherId)) throw new HttpError(403, 'blocked');
      for (const id of [userId, otherId]) io.to(room(id)).emit('chat:phrase', { fightId: req.fightId, side, text });
      return {};
    }));

    socket.on('disconnect', () => {
      const n = (connections.get(userId) ?? 1) - 1;
      if (n > 0) return void connections.set(userId, n);
      connections.delete(userId);
      void markOffline(userId);
      engine.onUserDisconnected(userId);
    });
  });

  // Play-time tracking for parent caps, and presence refresh.
  const tick = setInterval(() => void playTimeTick(io), BALANCE.playTime.tickSeconds * 1000);
  tick.unref();
  return io;
}

async function playTimeTick(io: IO): Promise<void> {
  const today = dayKey();
  for (const userId of connections.keys()) {
    await markOnline(userId);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u) continue;
    const seconds = (u.playDay === today ? u.playSecondsToday : 0) + BALANCE.playTime.tickSeconds;
    const updated = await prisma.user.update({ where: { id: userId }, data: { playDay: today, playSecondsToday: seconds } });
    // Never cut a child off mid-fight (they'd lose it); stop them as soon as it ends.
    if (playTimeOver(updated) && !engine.isInActiveFight(userId)) {
      io.to(room(userId)).emit('playtime:over');
      io.in(room(userId)).disconnectSockets(true);
    }
  }
}
