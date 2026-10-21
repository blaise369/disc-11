import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BALANCE, type MonsterCard as Card, type PlayerProfile, type PlayerSummary } from '@mbc/shared';
import { isFree, MonsterCard } from '../components/MonsterCard';
import { Button, Empty, Loading, Panel, Title } from '../components/ui';
import { get, post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { sfx } from '../lib/sound';
import { useMyMonsters } from './Monsters';

interface TradeRow {
  id: string; state: string; mine: 'from' | 'to';
  from: PlayerSummary; to: PlayerSummary; fromMonsters: Card[]; toMonsters: Card[];
  fromConfirms: number; toConfirms: number;
}

function Picker({ list, chosen, toggle, flip }: { list: Card[]; chosen: string[]; toggle: (id: string) => void; flip?: boolean }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {list.map(m => <MonsterCard key={m.id} m={m} size="sm" flip={flip} dim={!isFree(m)} selected={chosen.includes(m.id)} onClick={isFree(m) ? () => toggle(m.id) : undefined} />)}
    </div>
  );
}

export function Trader() {
  const me = useMe();
  const { run, toast } = useSession();
  const [params] = useSearchParams();
  const [trades, setTrades] = useState<TradeRow[] | null>(null);
  const [friends, setFriends] = useState<PlayerSummary[]>([]);
  const [friend, setFriend] = useState<PlayerProfile | null>(null);
  const [offer, setOffer] = useState<string[]>([]);
  const [ask, setAsk] = useState<string[]>([]);
  const { data, reload } = useMyMonsters();

  const load = useCallback(async () => {
    setTrades((await get<{ trades: TradeRow[] }>('/trades')).trades);
    setFriends((await get<{ friends: PlayerSummary[] }>('/friends')).friends);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);
  const chooseFriend = useCallback(async (username: string) => {
    const r = await run(() => get<{ player: PlayerProfile }>(`/players/${encodeURIComponent(username)}`));
    if (r) { setFriend(r.player); setAsk([]); }
  }, [run]);
  useEffect(() => { const w = params.get('with'); if (w) void chooseFriend(w); }, [params, chooseFriend]);

  if (!me.unlocks.trader) return <Empty>🔒 The trader opens at profile level {BALANCE.profileUnlocks.traderLevel}. You are level {me.profileLevel}.</Empty>;
  if (!trades || !data) return <Loading />;
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter(x => x !== id) : list.length < BALANCE.trader.maxMonstersPerSide ? [...list, id] : list);

  return (
    <div className="space-y-4">
      <Title sub="Friends only. Both players confirm twice before anything swaps.">🔄 Trader</Title>
      {trades.filter(t => t.state === 'open').map(t => {
        const myConfirms = t.mine === 'from' ? t.fromConfirms : t.toConfirms;
        const theirConfirms = t.mine === 'from' ? t.toConfirms : t.fromConfirms;
        const other = t.mine === 'from' ? t.to : t.from;
        const canConfirm = myConfirms === 0 || (myConfirms === 1 && theirConfirms >= 1);
        return (
          <Panel key={t.id} className="space-y-2">
            <h2 className="font-display text-xl">Trade with {other.username}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div><b>{t.from.username} gives:</b><div className="flex flex-wrap gap-2">{t.fromMonsters.map(m => <MonsterCard key={m.id} m={m} size="sm" />)}{t.fromMonsters.length === 0 && <span className="opacity-60">nothing</span>}</div></div>
              <div><b>{t.to.username} gives:</b><div className="flex flex-wrap gap-2">{t.toMonsters.map(m => <MonsterCard key={m.id} m={m} size="sm" />)}{t.toMonsters.length === 0 && <span className="opacity-60">nothing</span>}</div></div>
            </div>
            <p className="text-sm">You: {'✅'.repeat(myConfirms)}{'⬜'.repeat(2 - myConfirms)} · {other.username}: {'✅'.repeat(theirConfirms)}{'⬜'.repeat(2 - theirConfirms)}</p>
            <div className="flex gap-2">
              <Button colour="green" disabled={!canConfirm} onClick={async () => {
                const r = await run(() => post<{ state: string }>(`/trades/${t.id}/confirm`));
                if (r?.state === 'completed') { sfx.win(); toast('Trade done!', 'good'); await reload(); }
                await load();
              }}>{myConfirms === 0 ? 'Confirm (1 of 2)' : myConfirms === 1 ? (theirConfirms >= 1 ? 'Final confirm (2 of 2)' : 'Waiting for them...') : 'Confirmed'}</Button>
              <Button colour="grey" onClick={async () => { await run(() => post(`/trades/${t.id}/cancel`)); await load(); }}>Cancel</Button>
            </div>
          </Panel>
        );
      })}
      <Panel className="space-y-3">
        <h2 className="font-display text-xl">New trade</h2>
        {friends.length === 0 ? <Empty>Add some friends first!</Empty> : (
          <div className="flex flex-wrap gap-2">{friends.map(f => <button key={f.id} className={`chip !py-1 ${friend?.id === f.id ? 'bg-nugget' : 'bg-white'}`} onClick={() => void chooseFriend(f.username)}>{f.username}</button>)}</div>
        )}
        {friend && (
          <>
            <h3 className="font-display">You give (up to {BALANCE.trader.maxMonstersPerSide})</h3>
            <Picker list={data.alive} chosen={offer} toggle={id => toggle(offer, setOffer, id)} />
            <h3 className="font-display">{friend.username} gives</h3>
            <Picker list={friend.monsters} chosen={ask} toggle={id => toggle(ask, setAsk, id)} flip />
            <Button colour="blue" disabled={offer.length + ask.length === 0} onClick={async () => {
              if (await run(() => post('/trades', { toUsername: friend.username, offer, request: ask }))) { setOffer([]); setAsk([]); toast('Trade offered!', 'good'); await load(); }
            }}>Offer trade</Button>
          </>
        )}
      </Panel>
    </div>
  );
}
