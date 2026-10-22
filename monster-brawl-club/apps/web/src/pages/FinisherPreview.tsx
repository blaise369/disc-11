import { useMemo, useState } from 'react';
import { SPECIES, type MonsterCard as Card, type MonsterPalette, type MonsterParts, type Variant } from '@mbc/shared';
import { Finisher, type FighterLook, type Outcome } from '../components/finishers/Finisher';
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

const LOOK = { eyes: 'googly', mouth: 'fangs', head: 'devil-horns', arms: 'claws', legs: 'feet', pattern: 'plain' } as const;
const OUTCOMES: { id: Outcome['kind']; label: string }[] = [
  { id: 'eat', label: '😋 Eat' }, { id: 'bite', label: '🦷 Bite' }, { id: 'collect', label: '🎒 Collect' }, { id: 'ko', label: '🎯 Practice K.O.' },
];

/** Watch every finishing move with every stake ending. Not linked from the game; open /finishers. */
export function FinisherPreview() {
  const [species, setSpecies] = useState('slime');
  const [kind, setKind] = useState<Outcome['kind']>('eat');
  const [winnerLeft, setWinnerLeft] = useState(true);
  const [run, setRun] = useState(0);
  const [arena, setArena] = useState<HTMLDivElement | null>(null);
  const [left, setLeft] = useState<HTMLDivElement | null>(null);
  const [right, setRight] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'playing' | 'done'>('playing');
  const winner = useMemo(() => fakeCard('w', 'Winner', { ...LOOK, species }, { body: 6, accent: 2 }), [species]);
  const loser = useMemo(() => fakeCard('l', 'Loser', { ...LOOK, species: 'beast', eyes: 'sleepy', mouth: 'grin' }, { body: 9, accent: 3 }), []);
  const looks = useMemo(() => {
    const look = (m: Card): FighterLook => ({ parts: m.parts, palette: m.palette, variant: m.variant });
    return { winner: look(winner), loser: look(loser) };
  }, [winner, loser]);
  const outcome = useMemo<Outcome>(() => (kind === 'bite' ? { kind, amount: 8 } : { kind }), [kind]);
  const [a, b] = winnerLeft ? [winner, loser] : [loser, winner];
  const replay = () => { setStatus('playing'); setRun(r => r + 1); };
  const playing = status === 'playing';

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <h1 className="font-display text-outline text-center text-3xl text-white">Finisher preview</h1>
      <div className="flex flex-wrap justify-center gap-2">
        {SPECIES.map(s => (
          <button key={s.id} data-testid={`finisher-${s.id}`} onClick={() => { setSpecies(s.id); replay(); }}
            className={`chip !py-1 ${species === s.id ? 'bg-nugget' : 'bg-white'}`}>{s.name}: {FINISHERS[s.id]?.name}</button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {OUTCOMES.map(o => (
          <button key={o.id} data-testid={`outcome-${o.id}`} onClick={() => { setKind(o.id); replay(); }}
            className={`chip !py-1 ${kind === o.id ? 'bg-nugget' : 'bg-white'}`}>{o.label}</button>
        ))}
        <button className="chip bg-cream !py-1" onClick={() => { setWinnerLeft(w => !w); replay(); }}>⇄ Swap sides</button>
        <button className="chip bg-goo !py-1" onClick={replay}>↻ Replay</button>
      </div>
      <div ref={setArena} className="relative overflow-hidden rounded-3xl border-4 border-black bg-gradient-to-b from-[#ff9a5a] via-[#ffcf7a] to-[#c27a3a] p-3 shadow-[0_6px_0_#000]" style={{ height: 400 }}>
        <div className="flex h-full items-start justify-between px-[6%] pt-2">
          <div ref={setLeft}><MonsterCard m={a} size="sm" artHidden={playing} /></div>
          <div ref={setRight}><MonsterCard m={b} size="sm" flip artHidden={playing} /></div>
        </div>
        {arena && left && right && (
          <Finisher key={`${run}-${species}-${kind}-${winnerLeft}`} arena={arena}
            winnerCard={winnerLeft ? left : right} loserCard={winnerLeft ? right : left}
            winner={looks.winner} loser={looks.loser} outcome={outcome} onDone={() => setStatus('done')} />
        )}
      </div>
      <p className="text-center text-white" data-testid="finisher-status">{playing ? 'Playing...' : 'Done!'}</p>
    </div>
  );
}
