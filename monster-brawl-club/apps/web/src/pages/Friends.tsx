import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlayerSummary } from '@mbc/shared';
import { Button, Empty, Loading, Panel, Title } from '../components/ui';
import { del, get, post } from '../lib/api';
import { useSession } from '../lib/session';

export function Friends() {
  const { run, toast } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<{ friends: PlayerSummary[]; incoming: PlayerSummary[]; outgoing: PlayerSummary[] } | null>(null);
  const [blocks, setBlocks] = useState<PlayerSummary[]>([]);
  const [name, setName] = useState('');
  const load = useCallback(async () => {
    setData(await get('/friends'));
    setBlocks((await get<{ blocks: PlayerSummary[] }>('/blocks')).blocks);
  }, []);
  useEffect(() => void load(), [load]);
  if (!data) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Title>🤝 Friends</Title>
      <Panel>
        <form className="flex gap-2" onSubmit={async e => {
          e.preventDefault();
          if (await run(() => post('/friends', { username: name.trim() }))) { toast('Friend request sent!', 'good'); setName(''); await load(); }
        }}>
          <input className="min-w-0 flex-1 rounded-xl border-[3px] border-black bg-white px-3 py-2" placeholder="Their username, e.g. BraveBadger42" value={name} onChange={e => setName(e.target.value)} aria-label="Friend username" />
          <Button type="submit" colour="green">Add friend</Button>
        </form>
      </Panel>
      {data.incoming.length > 0 && (
        <Panel>
          <h2 className="font-display text-xl">Friend requests</h2>
          {data.incoming.map(p => (
            <div key={p.id} className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white p-2">
              <b>{p.username}</b>
              <div className="flex gap-2">
                <Button size="sm" colour="green" onClick={async () => { await run(() => post(`/friends/${p.id}/accept`)); await load(); }}>Accept</Button>
                <Button size="sm" colour="grey" onClick={async () => { await run(() => del(`/friends/${p.id}`)); await load(); }}>No thanks</Button>
              </div>
            </div>
          ))}
        </Panel>
      )}
      <Panel>
        <h2 className="font-display text-xl">My friends</h2>
        {data.friends.length === 0 ? <Empty>No friends yet. Add someone you know by their username!</Empty> : data.friends.map(p => (
          <div key={p.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2">
            <Link to={`/player/${p.username}`} className="font-bold underline">{p.online ? '🟢' : '⚪'} {p.username}</Link>
            <span className="text-sm">⭐ {p.profileLevel} · 🗺️ {p.mapRegion}</span>
            <div className="flex gap-2">
              <Button size="sm" colour="red" disabled={!p.online} onClick={() => navigate(`/fight?opponent=${p.username}`)}>Challenge</Button>
              <Button size="sm" colour="blue" onClick={() => navigate(`/village/trader?with=${p.username}`)}>Trade</Button>
            </div>
          </div>
        ))}
        {data.outgoing.length > 0 && <p className="mt-2 text-sm opacity-70">Waiting for: {data.outgoing.map(p => p.username).join(', ')}</p>}
      </Panel>
      <Panel>
        <h2 className="font-display text-xl">Blocked</h2>
        {blocks.length === 0 ? <p className="text-sm opacity-70">Nobody.</p> : blocks.map(b => (
          <div key={b.id} className="mt-1 flex items-center justify-between">
            <span>{b.username}</span>
            <button className="underline" onClick={async () => { await run(() => del(`/blocks/${b.id}`)); await load(); }}>Unblock</button>
          </div>
        ))}
      </Panel>
    </div>
  );
}
