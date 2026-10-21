import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BALANCE, type MonsterCard as Card } from '@mbc/shared';
import { isFree, MonsterCard } from '../components/MonsterCard';
import { Button, Empty, Loading, Panel, Title } from '../components/ui';
import { get, post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { sfx } from '../lib/sound';
import { useMyMonsters } from './Monsters';

export function Dojo() {
  const me = useMe();
  const { run, refresh, toast } = useSession();
  const [params] = useSearchParams();
  const { data, reload } = useMyMonsters();
  const [dojo, setDojo] = useState<{ slots: number; training: Card[]; unlocked: boolean } | null>(null);
  const [sel, setSel] = useState<string | null>(params.get('monster'));
  const [reward, setReward] = useState<'skill' | 'strength'>('skill');
  const load = useCallback(async () => { setDojo(await get('/dojo')); await reload(); }, [reload]);
  useEffect(() => void load(), [load]);
  if (!data || !dojo) return <Loading />;
  if (!dojo.unlocked) return <Empty>🔒 The dojo opens at profile level {BALANCE.profileUnlocks.dojoLevel}. You are level {me.profileLevel}. Keep fighting!</Empty>;

  const free = data.alive.filter(isFree);
  const m = free.find(x => x.id === sel) ?? free[0];
  const slotsLeft = dojo.slots - dojo.training.length;
  return (
    <div className="space-y-4">
      <Title sub={`A ${BALANCE.dojo.minutes}-minute session costs 🪙 ${BALANCE.dojo.cost} and gives +${BALANCE.dojo.xp} XP.`}>🥋 Dojo</Title>
      <Panel>
        <h2 className="font-display text-xl">Training now ({dojo.training.length}/{dojo.slots} slots)</h2>
        {dojo.training.length === 0 ? <p className="text-sm opacity-70">Nobody is training.</p> : (
          <div className="mt-2 flex flex-wrap gap-3">
            {dojo.training.map(t => {
              const ready = new Date(t.dojoUntil!).getTime() <= Date.now();
              return (
                <MonsterCard key={t.id} m={t} size="sm" footer={
                  <Button size="sm" colour="green" className="mt-1 w-full" disabled={!ready} onClick={async () => {
                    if (await run(() => post('/dojo/collect', { monsterId: t.id }))) { sfx.win(); toast(`${t.name} finished training!`, 'good'); await load(); await refresh(); }
                  }}>{ready ? 'Collect' : 'Training...'}</Button>
                } />
              );
            })}
          </div>
        )}
      </Panel>
      {slotsLeft > 0 && (
        <Panel className="space-y-3">
          <h2 className="font-display text-xl">Start a session</h2>
          {free.length === 0 ? <Empty>No monsters free right now.</Empty> : (
            <>
              <div className="flex gap-3 overflow-x-auto pb-2">{free.map(x => <MonsterCard key={x.id} m={x} size="sm" selected={x.id === m?.id} onClick={() => setSel(x.id)} />)}</div>
              <div className="flex flex-wrap gap-2">
                <button className={`chip !py-2 ${reward === 'skill' ? 'bg-nugget' : 'bg-white'}`} onClick={() => setReward('skill')}>🎓 +1 skill point</button>
                <button className={`chip !py-2 ${reward === 'strength' ? 'bg-nugget' : 'bg-white'}`} onClick={() => setReward('strength')}>💪 +3% strength</button>
              </div>
              <Button colour="blue" disabled={!m || me.nuggets < BALANCE.dojo.cost} onClick={async () => {
                if (m && await run(() => post('/dojo/start', { monsterId: m.id, reward }))) { sfx.coin(); await load(); await refresh(); }
              }}>Train {m?.name} · 🪙 {BALANCE.dojo.cost}</Button>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
