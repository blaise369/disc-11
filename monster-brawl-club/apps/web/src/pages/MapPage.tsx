import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Me, Mission, MonsterCard as Card, Region } from '@mbc/shared';
import { MonsterCard } from '../components/MonsterCard';
import { Button, Loading, Panel } from '../components/ui';
import { get, post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { sfx } from '../lib/sound';

type MissionRow = Mission & { progress: number; claimed: boolean };

const REGION_COLOURS = ['#7a5230', '#8a6a3a', '#3f7a4a', '#2f8a3a', '#8a7a6a', '#4a3a6a', '#7a5a4a', '#bfe6ff', '#e0562f', '#ffd23f'];

export function MapPage() {
  const me = useMe();
  const { run, setMe, toast, refresh } = useSession();
  const navigate = useNavigate();
  const [map, setMap] = useState<{ mapRegion: number; regions: Region[]; bosses: Card[] } | null>(null);
  const [missions, setMissions] = useState<MissionRow[]>([]);

  const load = useCallback(async () => {
    const [m, ms] = await Promise.all([get<typeof map>('/map'), get<{ missions: MissionRow[] }>('/missions')]);
    setMap(m);
    setMissions(ms.missions);
  }, []);
  useEffect(() => void load(), [load]);
  if (!map) return <Loading />;

  const boss = map.bosses.find(b => b.name === map.regions[map.mapRegion - 1]?.boss.name);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Panel className="!p-0 overflow-hidden">
        <div className="bg-ink px-4 py-2 font-display text-xl text-white">🗺️ The Brawl Map</div>
        <ol className="flex flex-col-reverse">
          {map.regions.map(r => {
            const here = r.id === map.mapRegion;
            const locked = r.id > map.mapRegion;
            return (
              <li key={r.id} className="relative flex items-center gap-3 border-b-2 border-black/30 px-4 py-3" style={{ background: `linear-gradient(90deg, ${REGION_COLOURS[r.id - 1]}cc, ${REGION_COLOURS[r.id - 1]}55)` }}>
                <span className={`flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-black font-display text-lg ${here ? 'bg-nugget pulse-soft' : locked ? 'bg-black/40 text-white/60' : 'bg-goo'}`}>{locked ? '🔒' : r.id}</span>
                <div className="flex-1 text-white text-outline">
                  <div className="font-display text-lg">{r.name}</div>
                  <div className="text-xs">Strength {r.minStrength}–{r.maxStrength >= 100000 ? '∞' : r.maxStrength} · Boss: {r.boss.name} ({r.boss.strength})</div>
                </div>
                {here && <span className="chip bg-nugget">You are here</span>}
                {r.id < map.mapRegion && <span className="chip bg-goo">Boss beaten ✓</span>}
              </li>
            );
          })}
        </ol>
      </Panel>
      <div className="space-y-4">
        {me.dailyRewardAvailable && (
          <Panel className="pop-in text-center">
            <div className="text-4xl">🎁</div>
            <Button colour="gold" onClick={async () => {
              const r = await run(() => post<{ me: Me; amount: number }>('/daily'));
              if (r) { setMe(r.me); sfx.coin(); toast(`+${r.amount} nuggets! Come back tomorrow for more.`, 'good'); }
            }}>Claim daily nuggets</Button>
          </Panel>
        )}
        {boss && (
          <Panel className="text-center">
            <h2 className="font-display text-xl">👑 Region boss</h2>
            <div className="my-2 flex justify-center"><MonsterCard m={boss} size="sm" flip /></div>
            <p className="text-sm">Beat {boss.name} to move up to the next region!</p>
            <Button colour="red" className="mt-2" onClick={() => navigate('/fight?mode=boss')}>Challenge the boss</Button>
          </Panel>
        )}
        <Panel>
          <h2 className="font-display text-xl">📜 Daily missions</h2>
          <ul className="mt-2 space-y-2">
            {missions.map(m => (
              <li key={m.id} className="rounded-xl bg-white p-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{m.text}</span><span>🪙 {m.reward}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-black bg-black/10">
                    <div className="h-full bg-goo" style={{ width: `${(100 * m.progress) / m.goal}%` }} />
                  </div>
                  {m.claimed ? <span className="text-xs">✅</span> : m.progress >= m.goal ? (
                    <Button size="sm" colour="gold" onClick={async () => {
                      const r = await run(() => post(`/missions/${m.id}/claim`));
                      if (r) { sfx.coin(); await load(); await refresh(); }
                    }}>Claim</Button>
                  ) : <span className="text-xs">{m.progress}/{m.goal}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="text-center text-sm">
          New here? <Link className="font-bold underline" to="/builder">Grow your first monster</Link>, then <Link className="font-bold underline" to="/fight">fight</Link>!
        </Panel>
      </div>
    </div>
  );
}
