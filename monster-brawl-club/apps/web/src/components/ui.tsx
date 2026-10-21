import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { sfx } from '../lib/sound';

const COLOURS = {
  orange: 'bg-flame',
  green: 'bg-[#3cb371]',
  blue: 'bg-defense',
  red: 'bg-attack',
  purple: 'bg-tricks',
  grey: 'bg-[#6b7a8f]',
  gold: 'bg-nugget !text-ink',
} as const;

export function Button({ colour = 'orange', size = 'md', className = '', onClick, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  colour?: keyof typeof COLOURS;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sz = size === 'sm' ? 'text-sm !px-3 !py-1' : size === 'lg' ? 'text-2xl !px-6 !py-3' : 'text-lg';
  return (
    <button
      {...rest}
      className={`btn ${COLOURS[colour]} ${sz} ${className}`}
      onClick={e => {
        sfx.click();
        onClick?.(e);
      }}
    />
  );
}

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`panel p-4 ${className}`}>{children}</div>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 text-center">
      <h1 className="font-display text-outline text-3xl text-white sm:text-4xl">{children}</h1>
      {sub && <div className="mt-1 text-[#e8dcff]">{sub}</div>}
    </div>
  );
}

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f051e]/70 p-4" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`panel pop-in max-h-[92vh] w-full overflow-y-auto p-5 ${wide ? 'max-w-3xl' : 'max-w-lg'}`} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

export function Nuggets({ n, className = '' }: { n: number; className?: string }) {
  return <span className={`inline-flex items-center gap-1 font-semibold ${className}`}>🪙 {n.toLocaleString()}</span>;
}

export function Loading({ text = 'Loading...' }: { text?: string }) {
  return <div className="py-10 text-center font-display text-xl text-white/80">{text}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border-2 border-dashed border-ink/30 p-6 text-center text-ink/70">{children}</div>;
}

/** Seconds left until a ms-epoch deadline, ticking every 250ms. */
export function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

/** Re-render every second (for growth and dojo timers). */
export function useTick(ms = 1000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN(x => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h) return `${h}h ${m % 60}m`;
  if (m) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-4 flex flex-wrap justify-center gap-2">
      {tabs.map(t => (
        <button key={t.id} onClick={() => { sfx.click(); onChange(t.id); }}
          className={`rounded-xl border-[3px] border-black px-4 py-1.5 font-display text-lg shadow-[0_4px_0_#000] ${value === t.id ? 'bg-nugget' : 'bg-cream'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}
