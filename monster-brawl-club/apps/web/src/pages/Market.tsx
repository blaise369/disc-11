import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BALANCE, listingFee, type MonsterCard as Card } from '@mbc/shared';
import { isFree, MonsterCard } from '../components/MonsterCard';
import { Button, Empty, Loading, Panel, Tabs, Title } from '../components/ui';
import { get, post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { sfx } from '../lib/sound';
import { useMyMonsters } from './Monsters';

interface Listing { id: string; price: number; sellerId: string; monster: Card }

export function Market() {
  const me = useMe();
  const { run, refresh, toast } = useSession();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'buy' | 'sell'>(params.get('sell') ? 'sell' : 'buy');
  const [listings, setListings] = useState<Listing[] | null>(null);
  const { data, reload } = useMyMonsters();
  const [sel, setSel] = useState<string | null>(params.get('sell'));
  const [price, setPrice] = useState(100);
  const load = useCallback(async () => setListings((await get<{ listings: Listing[] }>('/market')).listings), []);
  useEffect(() => void load(), [load]);
  if (!listings || !data) return <Loading />;

  const free = data.alive.filter(isFree);
  const m = free.find(x => x.id === sel) ?? free[0];
  const mine = listings.filter(l => l.sellerId === me.id);
  const others = listings.filter(l => l.sellerId !== me.id);
  return (
    <div>
      <Title sub={`Listing costs a ${BALANCE.market.listingFee * 100}% fee, paid up front.`}>🏪 Market</Title>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'buy', label: '🛒 Buy' }, { id: 'sell', label: '🏷️ Sell' }]} />
      {tab === 'buy' ? (
        others.length === 0 ? <Empty>Nothing for sale right now.</Empty> : (
          <div className="flex flex-wrap justify-center gap-4">
            {others.map(l => (
              <MonsterCard key={l.id} m={{ ...l.monster, listed: false }} footer={
                <Button size="sm" colour="gold" className="mt-1 w-full" disabled={me.nuggets < l.price} onClick={async () => {
                  if (await run(() => post(`/market/${l.id}/buy`))) { sfx.win(); toast(`${l.monster.name} joined your collection!`, 'good'); await load(); await refresh(); }
                }}>Buy · 🪙 {l.price}</Button>
              } />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {mine.length > 0 && (
            <Panel>
              <h2 className="font-display text-xl">Your listings</h2>
              <div className="mt-2 flex flex-wrap gap-3">
                {mine.map(l => (
                  <MonsterCard key={l.id} m={l.monster} size="sm" footer={
                    <Button size="sm" colour="grey" className="mt-1 w-full" onClick={async () => {
                      if (await run(() => post(`/market/${l.id}/cancel`))) { await load(); await reload(); }
                    }}>Take down (🪙 {l.price})</Button>
                  } />
                ))}
              </div>
            </Panel>
          )}
          <Panel className="space-y-3">
            <h2 className="font-display text-xl">List a monster</h2>
            {free.length === 0 ? <Empty>No monsters free to sell.</Empty> : (
              <>
                <div className="flex gap-3 overflow-x-auto pb-2">{free.map(x => <MonsterCard key={x.id} m={x} size="sm" selected={x.id === m?.id} onClick={() => setSel(x.id)} />)}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="font-display">Price 🪙</label>
                  <input type="number" min={BALANCE.market.minPrice} value={price} onChange={e => setPrice(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="w-32 rounded-xl border-[3px] border-black bg-white px-3 py-2" aria-label="Price" />
                  <span className="text-sm">Fee: 🪙 {listingFee(price)}</span>
                  <Button colour="gold" disabled={!m || price < BALANCE.market.minPrice} onClick={async () => {
                    if (m && await run(() => post('/market/list', { monsterId: m.id, price }))) { toast(`${m.name} is for sale!`, 'good'); await load(); await reload(); await refresh(); }
                  }}>List {m?.name}</Button>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
