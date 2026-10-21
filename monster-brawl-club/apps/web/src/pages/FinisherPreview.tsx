import { useMemo, useState } from 'react';
import { SPECIES, type MonsterCard as Card, type MonsterPalette, type MonsterParts, type Variant } from '@mbc/shared';
import { Finisher } from '../components/finishers/Finisher';
import { FINISHERS } from '../components/finishers/finishers';
import { MonsterCard } from '../components/MonsterCard';

function fakeCard(id: string, name: string, parts: MonsterParts, palette: MonsterPalette, variant: Variant = 'normal'): Card {
  return {
    id, ownerId: 'x', ownerName: 'Preview', name, species: parts.species, parts, palette, strength: 80, power: 80,
    skills: { attack: 5, defense: 4, tricks: 3, brains: 4 }, skillPoints: 0, level: 3, xp: 0, xpToNext: 80,
    rarity: 'rare', variant, status: 'alive', wins: 3, losses: 1, frame: 'bronze', growingUntil: null,
    locked: false, dojoUntil: null, dojoReward: null, listed: false, potions: [], isBot: false,
  };
}

const LOOK = { eyes: 'googly', mouth: 'fangs', head: 'devil-horns', arms: 'claws', legs: 'feet', pattern: 'belly' } as const;

/** Watch every finishing move. Not linked from the game; open /finishers. */
export function FinisherPreview() {
  const [species, setSpecies] = useState('slime');
  const [winnerLeft, setWinnerLeft] = useState(true);
  const [run, setRun] = useState(0);
  const [arena, setArena] = useState<HTMLDivElement | null>(null);
  const [left, setLeft] = useState<HTMLDivElement | null>(null);
  const [right, setRight] = useState<HTMLDivElement | null>(null);
  const [finished, setFinished] = useState(false);
  const winner = useMemo(() => fakeCard('w', 'Winner', { ...LOOK, species }, { body: 6, accent: 2 }), [species]);
  const loser = useMemo(() => fakeCard('l', 'Loser', { ...LOOK, species: 'furball', eyes: 'sleepy', mouth: 'grin' }, { body: 9, accent: 3 }), []);
  const [a, b] = winnerLeft ? [winner, loser] : [loser, winner];
  const ready = arena && left && right;

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <h1 className="font-display text-outline text-center text-3xl text-white">Finisher preview</h1>
      <div className="flex flex-wrap justify-center gap-2">
        {SPECIES.map(s => (
          <button key={s.id} data-testid={`finisher-${s.id}`} onClick={() => { setSpecies(s.id); setFinished(false); setRun(r => r + 1); }}
            className={`chip !py-1 ${species === s.id ? 'bg-nugget' : 'bg-white'}`}>{s.name}: {FINISHERS[s.id]?.name}</button>
        ))}
        <button className="chip bg-cream !py-1" onClick={() => { setWinnerLeft(w => !w); setFinished(false); setRun(r => r + 1); }}>⇄ Swap sides</button>
        <button className="chip bg-goo !py-1" onClick={() => { setFinished(false); setRun(r => r + 1); }}>↻ Replay</button>
      </div>
      <div ref={setArena} className="relative overflow-hidden rounded-3xl border-4 border-black bg-gradient-to-b from-[#ff9a5a] via-[#ffcf7a] to-[#c27a3a] p-3 shadow-[0_6px_0_#000]" style={{ height: 380 }}>
        <div className="flex h-full items-end justify-between px-[8%] pb-2">
          <div key={`l${run}`} ref={setLeft}><MonsterCard m={a} size="sm" /></div>
          <div className="mb-20 font-display text-5xl text-white text-outline">VS</div>
          <div key={`r${run}`} ref={setRight}><MonsterCard m={b} size="sm" flip /></div>
        </div>
        {ready && (
          <Finisher key={`${run}-${species}-${winnerLeft}`} arena={arena} winnerEl={winnerLeft ? left : right} loserEl={winnerLeft ? right : left}
            species={species} palette={winner.palette} onDone={() => setFinished(true)} />
        )}
      </div>
      <p className="text-center text-white" data-testid="finisher-status">{finished ? 'Done!' : 'Playing...'}</p>
    </div>
  );
}
