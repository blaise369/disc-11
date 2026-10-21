import type { MonsterCard as Card } from '@mbc/shared';
import { MonsterArt } from '../art/MonsterArt';
import { SkillBars } from './strategy';
import { formatDuration, useTick } from './ui';

const FRAMES = {
  bronze: 'from-[#c98a4b] to-[#8a5a2b]',
  silver: 'from-[#e3e8ef] to-[#8d99ab]',
  gold: 'from-[#ffe27a] to-[#d29a00]',
  cosmic: 'from-[#ff7ad9] via-[#7a5cff] to-[#3fd0ff]',
} as const;

const RARITY = {
  common: 'bg-[#b8adc4]',
  rare: 'bg-defense text-white',
  epic: 'bg-tricks text-white',
  legendary: 'bg-nugget',
} as const;

export function MonsterCard({ m, onClick, selected, flip, ko, size = 'md', footer, dim }: {
  m: Card;
  onClick?: (() => void) | undefined;
  selected?: boolean | undefined;
  flip?: boolean | undefined;
  ko?: boolean | undefined;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  dim?: boolean | undefined;
}) {
  useTick(1000);
  const growingMs = m.growingUntil ? new Date(m.growingUntil).getTime() - Date.now() : 0;
  const dojoMs = m.dojoUntil ? new Date(m.dojoUntil).getTime() - Date.now() : 0;
  const w = size === 'sm' ? 'w-36' : size === 'lg' ? 'w-64' : 'w-48';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`${w} shrink-0 rounded-2xl bg-gradient-to-br p-[5px] text-left shadow-[0_5px_0_#000] ${FRAMES[m.frame]} ${selected ? 'ring-4 ring-goo ring-offset-2 ring-offset-night' : ''} ${dim ? 'opacity-50' : ''} ${onClick ? 'cursor-pointer transition hover:-translate-y-1' : ''} border-[3px] border-black`}
      data-testid="monster-card"
    >
      <div className={`rounded-xl bg-cream ${m.sheen ? 'sheen' : ''}`}>
        <div className="flex items-center justify-between gap-1 px-2 pt-1.5">
          <span className="truncate font-display text-sm leading-tight" title={m.name}>{m.name}</span>
          <span className="rounded-md border-2 border-black bg-white px-1 text-[10px] font-bold">Lv{m.level}</span>
        </div>
        <div className="relative mx-auto aspect-square w-[85%]">
          <MonsterArt parts={m.parts} palette={m.palette} flip={flip} ko={ko || m.status === 'graveyard'} idle={!ko} className={m.status === 'graveyard' ? 'opacity-60 grayscale' : ''} />
          <span className={`chip absolute left-0 top-1 text-[10px] capitalize ${RARITY[m.rarity]}`}>{m.rarity}{m.sheen ? ' ✨' : ''}</span>
          {growingMs > 0 && <span className="chip absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-goo text-[10px]">🌱 {formatDuration(growingMs)}</span>}
          {m.dojoUntil && <span className="chip absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-defense text-[10px] text-white">🥋 {dojoMs > 0 ? formatDuration(dojoMs) : 'done!'}</span>}
          {m.locked && <span className="chip absolute bottom-1 right-0 bg-attack text-[10px] text-white">⚔️ fighting</span>}
          {m.listed && <span className="chip absolute bottom-1 right-0 bg-nugget text-[10px]">🏷️ for sale</span>}
        </div>
        <div className="px-2 pb-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase opacity-60">Strength</span>
            <span className="font-display text-2xl leading-none text-flame text-outline">{m.strength}</span>
          </div>
          <SkillBars skills={m.skills} small={size === 'sm'} />
          <div className="mt-1 flex items-center justify-between text-[10px] font-semibold opacity-70">
            <span className="capitalize">{m.species}</span>
            <span>{m.wins}W {m.losses}L</span>
          </div>
          {m.skillPoints > 0 && <div className="mt-1 rounded bg-goo px-1 text-center text-[10px] font-bold">+{m.skillPoints} skill point{m.skillPoints > 1 ? 's' : ''}!</div>}
          {m.potions.length > 0 && <div className="mt-1 text-center text-[10px]">{m.potions.map(p => (p.type === 'luckyCharm' ? '🍀' : '💪')).join(' ')} potion ready</div>}
          {footer}
        </div>
      </div>
    </Tag>
  );
}

/** Ready to fight, train, sell or trade. */
export const isFree = (m: Card) => m.status === 'alive' && !m.growingUntil && !m.locked && !m.dojoUntil && !m.listed;
