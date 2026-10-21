import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { STRATEGIES, type MonsterCard as Card } from '@mbc/shared';
import { MonsterArt } from '../art/MonsterArt';
import { isFree, MonsterCard } from '../components/MonsterCard';
import { SkillBars, STRATEGY_INFO } from '../components/strategy';
import { Button, Empty, Loading, Modal, Title } from '../components/ui';
import { get, post } from '../lib/api';
import { useMe, useSession } from '../lib/session';

export function useMyMonsters() {
  const [data, setData] = useState<{ alive: Card[]; graveyard: Card[] } | null>(null);
  const load = useCallback(async () => setData(await get<{ alive: Card[]; graveyard: Card[] }>('/monsters')), []);
  useEffect(() => void load(), [load]);
  return { data, reload: load };
}

export function MonsterDetail({ m, onClose, onChanged }: { m: Card; onClose: () => void; onChanged: () => void }) {
  const { run } = useSession();
  const navigate = useNavigate();
  return (
    <Modal open onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
        <div className={`rounded-2xl border-[3px] border-black bg-gradient-to-b from-[#bfe6ff] to-[#e9f7ff] p-4 ${m.sheen ? 'sheen' : ''}`}>
          <MonsterArt parts={m.parts} palette={m.palette} idle />
        </div>
        <div>
          <h2 className="font-display text-3xl">{m.name}</h2>
          <p className="text-sm capitalize opacity-70">{m.rarity}{m.sheen ? ' ✨ shiny' : ''} {m.species} · Level {m.level} · {m.frame} frame</p>
          <div className="my-2 font-display text-4xl text-flame text-outline">💪 {m.strength}</div>
          <SkillBars skills={m.skills} />
          {m.xpToNext !== null && (
            <div className="mt-2 text-xs">XP {m.xp} / {m.xpToNext} to level {m.level + 1}</div>
          )}
          <p className="mt-1 text-sm">Record: {m.wins} wins, {m.losses} losses</p>
          {m.skillPoints > 0 && (
            <div className="mt-3 rounded-xl bg-goo/40 p-2">
              <b>Spend {m.skillPoints} skill point{m.skillPoints > 1 ? 's' : ''}:</b>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {STRATEGIES.map(s => (
                  <button key={s} disabled={m.skills[s] >= 10} className={`btn ${STRATEGY_INFO[s].bg} text-sm`} onClick={async () => {
                    if (await run(() => post(`/monsters/${m.id}/skill`, { strategy: s }))) onChanged();
                  }}>+1 {STRATEGY_INFO[s].icon} {STRATEGY_INFO[s].label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {isFree(m) && <Button size="sm" colour="red" onClick={() => navigate(`/fight?monster=${m.id}`)}>⚔️ Fight</Button>}
            {isFree(m) && <Button size="sm" colour="purple" onClick={() => navigate(`/village/potions?monster=${m.id}`)}>🧪 Potions</Button>}
            {isFree(m) && <Button size="sm" colour="blue" onClick={() => navigate(`/village/dojo?monster=${m.id}`)}>🥋 Dojo</Button>}
            {isFree(m) && <Button size="sm" colour="gold" onClick={() => navigate(`/village/market?sell=${m.id}`)}>🏷️ Sell</Button>}
            <Link to={`/card/${m.id}`} className="btn bg-[#6b7a8f] text-sm">🔗 Public card</Link>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function Monsters() {
  const me = useMe();
  const { data, reload } = useMyMonsters();
  const [open, setOpen] = useState<Card | null>(null);
  if (!data) return <Loading />;
  const current = open ? data.alive.find(m => m.id === open.id) ?? null : null;
  return (
    <div>
      <Title sub={`${data.alive.length} / ${me.collectionLimit} monsters`}>👾 My monsters</Title>
      <div className="mb-4 flex justify-center gap-2">
        <Link to="/builder" className="btn bg-[#3cb371]">🧬 Grow a monster</Link>
        <Link to="/village/graveyard" className="btn bg-[#6b7a8f]">🪦 Graveyard ({data.graveyard.length})</Link>
      </div>
      {data.alive.length === 0 ? (
        <Empty>You don't have any monsters yet. <Link className="font-bold underline" to="/builder">Grow one in the Monster Builder!</Link></Empty>
      ) : (
        <div className="flex flex-wrap justify-center gap-4">
          {data.alive.map(m => <MonsterCard key={m.id} m={m} onClick={() => setOpen(m)} />)}
        </div>
      )}
      {current && <MonsterDetail m={current} onClose={() => setOpen(null)} onChanged={() => void reload()} />}
    </div>
  );
}
