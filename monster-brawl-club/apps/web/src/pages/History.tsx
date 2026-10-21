import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FightView } from '@mbc/shared';
import { MonsterArt } from '../art/MonsterArt';
import { STAKE_INFO } from '../components/stakes';
import { Empty, Loading, Panel, Title } from '../components/ui';
import { get } from '../lib/api';
import { useMe } from '../lib/session';

export function History() {
  const me = useMe();
  const [fights, setFights] = useState<FightView[] | null>(null);
  useEffect(() => void get<{ fights: FightView[] }>('/fights').then(r => setFights(r.fights)), []);
  if (!fights) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl">
      <Title>📜 Fight history</Title>
      {fights.length === 0 ? <Empty>No fights yet!</Empty> : (
        <div className="space-y-2">
          {fights.map(f => {
            const side = f.a.userId === me.id ? 'A' : 'B';
            const mine = side === 'A' ? f.a : f.b;
            const opp = side === 'A' ? f.b : f.a;
            const won = f.result?.winnerSide === side;
            return (
              <Link key={f.id} to={`/fight/${f.id}`} className="panel flex items-center gap-3 !p-2 hover:-translate-y-0.5">
                <span className="text-3xl">{won ? '🏆' : '💥'}</span>
                <div className="w-12"><MonsterArt parts={mine.monster.parts} palette={mine.monster.palette} /></div>
                <div className="flex-1">
                  <div className="font-display">{mine.monster.name} vs {opp.monster.name}</div>
                  <div className="text-xs">{opp.isBot ? '🤖 ' : ''}{opp.username} · {f.kind}{mine.stake && mine.stake !== 'none' ? ` · ${STAKE_INFO[mine.stake].label}` : ''} · {new Date(f.createdAt).toLocaleString()}</div>
                </div>
                <div className="w-12"><MonsterArt parts={opp.monster.parts} palette={opp.monster.palette} flip /></div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
