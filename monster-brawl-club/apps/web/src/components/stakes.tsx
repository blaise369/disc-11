import type { FightStake, Stake } from '@mbc/shared';

export const STAKE_INFO: Record<FightStake, { label: string; icon: string; win: string; risk: string }> = {
  bite: { label: 'Bite', icon: '🦷', win: "Win: take 10% of their monster's strength.", risk: 'Lose: your monster loses 10% strength. Both players must pick Bite.' },
  collect: { label: 'Collect', icon: '🎒', win: 'Win: their monster joins your collection!', risk: 'Your opponent picks their own stake, so you could still lose yours.' },
  eat: { label: 'Eat', icon: '😋', win: 'Win: your monster eats theirs, +40% strength. Theirs goes to the graveyard.', risk: 'Your opponent picks their own stake, so you could still lose yours.' },
  none: { label: 'Practice', icon: '🎯', win: 'No stake: nobody loses anything.', risk: '' },
};

export function StakePicker({ value, onChange, allowed }: { value: Stake; onChange: (s: Stake) => void; allowed: Stake[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {(['bite', 'collect', 'eat'] as const).map(s => {
        const ok = allowed.includes(s);
        return (
          <button key={s} disabled={!ok} onClick={() => onChange(s)} data-testid={`stake-${s}`}
            className={`rounded-xl border-[3px] border-black p-2 text-left shadow-[0_3px_0_#000] ${value === s ? 'bg-nugget' : 'bg-white'} ${ok ? '' : 'cursor-not-allowed opacity-40'}`}>
            <div className="font-display text-lg">{STAKE_INFO[s].icon} {STAKE_INFO[s].label}</div>
            <div className="text-xs">{STAKE_INFO[s].win}</div>
          </button>
        );
      })}
    </div>
  );
}
