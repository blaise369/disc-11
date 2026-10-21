import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { User } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './db';
import { env } from './env';
import { forbidden, HttpError } from './errors';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'mbc_session';
const SESSION_DAYS = 30;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(secret, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [kind, saltHex, hashHex] = stored.split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = await scrypt(secret, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}

const tokenId = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { id: tokenId(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
  });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: env.production, path: '/', maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { id: tokenId(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: tokenId(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

/** Parse the session token out of a raw Cookie header (for Socket.IO handshakes). */
export function tokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export async function requireUser(req: FastifyRequest): Promise<User> {
  const u = await userFromToken(req.cookies[SESSION_COOKIE]);
  if (!u) throw new HttpError(401, 'not_logged_in');
  return u;
}

/** Game routes: a logged-in player account. */
export async function requirePlayer(req: FastifyRequest): Promise<User> {
  const u = await requireUser(req);
  if (u.role !== 'player') throw forbidden('players_only');
  return u;
}
