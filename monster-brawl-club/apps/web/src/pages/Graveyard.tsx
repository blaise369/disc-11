import { useState } from 'react';
import { BALANCE, resurrectCost, resurrectedStrength, type MonsterCard as Card } from '@mbc/shared';
import { MonsterCard } from '../components/MonsterCard';
import { Button, Empty, Loading, Modal, Title } from '../components/ui';
import { post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { sfx } from '../lib/sound';
import { useMyMonsters } from './Monsters';

export function Graveyard() {
  const me = useMe();
  const { run, refresh, toast } = useSession();
  const { data, reload } = useMyMonsters();
  const [goodbye, setGoodbye] = useState<Card | null>(null);
  if (!data) return <Loading />;
  return (
    <div>
      <Title sub={`${data.graveyard.length} / ${me.graveyardLimit} spaces. Resurrecting costs 🪙 ${BALANCE.graveyard.resurrectCostPerStrength} per strength and brings a monster back at half strength.`}>🪦 Graveyard</Title>
      {data.graveyard.length === 0 ? <Empty>Nobody here. Let's keep it that way!</Empty> : (
        <div className="flex flex-wrap justify-center gap-4">
          {data.graveyard.map(m => (
            <MonsterCard key={m.id} m={m} footer={
              <div className="mt-1 grid gap-1">
                <Button size="sm" colour="green" disabled={me.nuggets < resurrectCost(m.strength)} onClick={async () => {
                  if (await run(() => post(`/graveyard/${m.id}/resurrect`))) { sfx.win(); toast(`${m.name} is back with ${resurrectedStrength(m.strength)} strength!`, 'good'); await reload(); await refresh(); }
                }}>Resurrect · 🪙 {resurrectCost(m.strength)}</Button>
                <Button size="sm" colour="grey" onClick={() => setGoodbye(m)}>Incinerate · +🪙 {BALANCE.graveyard.incinerateRefund}</Button>
              </div>
            } />
          ))}
        </div>
      )}
      <Modal open={!!goodbye} onClose={() => setGoodbye(null)}>
        <h2 className="font-display text-2xl">Say goodbye to {goodbye?.name}?</h2>
        <p>Incinerating is forever. You get 🪙 {BALANCE.graveyard.incinerateRefund} back.</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button colour="grey" onClick={() => setGoodbye(null)}>Keep</Button>
          <Button colour="red" onClick={async () => {
            if (goodbye && await run(() => post(`/graveyard/${goodbye.id}/incinerate`))) { setGoodbye(null); await reload(); await refresh(); }
          }}>Goodbye</Button>
        </div>
      </Modal>
    </div>
  );
}
