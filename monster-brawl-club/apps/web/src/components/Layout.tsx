import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../lib/session';
import { isMuted, setMuted } from '../lib/sound';
import { IncomingChallenge } from './IncomingChallenge';
import { formatDuration, Nuggets, useTick } from './ui';

const NAV = [
  { to: '/map', label: 'Map', icon: '🗺️' },
  { to: '/monsters', label: 'Monsters', icon: '👾' },
  { to: '/fight', label: 'Fight', icon: '⚔️' },
  { to: '/village', label: 'Village', icon: '🏘️' },
  { to: '/friends', label: 'Friends', icon: '🤝' },
];

export function Toasts() {
  const { toasts } = useSession();
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 sm:bottom-6">
      {toasts.map(t => (
        <div key={t.id} role="status" className={`pop-in rounded-xl border-[3px] border-black px-4 py-2 text-center font-semibold shadow-[0_4px_0_#000] ${t.kind === 'error' ? 'bg-attack text-white' : t.kind === 'good' ? 'bg-goo' : 'bg-cream'}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function GameLayout() {
  const { me, logout } = useSession();
  const [muted, setM] = useState(isMuted());
  useTick(1000);
  if (!me) return null;
  return (
    <div className="flex min-h-screen flex-col pb-20 sm:pb-0">
      <header className="sticky top-0 z-40 border-b-[3px] border-black bg-night/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
          <NavLink to="/map" className="font-display text-xl leading-none text-nugget text-outline sm:text-2xl">
            Monster<span className="text-flame">Brawl</span>Club
          </NavLink>
          <nav className="ml-4 hidden gap-1 sm:flex">
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `rounded-lg px-3 py-1 font-display tracking-wide ${isActive ? 'bg-nugget text-ink' : 'text-white hover:bg-white/10'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="chip bg-nugget" data-testid="nuggets"><Nuggets n={me.nuggets} /></span>
            <span className="chip bg-cream" title={me.energy < me.energyMax ? `Next energy in ${formatDuration(me.nextEnergyMs)}` : 'Full energy'}>⚡ {me.energy}/{me.energyMax}</span>
            <span className="chip hidden bg-cream sm:inline" title="Profile level">⭐ {me.profileLevel}</span>
            <button className="chip bg-cream" onClick={() => { setMuted(!muted); setM(!muted); }} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
            <button className="chip hidden bg-cream sm:inline" onClick={() => void logout()}>Log out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-[3px] border-black bg-night sm:hidden">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex flex-col items-center py-1.5 text-xs font-semibold ${isActive ? 'text-nugget' : 'text-white/80'}`}>
            <span className="text-xl">{n.icon}</span>{n.label}
          </NavLink>
        ))}
      </nav>
      <IncomingChallenge />
    </div>
  );
}
