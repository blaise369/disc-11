import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BALANCE, STRATEGIES, type PotionType, type Strategy } from '@mbc/shared';
import { isFree, MonsterCard } from '../components/MonsterCard';
import { STRATEGY_INFO } from '../components/strategy';
import { Button, Empty, Loading, Panel, Title } from '../components/ui';
import { post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { sfx } from '../lib/sound';
import { useMyMonsters } from './Monsters';

const POTIONS: { type: PotionType; icon: string; name: string; text: string }[] = [
  { type: 'strengthBoost', icon: '💪', name: 'Mega Muscle', text: '+10% strength for the next fight.' },
  { type: 'luckyCharm', icon: '🍀', name: 'Lucky Clover', text: '+3% of the wheel for the next fight.' },
  { type: 'skillPlusOne', icon: '🎓', name: 'Smarty Syrup', text: '+1 to a skill, forever (max 10).' },
];

export function Potions() {
  const me = useMe();
  const { run, refresh, toast } = useSession();
  const [params] = useSearchParams();
  const { data, reload } = useMyMonsters();
  const [sel, setSel] = useState<string | null>(params.get('monster'));
  const [skill, setSkill] = useState<Strategy>('attack');
  if (!data) return <Loading />;
  const free = data.alive.filter(isFree);
  const m = free.find(x => x.id === sel) ?? free[0];

  const buy = async (type: PotionType) => {
    if (!m) return;
    const r = await run(() => post('/potions/buy', { monsterId: m.id, type, ...(type === 'skillPlusOne' ? { strategy: skill } : {}) }));
    if (r) { sfx.coin(); toast(`${m.name} drank it!`, 'good'); await reload(); await refresh(); }
  };
  return (
    <div className="space-y-4">
      <Title sub="Potions never stack: one of each fight potion per monster.">🧪 Potion Shop</Title>
      {free.length === 0 ? <Empty>No monsters free right now.</Empty> : (
        <>
          <Panel><div className="flex gap-3 overflow-x-auto pb-2">{free.map(x => <MonsterCard key={x.id} m={x} size="sm" selected={x.id === m?.id} onClick={() => setSel(x.id)} />)}</div></Panel>
          <div className="grid gap-4 md:grid-cols-3">
            {POTIONS.map(p => {
              const cost = BALANCE.potions[p.type].cost;
              return (
                <Panel key={p.type} className="text-center">
                  <div className="text-5xl">{p.icon}</div>
                  <div className="font-display text-xl">{p.name}</div>
                  <p className="text-sm">{p.text}</p>
                  {p.type === 'skillPlusOne' && (
                    <select className="mt-2 rounded-xl border-[3px] border-black bg-white p-1" value={skill} onChange={e => setSkill(e.target.value as Strategy)} aria-label="Skill">
                      {STRATEGIES.map(s => <option key={s} value={s}>{STRATEGY_INFO[s].label} ({m?.skills[s]})</option>)}
                    </select>
                  )}
                  <Button className="mt-2" colour="purple" disabled={me.nuggets < cost} onClick={() => void buy(p.type)}>Buy · 🪙 {cost}</Button>
                </Panel>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
