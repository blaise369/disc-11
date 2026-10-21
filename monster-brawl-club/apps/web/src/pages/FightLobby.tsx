import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BALANCE, type FightView, type MonsterCard as Card, type PlayerProfile, type PlayerSummary, type Stake } from '@mbc/shared';
import { isFree, MonsterCard } from '../components/MonsterCard';
import { STAKE_INFO, StakePicker } from '../components/stakes';
import { StrategyCycle } from '../components/strategy';
import { Button, Empty, Loading, Modal, Panel, Tabs, Title, useCountdown } from '../components/ui';
import { get } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { request } from '../lib/socket';
import { useMyMonsters } from './Monsters';

type Mode = 'practice' | 'boss' | 'pvp';
type NearbyPlayer = PlayerSummary & { friend: boolean; nearby: boolean };

function RoundsPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display">Skill rounds:</span>
      {[0, 1, 2, 3].map(n => (
        <button key={n} onClick={() => onChange(n)} data-testid={`rounds-${n}`} className={`h-10 w-10 rounded-xl border-[3px] border-black font-display text-lg shadow-[0_3px_0_#000] ${value === n ? 'bg-nugget' : 'bg-white'}`}>{n}</button>
      ))}
      <span className="text-xs opacity-70">{value === 0 ? 'Straight to the wheel: pure strength.' : 'Each round you win tilts the wheel your way.'}</span>
    </div>
  );
}

function Waiting({ fightId, onClose }: { fightId: string; onClose: () => void }) {
  const { socket, run } = useSession();
  const [fight, setFight] = useState<FightView | null>(null);
  const left = useCountdown(fight?.deadline ?? null);
  useEffect(() => {
    if (!socket) return;
    void request<'fight:join', { fight: FightView }>(socket, 'fight:join', { fightId }).then(r => setFight(r.fight)).catch(() => undefined);
    const on = (f: FightView) => f.id === fightId && setFight(f);
    socket.on('fight:state', on);
    return () => void socket.off('fight:state', on);
  }, [socket, fightId]);
  const over = fight && (fight.state === 'DECLINED' || fight.state === 'EXPIRED');
  return (
    <Modal open>
      <div className="text-center">
        <div className="text-5xl">{over ? '😴' : '⏳'}</div>
        <h2 className="font-display text-2xl">{over ? (fight.state === 'DECLINED' ? 'Challenge declined' : 'No answer') : 'Challenge sent!'}</h2>
        <p>{over ? 'Try someone else, or practise against a bot.' : `Waiting for ${fight?.b.username ?? 'them'} to accept... ${left}s`}</p>
        <div className="mt-3 flex justify-center gap-2">
          {over ? <Button onClick={onClose}>OK</Button> : (
            <Button colour="grey" onClick={async () => { await run(() => request(socket!, 'challenge:cancel', { fightId })); onClose(); }}>Cancel</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function FightLobby() {
  const me = useMe();
  const { socket, run } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data } = useMyMonsters();
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) || (params.get('opponent') ? 'pvp' : 'practice'));
  const [mine, setMine] = useState<string | null>(params.get('monster'));
  const [rounds, setRounds] = useState(3);
  const [players, setPlayers] = useState<NearbyPlayer[] | null>(null);
  const [opponent, setOpponent] = useState<PlayerProfile | null>(null);
  const [theirs, setTheirs] = useState<string | null>(null);
  const [stake, setStake] = useState<Stake>('bite');
  const [boss, setBoss] = useState<Card | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const free = (data?.alive ?? []).filter(isFree);
  const myMonster = free.find(m => m.id === mine) ?? null;
  useEffect(() => {
    if (!myMonster && free[0]) setMine(free[0].id);
  }, [free, myMonster]);

  const loadPlayers = useCallback(async () => setPlayers((await get<{ players: NearbyPlayer[] }>('/players/nearby')).players), []);
  useEffect(() => {
    if (mode !== 'pvp') return;
    void loadPlayers();
    const t = setInterval(() => void loadPlayers(), 10_000);
    return () => clearInterval(t);
  }, [mode, loadPlayers]);

  const pickOpponent = useCallback(async (username: string) => {
    const r = await run(() => get<{ player: PlayerProfile }>(`/players/${encodeURIComponent(username)}`));
    if (r) {
      setOpponent(r.player);
      setTheirs(r.player.monsters.find(isFree)?.id ?? null);
    }
  }, [run]);
  useEffect(() => {
    const o = params.get('opponent');
    if (o) void pickOpponent(o);
  }, [params, pickOpponent]);

  useEffect(() => {
    if (mode !== 'boss') return;
    void get<{ mapRegion: number; regions: { id: number; boss: { name: string } }[]; bosses: Card[] }>('/map').then(r => {
      const name = r.regions[r.mapRegion - 1]?.boss.name;
      setBoss(r.bosses.find(b => b.name === name) ?? null);
    });
  }, [mode]);

  const riskyOk = me.allowRiskyStakes && !!opponent?.allowRiskyStakes;
  const allowedStakes: Stake[] = riskyOk ? ['bite', 'collect', 'eat'] : ['bite'];

  const startBot = async () => {
    if (!socket || !mine) return;
    setBusy(true);
    const r = await run(() => request<'practice:start', { fightId: string }>(socket, 'practice:start', { monsterId: mine, rounds, boss: mode === 'boss' }));
    setBusy(false);
    if (r) navigate(`/fight/${r.fightId}`);
  };
  const challenge = async () => {
    if (!socket || !mine || !opponent || !theirs) return;
    setBusy(true);
    const r = await run(() => request<'challenge:send', { fightId: string }>(socket, 'challenge:send', { defenderId: opponent.id, monsterAId: mine, monsterBId: theirs, stake, rounds }));
    setBusy(false);
    if (r) setWaiting(r.fightId);
  };

  if (!data) return <Loading />;
  if (data.alive.length === 0) {
    return <Empty>You need a monster first! <Link className="font-bold underline" to="/builder">Grow one</Link>.</Empty>;
  }

  return (
    <div className="space-y-4">
      <Title sub={<StrategyCycle compact />}>⚔️ Fight!</Title>
      <Tabs<Mode> value={mode} onChange={setMode} tabs={[
        { id: 'practice', label: '🎯 Practice' }, { id: 'boss', label: '👑 Boss' }, { id: 'pvp', label: '🧑‍🤝‍🧑 Players' },
      ]} />

      <Panel>
        <h2 className="font-display text-xl">1. Pick your monster</h2>
        {free.length === 0 ? <Empty>All your monsters are busy (growing, training, fighting or for sale).</Empty> : (
          <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
            {free.map(m => <MonsterCard key={m.id} m={m} size="sm" selected={m.id === mine} onClick={() => setMine(m.id)} />)}
          </div>
        )}
      </Panel>

      {mode !== 'pvp' ? (
        <Panel className="space-y-3">
          <h2 className="font-display text-xl">2. {mode === 'boss' ? 'Face the region boss' : 'Practice against a bot'}</h2>
          <p className="text-sm">No stake: nobody loses strength or monsters. Practice pays half XP. {mode === 'boss' ? 'Win to unlock the next region!' : ''}</p>
          {mode === 'boss' && boss && <MonsterCard m={boss} size="sm" flip />}
          <RoundsPicker value={rounds} onChange={setRounds} />
          <Button colour="red" size="lg" disabled={!myMonster || busy} onClick={() => void startBot()} data-testid="start-practice">
            {mode === 'boss' ? '👑 Fight the boss!' : '🎯 Start practice'}
          </Button>
        </Panel>
      ) : (
        <Panel className="space-y-3">
          <h2 className="font-display text-xl">2. Pick an opponent <span className="text-sm font-normal">(online now, near your region · costs ⚡1)</span></h2>
          {!players ? <Loading /> : players.length === 0 ? <Empty>Nobody nearby is online right now. Try practice, or check back soon!</Empty> : (
            <div className="flex flex-wrap gap-2">
              {players.map(p => (
                <button key={p.id} onClick={() => void pickOpponent(p.username)} data-testid={`opponent-${p.username}`}
                  className={`chip !py-1 ${opponent?.id === p.id ? 'bg-nugget' : 'bg-white'}`}>
                  🟢 {p.username} · ⭐{p.profileLevel} · 🗺️{p.mapRegion}{p.friend ? ' · 🤝' : ''}
                </button>
              ))}
            </div>
          )}
          {opponent && (
            <>
              <h3 className="font-display">Pick which of {opponent.username}'s monsters to fight</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {opponent.monsters.map(m => <MonsterCard key={m.id} m={m} size="sm" flip dim={!isFree(m)} selected={m.id === theirs} onClick={isFree(m) ? () => setTheirs(m.id) : undefined} />)}
              </div>
              <h3 className="font-display">3. Your stake</h3>
              <StakePicker value={stake} onChange={setStake} allowed={allowedStakes} />
              {!riskyOk && <p className="text-xs opacity-70">Collect and Eat need a parent's OK for both players. Bite only for now.</p>}
              <p className="text-xs opacity-70">{STAKE_INFO[stake].risk}</p>
              <RoundsPicker value={rounds} onChange={setRounds} />
              <Button colour="red" size="lg" disabled={!myMonster || !theirs || busy || me.energy < BALANCE.energy.perPvpFight} onClick={() => void challenge()} data-testid="send-challenge">
                ⚔️ Challenge {opponent.username}!
              </Button>
              {me.energy < BALANCE.energy.perPvpFight && <p className="text-sm text-attack">Out of energy! It refills one point every {BALANCE.energy.refillMinutes} minutes. Practice is free.</p>}
            </>
          )}
        </Panel>
      )}
      {waiting && <Waiting fightId={waiting} onClose={() => setWaiting(null)} />}
    </div>
  );
}
