import { Link } from 'react-router-dom';
import { BALANCE } from '@mbc/shared';
import { Title } from '../components/ui';
import { useMe } from '../lib/session';

export function Village() {
  const me = useMe();
  const buildings = [
    { to: '/builder', icon: '🧬', name: 'Monster Builder', text: 'Grow new monsters at Standard, Super or Xtreme tier.' },
    { to: '/village/market', icon: '🏪', name: 'Market', text: 'Buy monsters, or list your own for sale.' },
    { to: '/village/trader', icon: '🔄', name: 'Trader', text: 'Swap monsters with friends.', lock: me.unlocks.trader ? null : `Profile level ${BALANCE.profileUnlocks.traderLevel}` },
    { to: '/village/potions', icon: '🧪', name: 'Potion Shop', text: 'Boosts for your next fight, and permanent skill potions.' },
    { to: '/village/dojo', icon: '🥋', name: 'Dojo', text: 'Train a monster while you are away.', lock: me.unlocks.dojo ? null : `Profile level ${BALANCE.profileUnlocks.dojoLevel}` },
    { to: '/village/arcade', icon: '🕹️', name: 'Arcade', text: 'Play Maths Sprint to earn nuggets.' },
    { to: '/village/graveyard', icon: '🪦', name: 'Graveyard', text: 'Bring eaten monsters back, or say goodbye.' },
    { to: '/history', icon: '📜', name: 'Fight History', text: 'Every fight you have had.' },
  ];
  return (
    <div>
      <Title sub="Spend your nuggets to make your monsters stronger.">🏘️ Monster Village</Title>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {buildings.map(b => (
          <Link key={b.to} to={b.lock ? '#' : b.to} aria-disabled={!!b.lock}
            className={`panel block p-4 text-center transition ${b.lock ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-1'}`}>
            <div className="text-5xl">{b.icon}</div>
            <div className="font-display text-xl">{b.name}</div>
            <p className="text-sm">{b.text}</p>
            {b.lock && <span className="chip mt-2 inline-block bg-[#b8adc4]">🔒 {b.lock}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
