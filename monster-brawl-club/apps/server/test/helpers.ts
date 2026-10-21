import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, FightView, ServerToClientEvents } from '@mbc/shared';
import { buildApp } from '../src/app';
import { prisma } from '../src/db';
import { recoverStaleFights } from '../src/realtime/engine';
import { ensureBots } from '../src/services/bots';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function startServer() {
  await recoverStaleFights();
  await ensureBots();
  const { app, io } = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  return { app, io, base: `http://127.0.0.1:${port}` };
}

export class Client {
  cookie = '';
  constructor(private base: string) {}

  async call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(this.base + '/api' + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: this.cookie },
      body: body !== undefined ? JSON.stringify(body) : null,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
    return { status: res.status, data: (await res.json()) as T };
  }

  async ok<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.call<T>(method, path, body);
    if (r.status !== 200) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  }

  connect(): Promise<ClientSocket> {
    const s: ClientSocket = ioClient(this.base, { transports: ['websocket'], extraHeaders: { cookie: this.cookie }, forceNew: true });
    return new Promise((resolve, reject) => {
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }
}

let n = 0;
/** A parent with one child, with the given parent settings. */
export async function makeChild(base: string, settings: { allowRiskyStakes?: boolean; allowTrades?: boolean } = {}) {
  const parent = new Client(base);
  await parent.ok('POST', '/auth/parent/signup', { email: `parent${Date.now()}${n++}@example.com`, password: 'password123', pin: '1234' });
  const { choices } = await parent.ok<{ choices: string[] }>('GET', '/parent/username-choices');
  const username = choices[0]!;
  const { child } = await parent.ok<{ child: { id: string } }>('POST', '/parent/children', { username, password: 'kidpass1' });
  if (Object.keys(settings).length) await parent.ok('PATCH', `/parent/children/${child.id}`, settings);
  const kid = new Client(base);
  await kid.ok('POST', '/auth/login', { login: username, password: 'kidpass1' });
  return { parent, kid, username, id: child.id };
}

export const LOOK = {
  parts: { species: 'furball', eyes: 'googly', mouth: 'grin', head: 'none', arms: 'stubby', legs: 'stumpy', pattern: 'plain' },
  palette: { body: 1, accent: 4 },
};

export async function growStandard(kid: Client, name: string, skills = { attack: 3, defense: 3, tricks: 3, brains: 3 }) {
  const { monster } = await kid.ok<{ monster: { id: string; strength: number } }>('POST', '/monsters/grow', { name, tier: 'standard', ...LOOK, skills });
  return monster;
}

/** Give a user nuggets directly (test-only shortcut). */
export async function grant(userId: string, nuggets: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { nuggets: { increment: nuggets } } });
}

export function waitForState(s: ClientSocket, fightId: string, pred: (f: FightView) => boolean, ms = 30_000): Promise<FightView> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out waiting for fight state')), ms);
    const on = (f: FightView) => {
      if (f.id === fightId && pred(f)) {
        clearTimeout(t);
        s.off('fight:state', on);
        resolve(f);
      }
    };
    s.on('fight:state', on);
  });
}

export function emit<E extends keyof ClientToServerEvents>(s: ClientSocket, ev: E, req: Parameters<ClientToServerEvents[E]>[0]): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  return new Promise(resolve => (s.emit as (e: string, r: unknown, cb: (x: never) => void) => void)(ev, req, resolve));
}
