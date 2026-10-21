import { STRATEGIES, type Strategy } from '@mbc/shared';

export const STRATEGY_INFO: Record<Strategy, { label: string; icon: string; colour: string; bg: string }> = {
  attack: { label: 'Attack', icon: '🗡️', colour: '#e94f37', bg: 'bg-attack' },
  defense: { label: 'Defense', icon: '🛡️', colour: '#2e9be6', bg: 'bg-defense' },
  tricks: { label: 'Tricks', icon: '🌀', colour: '#9b4fe0', bg: 'bg-tricks' },
  brains: { label: 'Brains', icon: '🧠', colour: '#3cb371', bg: 'bg-brains' },
};

/** The rock-paper-scissors cycle: each beats the next. */
export function StrategyCycle({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-1 ${compact ? 'text-xs' : 'text-sm'} font-semibold`}>
      {STRATEGIES.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          <span className="rounded-full border-2 border-black px-2 py-0.5 text-white" style={{ background: STRATEGY_INFO[s].colour }}>
            {STRATEGY_INFO[s].icon} {STRATEGY_INFO[s].label}
          </span>
          {i < STRATEGIES.length - 1 && <span aria-hidden>›</span>}
        </span>
      ))}
      <span className="ml-1 opacity-70">› (each beats the next, Brains beats Attack)</span>
    </div>
  );
}

export function SkillBars({ skills, small }: { skills: Record<Strategy, number>; small?: boolean }) {
  return (
    <div className={`grid gap-1 ${small ? 'text-[10px]' : 'text-xs'}`}>
      {STRATEGIES.map(s => (
        <div key={s} className="flex items-center gap-1">
          <span className="w-4 text-center" title={STRATEGY_INFO[s].label}>{STRATEGY_INFO[s].icon}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-black bg-black/15">
            <div className="h-full" style={{ width: `${skills[s] * 10}%`, background: STRATEGY_INFO[s].colour }} />
          </div>
          <span className="w-4 text-right font-bold">{skills[s]}</span>
        </div>
      ))}
    </div>
  );
}
