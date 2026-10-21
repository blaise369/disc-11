import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MonsterCard as Card, PlayerProfile } from '@mbc/shared';
import { MonsterCard } from '../components/MonsterCard';
import { Button, Empty, Loading, Panel, Title } from '../components/ui';
import { get, post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { ReportBlock } from './FightScreen';
import { MonsterArt } from '../art/MonsterArt';

export function Player() {
  const { username = '' } = useParams();
  const me = useMe();
  const { run, toast } = useSession();
  const navigate = useNavigate();
  const [p, setP] = useState<PlayerProfile | null>(null);
  const load = useCallback(async () => {
    const r = await run(() => get<{ player: PlayerProfile }>(`/players/${encodeURIComponent(username)}`));
    if (r) setP(r.player);
  }, [username, run]);
  useEffect(() => void load(), [load]);
  if (!p) return <Loading />;
  const self = p.id === me.id;
  return (
    <div className="space-y-4">
      <Title sub={`${p.online ? '🟢 Online' : '⚪ Offline'} · ⭐ Level ${p.profileLevel} · 🗺️ Region ${p.mapRegion} · ${p.wins}W ${p.losses}L`}>{p.username}</Title>
      {!self && (
        <Panel className="flex flex-wrap justify-center gap-2">
          {p.isFriend ? <span className="chip bg-goo">🤝 Friends</span> : p.friendRequest === 'sent' ? <span className="chip bg-white">Request sent</span> : (
            <Button colour="green" size="sm" onClick={async () => { if (await run(() => post('/friends', { username: p.username }))) { toast('Friend request sent!', 'good'); await load(); } }}>
              {p.friendRequest === 'received' ? 'Accept friend request' : 'Add friend'}
            </Button>
          )}
          <Button colour="red" size="sm" disabled={!p.online || p.blockedByMe} onClick={() => navigate(`/fight?opponent=${p.username}`)}>⚔️ Challenge</Button>
          {p.isFriend && <Button colour="blue" size="sm" onClick={() => navigate(`/village/trader?with=${p.username}`)}>🔄 Trade</Button>}
          <ReportBlock username={p.username} />
        </Panel>
      )}
      {p.monsters.length === 0 ? <Empty>No monsters yet.</Empty> : (
        <div className="flex flex-wrap justify-center gap-4">{p.monsters.map(m => <MonsterCard key={m.id} m={m} />)}</div>
      )}
    </div>
  );
}

/** A public monster card page, shareable inside the game. */
export function CardPage() {
  const { id = '' } = useParams();
  const { run } = useSession();
  const [m, setM] = useState<Card | null>(null);
  useEffect(() => { void run(() => get<{ monster: Card }>(`/monsters/${id}`)).then(r => r && setM(r.monster)); }, [id, run]);
  if (!m) return <Loading />;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-64"><MonsterArt parts={m.parts} palette={m.palette} idle /></div>
      <MonsterCard m={m} size="lg" />
      <p className="text-white">Owned by <a className="underline" href={`/player/${m.ownerName}`}>{m.ownerName}</a></p>
    </div>
  );
}
