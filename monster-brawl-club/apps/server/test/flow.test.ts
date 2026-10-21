import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FightView, MonsterCard } from '@mbc/shared';
import { prisma } from '../src/db';
import { Client, emit, grant, growStandard, makePlayer, startServer, waitForState, type ClientSocket } from './helpers';

let server: Awaited<ReturnType<typeof startServer>>;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  server = await startServer();
});
afterAll(async () => {
  sockets.forEach(s => s.disconnect());
  server.io.close();
  await server.app.close();
});

describe('accounts', () => {
  it('signs players up with a filtered, unique username and logs them in', async () => {
    const { username } = await makePlayer(server.base);
    const c = new Client(server.base);
    expect((await c.call('POST', '/auth/signup', { username: 'no', password: 'kidpass1' })).status).toBe(400);
    expect((await c.call('POST', '/auth/signup', { username: 'big_butt', password: 'kidpass1' })).status).toBe(400);
    expect((await c.call('POST', '/auth/signup', { username: username.toUpperCase(), password: 'kidpass1' })).status).toBe(400);
    expect((await c.call('POST', '/auth/login', { username, password: 'wrong' })).status).toBe(401);
    const me = (await c.ok<{ me: { username: string; role: string } }>('POST', '/auth/login', { username, password: 'kidpass1' })).me;
    expect(me).toMatchObject({ username, role: 'player' });
    const { choices } = await c.ok<{ choices: string[] }>('GET', '/auth/username-suggestions');
    expect(choices.length).toBeGreaterThan(0);
    // The parent centre is gone.
    expect((await c.call('GET', '/parent')).status).toBe(404);
  });

  it('enforces the free grow limit, name filter and skill spread', async () => {
    const { client } = await makePlayer(server.base);
    const look = { parts: { species: 'furball', eyes: 'googly', mouth: 'grin', head: 'none', arms: 'stubby', legs: 'stumpy', pattern: 'plain' }, palette: { body: 1, accent: 2 } };
    expect((await client.call('POST', '/monsters/grow', { name: 'Big Butt', tier: 'standard', ...look, skills: { attack: 3, defense: 3, tricks: 3, brains: 3 } })).status).toBe(400);
    expect((await client.call('POST', '/monsters/grow', { name: 'Okay', tier: 'standard', ...look, skills: { attack: 9, defense: 3, tricks: 3, brains: 3 } })).status).toBe(400);
    expect((await client.call('POST', '/monsters/grow', { name: 'Okay', tier: 'standard', ...look, parts: { ...look.parts, species: 'drake' }, skills: { attack: 3, defense: 3, tricks: 3, brains: 3 } })).status).toBe(400);
    const m = await growStandard(client, 'Grubzilla');
    expect(m.strength).toBeGreaterThanOrEqual(40);
    expect((await client.call('POST', '/monsters/grow', { name: 'Second', tier: 'standard', ...look, skills: { attack: 3, defense: 3, tricks: 3, brains: 3 } })).status).toBe(400);
  });
});

describe('live PvP fight', () => {
  it('runs challenge, secret picks, spin and an Eat stake end to end', async () => {
    const a = await makePlayer(server.base);
    const b = await makePlayer(server.base);
    const ma = await growStandard(a.client, 'Chomper', { attack: 6, defense: 2, tricks: 2, brains: 2 });
    const mb = await growStandard(b.client, 'Squish', { attack: 2, defense: 2, tricks: 2, brains: 6 });
    const sa = await a.client.connect();
    const sb = await b.client.connect();
    sockets.push(sa, sb);

    const incoming = new Promise<FightView>(r => sb.once('challenge:incoming', r));
    const sent = await emit(sa, 'challenge:send', { defenderId: b.id, monsterAId: ma.id, monsterBId: mb.id, stake: 'eat', rounds: 1 });
    expect(sent.ok).toBe(true);
    const fightId = sent.fightId as string;
    expect((await incoming).id).toBe(fightId);

    // Bite needs both: a Bite reply to an Eat challenge is refused.
    expect((await emit(sb, 'challenge:respond', { fightId, accept: true, stake: 'bite' })).ok).toBe(false);

    const picking = waitForState(sa, fightId, f => f.state === 'ROUND_PICKING');
    expect((await emit(sb, 'challenge:respond', { fightId, accept: true, stake: 'collect' })).ok).toBe(true);
    const p = await picking;
    expect(p.seedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.pStart).toBeGreaterThanOrEqual(0.1);

    // Monsters are locked while fighting.
    expect((await a.client.call('POST', '/market/list', { monsterId: ma.id, price: 100 })).status).toBe(400);

    const done = Promise.all([
      waitForState(sa, fightId, f => f.state === 'RESOLVED'),
      waitForState(sb, fightId, f => f.state === 'RESOLVED'),
    ]);
    // Attack (A, skill 6) vs Brains (B, skill 6): Brains beats Attack, so B wins the round
    // and the wheel moves the base 0.05 (no skill gap).
    expect((await emit(sa, 'round:pick', { fightId, strategy: 'attack' })).ok).toBe(true);
    expect((await emit(sa, 'round:pick', { fightId, strategy: 'brains' })).ok).toBe(false); // no changing picks
    expect((await emit(sb, 'round:pick', { fightId, strategy: 'brains' })).ok).toBe(true);
    const [fa, fb] = await done;

    expect(fa.rounds).toHaveLength(1);
    expect(fa.rounds[0]!.winner).toBe('B');
    expect(fa.shareA).toBeCloseTo(fa.pStart! - 0.05);
    expect(fa.spin!.seed).toMatch(/^[0-9a-f]{64}$/);
    expect(fb.result!.winnerSide).toBe(fa.spin!.winner);

    // The seed matches the hash published before round 1, and the roll is reproducible.
    const { hashSeed, rollFromSeed } = await import('@mbc/shared');
    expect(await hashSeed(fa.spin!.seed)).toBe(p.seedHash);
    expect(await rollFromSeed(fa.spin!.seed)).toBe(fa.spin!.roll);

    // Stakes: winner's own stake applies. A chose Eat, B chose Collect.
    const after = await prisma.monster.findMany({ where: { id: { in: [ma.id, mb.id] } } });
    const A = after.find(m => m.id === ma.id)!;
    const B = after.find(m => m.id === mb.id)!;
    expect(A.lockedFightId).toBeNull();
    expect(B.lockedFightId).toBeNull();
    if (fa.result!.winnerSide === 'A') {
      expect(fa.result!.stake!.applied).toBe('eat');
      expect(B.status).toBe('graveyard');
      expect(A.strength).toBeGreaterThan(ma.strength);
    } else {
      expect(fa.result!.stake!.applied).toBe('collect');
      expect(A.ownerId).toBe(b.id);
    }
    // Rewards were written to the ledger and energy was spent.
    const ledger = await prisma.ledgerEntry.findMany({ where: { userId: a.id, refId: fightId } });
    expect(ledger.length).toBe(1);
    const meA = (await a.client.ok<{ me: { energy: number } }>('GET', '/me')).me;
    expect(meA.energy).toBe(9);
  });

  it('counts leaving after accepting as a loss', async () => {
    const a = await makePlayer(server.base);
    const b = await makePlayer(server.base);
    const ma = await growStandard(a.client, 'Leaver');
    const mb = await growStandard(b.client, 'Stayer');
    const sa = await a.client.connect();
    const sb = await b.client.connect();
    sockets.push(sa, sb);
    const sent = await emit(sa, 'challenge:send', { defenderId: b.id, monsterAId: ma.id, monsterBId: mb.id, stake: 'bite', rounds: 3 });
    const fightId = sent.fightId as string;
    const picking = waitForState(sb, fightId, f => f.state === 'ROUND_PICKING');
    await emit(sb, 'challenge:respond', { fightId, accept: true, stake: 'bite' });
    await picking;
    const over = waitForState(sb, fightId, f => f.state === 'ABANDONED');
    expect((await emit(sa, 'fight:leave', { fightId })).ok).toBe(true);
    const f = await over;
    expect(f.result!.winnerSide).toBe('B');
    expect(f.result!.abandonedBy).toBe('A');
    expect(f.result!.stake!.applied).toBe('bite');
    const leaver = await prisma.monster.findUniqueOrThrow({ where: { id: ma.id } });
    expect(leaver.strength).toBeLessThan(ma.strength);
  });

  it('refuses challenges to blocked players', async () => {
    const a = await makePlayer(server.base);
    const b = await makePlayer(server.base);
    const ma = await growStandard(a.client, 'Polite');
    const mb = await growStandard(b.client, 'Grumpy');
    const sa = await a.client.connect();
    sockets.push(sa, await b.client.connect());
    await b.client.ok('POST', '/blocks', { username: a.username });
    const r2 = await emit(sa, 'challenge:send', { defenderId: b.id, monsterAId: ma.id, monsterBId: mb.id, stake: 'bite', rounds: 0 });
    expect(r2.ok).toBe(false);
  });
});

describe('practice, boss and village', () => {
  it('applies the variant boost on the wheel forever', async () => {
    const a = await makePlayer(server.base);
    const ma = await growStandard(a.client, 'Glowy');
    await prisma.monster.update({ where: { id: ma.id }, data: { variant: 'radioactive' } });
    const { monster } = await a.client.ok<{ monster: MonsterCard }>('GET', `/monsters/${ma.id}`);
    expect(monster.variant).toBe('radioactive');
    expect(monster.power).toBe(ma.strength * 2);
    const sa = await a.client.connect();
    sockets.push(sa);
    const r = await emit(sa, 'practice:start', { monsterId: ma.id, rounds: 0 });
    const f = await waitForState(sa, r.fightId as string, x => x.state === 'RESOLVED');
    expect(f.a.fightStrength).toBe(ma.strength * 2);
  });

  it('sells club membership for nuggets, once', async () => {
    const a = await makePlayer(server.base);
    expect((await a.client.call('POST', '/membership/buy')).status).toBe(400); // not enough nuggets
    await grant(a.id, 1500);
    const { me } = await a.client.ok<{ me: { isMember: boolean; nuggets: number; collectionLimit: number } }>('POST', '/membership/buy');
    expect(me).toMatchObject({ isMember: true, nuggets: 100, collectionLimit: 40 });
    expect((await a.client.call('POST', '/membership/buy')).status).toBe(400);
  });

  it('plays a practice fight against a bot with no stake and half XP', async () => {
    const a = await makePlayer(server.base);
    const ma = await growStandard(a.client, 'Trainee');
    const sa = await a.client.connect();
    sockets.push(sa);
    const r = await emit(sa, 'practice:start', { monsterId: ma.id, rounds: 0 });
    expect(r.ok).toBe(true);
    const f = await waitForState(sa, r.fightId as string, x => x.state === 'RESOLVED');
    expect(f.result!.stake).toBeNull();
    const xp = f.result!.rewards.A!.xp;
    expect([15, 5]).toContain(xp);
    expect((await a.client.ok<{ fights: FightView[] }>('GET', '/fights')).fights[0]!.id).toBe(f.id);
  });

  it('moves up the map after beating a boss', async () => {
    const a = await makePlayer(server.base);
    const ma = await growStandard(a.client, 'Hero');
    // Make the hero overwhelming so the clamped 0.90 split wins almost always; retry if the 10% happens.
    await prisma.monster.update({ where: { id: ma.id }, data: { strength: 100_000 } });
    const sa = await a.client.connect();
    sockets.push(sa);
    for (let i = 0; i < 6; i++) {
      const r = await emit(sa, 'practice:start', { monsterId: ma.id, rounds: 0, boss: true });
      const f = await waitForState(sa, r.fightId as string, x => x.state === 'RESOLVED');
      if (f.result!.winnerSide === 'A') {
        expect(f.result!.bossBeaten).toBe(1);
        break;
      }
    }
    const me = (await a.client.ok<{ me: { mapRegion: number } }>('GET', '/me')).me;
    expect(me.mapRegion).toBe(2);
  });

  it('runs the dojo, potions, market, graveyard, arcade, daily reward and missions', async () => {
    const a = await makePlayer(server.base);
    const m = await growStandard(a.client, 'Shopper');
    await grant(a.id, 2000);

    // Daily reward once a day.
    expect((await a.client.call('POST', '/daily')).status).toBe(200);
    expect((await a.client.call('POST', '/daily')).status).toBe(400);

    // Potions.
    const { monster: boosted } = await a.client.ok<{ monster: MonsterCard }>('POST', '/potions/buy', { monsterId: m.id, type: 'strengthBoost' });
    expect(boosted.potions).toEqual([{ type: 'strengthBoost', fightsLeft: 1 }]);
    const { monster: skilled } = await a.client.ok<{ monster: MonsterCard }>('POST', '/potions/buy', { monsterId: m.id, type: 'skillPlusOne', strategy: 'tricks' });
    expect(skilled.skills.tricks).toBe(4);

    // Dojo is locked until profile level 5.
    expect((await a.client.call('POST', '/dojo/start', { monsterId: m.id, reward: 'skill' })).status).toBe(403);
    await prisma.user.update({ where: { id: a.id }, data: { profileXp: 600 } });
    await a.client.ok('POST', '/dojo/start', { monsterId: m.id, reward: 'skill' });
    expect((await a.client.call('POST', '/dojo/collect', { monsterId: m.id })).status).toBe(400);
    await prisma.monster.update({ where: { id: m.id }, data: { dojoUntil: new Date(Date.now() - 1000) } });
    const { monster: trained } = await a.client.ok<{ monster: MonsterCard }>('POST', '/dojo/collect', { monsterId: m.id });
    expect(trained.skillPoints).toBe(1);
    expect(trained.xp).toBe(20);

    // Market: buy a bot listing.
    const { listings } = await a.client.ok<{ listings: { id: string; price: number; monster: MonsterCard }[] }>('GET', '/market');
    expect(listings.length).toBeGreaterThan(0);
    const before = (await a.client.ok<{ me: { nuggets: number } }>('GET', '/me')).me.nuggets;
    const l = listings[0]!;
    await a.client.ok('POST', `/market/${l.id}/buy`);
    expect((await a.client.ok<{ me: { nuggets: number } }>('GET', '/me')).me.nuggets).toBe(before - l.price);
    expect((await a.client.call('POST', `/market/${l.id}/buy`)).status).toBe(400);

    // Graveyard: resurrect costs 2 per strength and halves strength.
    await prisma.monster.update({ where: { id: l.monster.id }, data: { status: 'graveyard' } });
    const { monster: back } = await a.client.ok<{ monster: MonsterCard }>('POST', `/graveyard/${l.monster.id}/resurrect`);
    expect(back.status).toBe('alive');
    expect(back.strength).toBe(Math.max(1, Math.round(l.monster.strength / 2)));

    // Arcade: answers are checked on the server.
    const game = await a.client.ok<{ gameId: string; questions: { a: number; b: number; op: string }[] }>('POST', '/arcade/start');
    const answers = game.questions.map(q => (q.op === '+' ? q.a + q.b : q.op === '-' ? q.a - q.b : q.a * q.b));
    const res = await a.client.ok<{ correct: number; reward: number }>('POST', `/arcade/${game.gameId}/finish`, { answers });
    expect(res).toMatchObject({ correct: 10, reward: 20 });

    // Missions: the arcade mission can now be claimed once.
    expect((await a.client.call('POST', '/missions/arcade/claim')).status).toBe(200);
    expect((await a.client.call('POST', '/missions/arcade/claim')).status).toBe(400);
    expect((await a.client.call('POST', '/missions/win2/claim')).status).toBe(400);
  });

  it('trades between friends only, with two confirms each', async () => {
    const a = await makePlayer(server.base);
    const b = await makePlayer(server.base);
    await prisma.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { profileXp: 300 } });
    const ma = await growStandard(a.client, 'Swapper');
    const mb = await growStandard(b.client, 'Swappee');
    // Not friends yet.
    expect((await a.client.call('POST', '/trades', { toUsername: b.username, offer: [ma.id], request: [mb.id] })).status).toBe(403);
    await a.client.ok('POST', '/friends', { username: b.username });
    await b.client.ok('POST', `/friends/${a.id}/accept`);
    const { trade } = await a.client.ok<{ trade: { id: string } }>('POST', '/trades', { toUsername: b.username, offer: [ma.id], request: [mb.id] });
    await a.client.ok('POST', `/trades/${trade.id}/confirm`);
    expect((await a.client.call('POST', `/trades/${trade.id}/confirm`)).status).toBe(400); // must wait for B
    await b.client.ok('POST', `/trades/${trade.id}/confirm`);
    await a.client.ok('POST', `/trades/${trade.id}/confirm`);
    const last = await b.client.ok<{ state: string }>('POST', `/trades/${trade.id}/confirm`);
    expect(last.state).toBe('completed');
    expect((await prisma.monster.findUniqueOrThrow({ where: { id: ma.id } })).ownerId).toBe(b.id);
    expect((await prisma.monster.findUniqueOrThrow({ where: { id: mb.id } })).ownerId).toBe(a.id);
  });
});
