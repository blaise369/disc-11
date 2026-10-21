import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BALANCE, isMonsterNameAllowed, PALETTE, PART_SLOTS, randomLook, skillTotalForTier, SPECIES, STRATEGIES,
  type GrowTier, type MonsterCard as Card, type MonsterPalette, type MonsterParts, type PartDef, type Skills,
} from '@mbc/shared';
import { MonsterArt } from '../art/MonsterArt';
import { MonsterCard } from '../components/MonsterCard';
import { STRATEGY_INFO } from '../components/strategy';
import { Button, Modal, Panel, Tabs, Title } from '../components/ui';
import { post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { sfx } from '../lib/sound';

type Slot = 'species' | keyof typeof PART_SLOTS | 'colours';
const SLOT_TABS: { id: Slot; label: string }[] = [
  { id: 'species', label: 'Body' }, { id: 'eyes', label: 'Eyes' }, { id: 'mouth', label: 'Mouth' }, { id: 'head', label: 'Head' },
  { id: 'arms', label: 'Arms' }, { id: 'legs', label: 'Legs' }, { id: 'pattern', label: 'Pattern' }, { id: 'colours', label: 'Colours' },
];
const TIER_INFO: Record<GrowTier, { name: string; icon: string }> = {
  standard: { name: 'Standard', icon: '🥚' }, super: { name: 'Super', icon: '⭐' }, xtreme: { name: 'Xtreme', icon: '🔥' },
};

const start = randomLook();

export function Builder() {
  const me = useMe();
  const { run, refresh } = useSession();
  const navigate = useNavigate();
  const [parts, setParts] = useState<MonsterParts>(start.parts);
  const [palette, setPalette] = useState<MonsterPalette>(start.palette);
  const [slot, setSlot] = useState<Slot>('species');
  const [name, setName] = useState('');
  const [tier, setTier] = useState<GrowTier>(me.standardGrowAvailable ? 'standard' : 'super');
  const total = skillTotalForTier(tier);
  const even = (t: number): Skills => {
    const base = Math.floor(t / 4), extra = t % 4;
    return { attack: base + (extra > 0 ? 1 : 0), defense: base + (extra > 1 ? 1 : 0), tricks: base + (extra > 2 ? 1 : 0), brains: base };
  };
  const [skills, setSkills] = useState<Skills>(even(total));
  const [grown, setGrown] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const spent = STRATEGIES.reduce((n, s) => n + skills[s], 0);
  const nameOk = isMonsterNameAllowed(name);

  const pickTier = (t: GrowTier) => {
    setTier(t);
    setSkills(even(skillTotalForTier(t)));
  };
  const options: PartDef[] = slot === 'species' ? [...SPECIES] : slot === 'colours' ? [] : [...PART_SLOTS[slot]];
  const tierCost = (t: GrowTier) => BALANCE.growTiers[t].cost;
  const tierDisabled = (t: GrowTier) => (t === 'standard' ? !me.standardGrowAvailable : me.nuggets < tierCost(t));

  const grow = async () => {
    setBusy(true);
    const r = await run(() => post<{ monster: Card }>('/monsters/grow', { name: name.trim(), tier, parts, palette, skills }));
    setBusy(false);
    if (r) {
      sfx.win();
      setGrown(r.monster);
      await refresh();
    }
  };

  return (
    <div>
      <Title sub="Pick parts and colours, spread your skill points, then grow!">🧬 Monster Builder</Title>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel className="flex flex-col items-center gap-3">
          <div className="w-full max-w-sm rounded-2xl border-[3px] border-black bg-gradient-to-b from-[#bfe6ff] to-[#e9f7ff] p-4">
            <MonsterArt parts={parts} palette={palette} idle />
          </div>
          <Button size="sm" colour="purple" onClick={() => { const l = randomLook(Math.random, me.isMember); setParts(l.parts); setPalette(l.palette); }}>🎲 Surprise me</Button>
          <label className="w-full">
            <span className="font-display">Name</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={16} placeholder="e.g. Grubzilla" aria-label="Monster name"
              className={`w-full rounded-xl border-[3px] bg-white px-3 py-2 text-lg ${name && !nameOk ? 'border-attack' : 'border-black'}`} />
            {name && !nameOk && <span className="text-sm text-attack">Try a different name: letters and numbers, 2 to 16 long.</span>}
          </label>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <Tabs tabs={SLOT_TABS} value={slot} onChange={setSlot} />
            {slot === 'colours' ? (
              <div className="space-y-3">
                {(['body', 'accent'] as const).map(k => (
                  <div key={k}>
                    <div className="font-display capitalize">{k === 'body' ? 'Body colour' : 'Detail colour'}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {PALETTE.map((c, i) => (
                        <button key={c} aria-label={`${k} colour ${i + 1}`} onClick={() => setPalette(p => ({ ...p, [k]: i }))}
                          className={`h-9 w-9 rounded-full border-[3px] border-black ${palette[k] === i ? 'ring-4 ring-flame' : ''}`} style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {options.map(p => {
                  const locked = !!p.memberOnly && !me.isMember;
                  const preview = { ...parts, [slot]: p.id } as MonsterParts;
                  const active = parts[slot as keyof MonsterParts] === p.id;
                  return (
                    <button key={p.id} disabled={locked} onClick={() => setParts(preview)} title={locked ? 'Members only' : p.name}
                      className={`relative rounded-xl border-[3px] border-black bg-white p-1 text-[10px] font-semibold ${active ? 'bg-nugget ring-2 ring-flame' : ''} ${locked ? 'opacity-50' : 'hover:-translate-y-0.5'}`}>
                      <MonsterArt parts={preview} palette={palette} />
                      <span className="block truncate">{p.name}</span>
                      {locked && <span className="absolute right-1 top-1">👑</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <h2 className="font-display text-xl">Grow tier</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(Object.keys(TIER_INFO) as GrowTier[]).map(t => {
                const info = BALANCE.growTiers[t];
                return (
                  <button key={t} disabled={tierDisabled(t)} onClick={() => pickTier(t)} data-testid={`tier-${t}`}
                    className={`rounded-xl border-[3px] border-black p-2 text-left shadow-[0_3px_0_#000] ${tier === t ? 'bg-nugget' : 'bg-white'} ${tierDisabled(t) ? 'opacity-40' : ''}`}>
                    <div className="font-display text-lg">{TIER_INFO[t].icon} {TIER_INFO[t].name}</div>
                    <div className="text-xs">
                      {t === 'standard' ? (me.standardGrowAvailable ? 'Free · 1 a day' : 'Used today') : `🪙 ${info.cost}`}
                      <br />Strength {info.strengthMin}–{info.strengthMax} · {info.skillPoints} skill pts
                      <br />{info.growMinutes ? `Grows in ${info.growMinutes >= 60 ? `${info.growMinutes / 60} hour` : `${info.growMinutes} min`}` : 'Ready instantly'}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs opacity-70">Rarity is rolled when it grows: Rare +10%, Epic +25%, Legendary +50% strength. Rare variants boost strength forever: ✨ Shiny ×1.5 (1 in 200), ☢️ Radioactive ×2 (1 in 1,000), 🕳️ Void ×3 (1 in 10,000), 🌟 Celestial ×5 (1 in 100,000)!</p>
          </Panel>

          <Panel>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">Skills</h2>
              <span className={`font-bold ${spent === total ? 'text-brains' : 'text-attack'}`}>{total - spent} points left</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {STRATEGIES.map(s => (
                <div key={s} className="flex items-center gap-2 rounded-xl bg-white p-2">
                  <span className="w-24 font-semibold">{STRATEGY_INFO[s].icon} {STRATEGY_INFO[s].label}</span>
                  <button className="btn bg-[#6b7a8f] !px-2 !py-0" aria-label={`Less ${s}`} disabled={skills[s] <= 1} onClick={() => setSkills(k => ({ ...k, [s]: k[s] - 1 }))}>−</button>
                  <span className="w-6 text-center font-display text-xl">{skills[s]}</span>
                  <button className="btn bg-[#3cb371] !px-2 !py-0" aria-label={`More ${s}`} disabled={skills[s] >= 10 || spent >= total} onClick={() => setSkills(k => ({ ...k, [s]: k[s] + 1 }))}>+</button>
                </div>
              ))}
            </div>
          </Panel>

          <div className="text-center">
            <Button size="lg" colour="green" disabled={busy || !nameOk || spent !== total || tierDisabled(tier)} onClick={() => void grow()} data-testid="grow">
              {TIER_INFO[tier].icon} Grow {name.trim() || 'it'}!
            </Button>
          </div>
        </div>
      </div>

      <Modal open={!!grown} onClose={() => navigate('/monsters')}>
        {grown && (
          <div className="text-center">
            <h2 className="font-display text-3xl text-flame text-outline">It's alive!</h2>
            <div className="pop-in my-3 flex justify-center"><MonsterCard m={grown} size="lg" /></div>
            <p>{grown.growingUntil ? `${grown.name} is still growing. Check back soon!` : `${grown.name} is ready to brawl!`}</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button colour="blue" onClick={() => navigate('/monsters')}>My monsters</Button>
              {!grown.growingUntil && <Button colour="red" onClick={() => navigate(`/fight?monster=${grown.id}`)}>Fight!</Button>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
