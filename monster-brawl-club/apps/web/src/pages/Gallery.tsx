import { PART_SLOTS, PALETTE, randomLook, SPECIES, type MonsterParts } from '@mbc/shared';
import { MonsterArt } from '../art/MonsterArt';

const BASE: MonsterParts = { species: 'furball', eyes: 'googly', mouth: 'grin', head: 'none', arms: 'stubby', legs: 'stumpy', pattern: 'plain' };

/** Every part on one page, for checking the art. Not linked from the game. */
export function Gallery() {
  const rows: { label: string; parts: MonsterParts[] }[] = [
    { label: 'Species', parts: SPECIES.map(s => ({ ...BASE, species: s.id })) },
    ...(['eyes', 'mouth', 'head', 'arms', 'legs', 'pattern'] as const).map(slot => ({
      label: slot, parts: PART_SLOTS[slot].map(p => ({ ...BASE, species: 'beast', [slot]: p.id })),
    })),
  ];
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const randoms = Array.from({ length: 16 }, () => randomLook(rng, true));
  return (
    <div className="space-y-4 p-4">
      {rows.map(r => (
        <div key={r.label} className="panel p-3">
          <h2 className="font-display text-xl">{r.label}</h2>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
            {r.parts.map((p, i) => <MonsterArt key={i} parts={p} palette={{ body: (i * 3) % PALETTE.length, accent: (i * 5 + 2) % PALETTE.length }} />)}
          </div>
        </div>
      ))}
      <div className="panel p-3">
        <h2 className="font-display text-xl">Random</h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {randoms.map((l, i) => <MonsterArt key={i} parts={l.parts} palette={l.palette} ko={i === 15} flip={i % 2 === 1} />)}
        </div>
      </div>
    </div>
  );
}
