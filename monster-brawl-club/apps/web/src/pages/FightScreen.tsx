import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  beats, CHAT_PHRASES, hashSeed, STRATEGIES, type FightSideView, type FightView, type Side, type Strategy,
} from '@mbc/shared';
import { MonsterCard } from '../components/MonsterCard';
import { Squash } from '../components/Squash';
import { STAKE_INFO } from '../components/stakes';
import { StrategyCycle, STRATEGY_INFO } from '../components/strategy';
import { Button, Loading, Modal, Panel, useCountdown, useMediaQuery } from '../components/ui';
import { Wheel } from '../components/Wheel';
import { post } from '../lib/api';
import { useMe, useSession } from '../lib/session';
import { request } from '../lib/socket';
import { sfx } from '../lib/sound';

const pct = (p: number) => `${Math.round(p * 100)}%`;

function stakeText(f: FightView): string | null {
  const r = f.result;
  if (!r?.stake) return null;
  const s = r.stake;
  const win = r.winnerSide === 'A' ? f.a : f.b;
  const lose = r.winnerSide === 'A' ? f.b : f.a;
  const gain = s.winnerStrength - win.monster.strength;
  if (s.applied === 'bite') {
    return `${s.downgraded ? "The graveyard was full, so Eat became a Bite. " : ''}${win.monster.name} bit ${gain} strength off ${lose.monster.name}.`;
  }
  if (s.applied === 'collect') {
    return s.loserMonster === 'sold'
      ? `${win.username}'s collection was full, so ${lose.monster.name} was sold for 🪙 ${s.nuggetsToWinner}.`
      : `${win.username} collected ${lose.monster.name}!`;
  }
  return `${win.monster.name} ate ${lose.monster.name}! +${gain} strength. ${lose.monster.name} went to the graveyard.`;
}

function SideCard({ side, f, ko, squash, bubble, flip }: { side: FightSideView; f: FightView; ko: boolean; squash: boolean; bubble: string | null; flip?: boolean }) {
  const [squashed, setSquashed] = useState(false);
  useEffect(() => { if (!squash) setSquashed(false); }, [squash]);
  return (
    <div className="relative flex flex-col items-center gap-1">
      <div className="text-center text-sm font-semibold text-white text-outline">
        {side.isBot ? '🤖 ' : ''}{side.username}
        {side.stake && side.stake !== 'none' && <span className="chip ml-1 bg-cream text-ink">{STAKE_INFO[side.stake].icon} {STAKE_INFO[side.stake].label}</span>}
        {side.luck > 0 && <span className="chip ml-1 bg-goo text-ink">🍀</span>}
      </div>
      <div className="relative">
        <div className={squashed ? 'squash' : ''}><MonsterCard m={{ ...side.monster, locked: false, potions: [] }} flip={flip} ko={ko} size="sm" /></div>
        {squash && <Squash width={150} height={300} onImpact={() => setSquashed(true)} />}
        {bubble && <div className="pop-in absolute -top-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-xl border-[3px] border-black bg-white px-3 py-1 font-semibold shadow-[0_3px_0_#000]">{bubble}</div>}
      </div>
      {side.fightStrength !== side.monster.strength && <div className="text-xs text-white">💪 Potion: {side.fightStrength} strength</div>}
    </div>
  );
}

export function FightScreen() {
  const { id = '' } = useParams();
  const me = useMe();
  const { socket, run, refresh } = useSession();
  const navigate = useNavigate();
  const [f, setF] = useState<FightView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spinDone, setSpinDone] = useState(false);
  const [animateSpin, setAnimateSpin] = useState(false);
  const [bubbles, setBubbles] = useState<Record<Side, string | null>>({ A: null, B: null });
  const [leaving, setLeaving] = useState(false);
  const [verify, setVerify] = useState<boolean | null>(null);
  const lastState = useRef<string | null>(null);
  const small = useMediaQuery('(max-width: 639px)');
  const left = useCountdown(f?.state === 'ROUND_PICKING' || f?.state === 'PENDING' ? f.deadline : null);

  useEffect(() => {
    if (!socket) return;
    let first = true;
    const apply = (v: FightView) => {
      if (v.id !== id) return;
      if (first) {
        first = false;
        // Opened after the spin (e.g. from history): show the result straight away.
        if (v.state === 'RESOLVED' || v.state === 'ABANDONED') setSpinDone(true);
      }
      if (v.state === 'SPINNING' || (v.state === 'RESOLVED' && lastState.current === 'SPINNING')) setAnimateSpin(true);
      if (v.state === 'ROUND_REVEAL' && lastState.current !== 'ROUND_REVEAL') sfx.reveal();
      if (v.state === 'ABANDONED' && !v.spin) setSpinDone(true);
      lastState.current = v.state;
      setF(v);
    };
    request<'fight:join', { fight: FightView }>(socket, 'fight:join', { fightId: id })
      .then(r => apply(r.fight))
      .catch(e => setError(e instanceof Error ? e.message : 'Fight not found'));
    socket.on('fight:state', apply);
    const onChat = (m: { fightId: string; side: Side; text: string }) => {
      if (m.fightId !== id) return;
      setBubbles(b => ({ ...b, [m.side]: m.text }));
      setTimeout(() => setBubbles(b => ({ ...b, [m.side]: null })), 3000);
    };
    socket.on('chat:phrase', onChat);
    return () => {
      socket.off('fight:state', apply);
      socket.off('chat:phrase', onChat);
    };
  }, [socket, id]);

  useEffect(() => {
    if (spinDone && f?.result) {
      const mine = f.a.userId === me.id ? 'A' : 'B';
      if (f.result.winnerSide === mine) sfx.win(); else sfx.lose();
      void refresh();
    }
  }, [spinDone, f?.result]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Panel className="text-center">{error} <Link className="underline" to="/fight">Back</Link></Panel>;
  if (!f) return <Loading text="Entering the arena..." />;

  const mySide: Side = f.a.userId === me.id ? 'A' : 'B';
  const mine = mySide === 'A' ? f.a : f.b;
  const theirs = mySide === 'A' ? f.b : f.a;
  const share = f.spin ? f.spin.pFinal : f.shareA ?? f.pStart ?? 0.5;
  const showResult = !!f.result && spinDone;
  const won = f.result?.winnerSide === mySide;
  const loserSide = f.result ? (f.result.winnerSide === 'A' ? 'B' : 'A') : null;
  const lastRound = f.rounds[f.rounds.length - 1];
  const myPicked = f.picked[mySide];
  const pvp = f.kind === 'pvp';
  const active = ['ACCEPTED', 'ROUND_PICKING', 'ROUND_REVEAL'].includes(f.state);

  const pick = async (s: Strategy) => {
    sfx.pick();
    await run(() => request(socket!, 'round:pick', { fightId: f.id, strategy: s }));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border-4 border-black bg-gradient-to-b from-[#ff9a5a] via-[#ffcf7a] to-[#c27a3a] p-3 shadow-[0_6px_0_#000]">
        <div className="mb-1 text-center font-display text-lg text-white text-outline">
          {f.kind === 'boss' ? '👑 Boss fight' : f.kind === 'practice' ? '🎯 Practice' : '⚔️ PvP'} · {f.roundsPlanned} skill round{f.roundsPlanned === 1 ? '' : 's'}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <SideCard side={f.a} f={f} ko={showResult && loserSide === 'A'} squash={showResult && loserSide === 'A'} bubble={bubbles.A} />
          <div className="flex flex-col items-center">
            <div className="mb-1 flex w-full justify-between gap-4 font-display text-xl text-outline">
              <span className="text-side-a">{pct(share)}</span>
              <span className="text-side-b">{pct(1 - share)}</span>
            </div>
            <Wheel shareA={share} spinRoll={animateSpin && f.spin ? f.spin.roll : null} onSpinEnd={() => setSpinDone(true)} size={small ? 140 : 260} />
          </div>
          <SideCard side={f.b} f={f} ko={showResult && loserSide === 'B'} squash={showResult && loserSide === 'B'} bubble={bubbles.B} flip />
        </div>
      </div>

      <Panel className="text-center">
        {f.state === 'PENDING' && <p className="font-display text-xl">Waiting for {f.b.username} to accept... {left}s</p>}
        {(f.state === 'DECLINED' || f.state === 'EXPIRED') && (
          <p className="font-display text-xl">{f.state === 'DECLINED' ? 'Challenge declined.' : 'Challenge expired.'} <Link className="underline" to="/fight">Back</Link></p>
        )}
        {f.state === 'ACCEPTED' && <p className="font-display text-2xl">Get ready... {mine.monster.name} starts with {pct(mySide === 'A' ? share : 1 - share)} of the wheel!</p>}

        {f.state === 'ROUND_PICKING' && (
          <div>
            <div className="font-display text-2xl">Round {f.currentRound} of {f.roundsPlanned} · <span className={left <= 3 ? 'text-attack' : ''}>{left}s</span></div>
            <StrategyCycle compact />
            {myPicked ? (
              <p className="mt-3 text-lg">✅ Picked! {f.picked[mySide === 'A' ? 'B' : 'A'] ? 'Revealing...' : `Waiting for ${theirs.username}...`}</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STRATEGIES.map(s => (
                  <button key={s} onClick={() => void pick(s)} data-testid={`pick-${s}`} className={`btn ${STRATEGY_INFO[s].bg} !py-3`}>
                    <div className="text-3xl">{STRATEGY_INFO[s].icon}</div>
                    <div>{STRATEGY_INFO[s].label}</div>
                    <div className="text-sm">skill {mine.monster.skills[s]}</div>
                  </button>
                ))}
              </div>
            )}
            {!myPicked && <p className="mt-2 text-xs opacity-70">Picks are secret until both are in. No pick in time means a random one.</p>}
          </div>
        )}

        {(f.state === 'ROUND_REVEAL' || (f.state === 'SPINNING' && !lastRound)) && lastRound && (
          <div className="pop-in">
            <div className="font-display text-xl">Round {lastRound.roundNo}</div>
            <div className="my-2 flex items-center justify-center gap-3 text-lg">
              <span className={`btn ${STRATEGY_INFO[lastRound.pickA].bg}`}>{STRATEGY_INFO[lastRound.pickA].icon} {STRATEGY_INFO[lastRound.pickA].label} ({f.a.monster.skills[lastRound.pickA]})</span>
              <span className="font-display">vs</span>
              <span className={`btn ${STRATEGY_INFO[lastRound.pickB].bg}`}>{STRATEGY_INFO[lastRound.pickB].icon} {STRATEGY_INFO[lastRound.pickB].label} ({f.b.monster.skills[lastRound.pickB]})</span>
            </div>
            <p className="text-lg font-semibold">
              {lastRound.winner === 'tie' ? 'A tie! The wheel stays put.' : (() => {
                const w = lastRound.winner === 'A' ? f.a : f.b;
                const [wp, lp] = lastRound.winner === 'A' ? [lastRound.pickA, lastRound.pickB] : [lastRound.pickB, lastRound.pickA];
                const why = beats(wp, lp) ? `${STRATEGY_INFO[wp].label} beats ${STRATEGY_INFO[lp].label}` : 'higher skill wins';
                return `${why}! ${w.monster.name} grabs +${Math.round(lastRound.delta * 100)}% of the wheel.`;
              })()}
            </p>
          </div>
        )}

        {f.state === 'SPINNING' && !showResult && <p className="font-display text-3xl pulse-soft">🎡 Spinning!</p>}
        {f.state === 'RESOLVED' && !showResult && <p className="font-display text-3xl pulse-soft">🎡 Spinning!</p>}

        {showResult && f.result && (
          <div className="pop-in space-y-2">
            <h2 className={`font-display text-5xl text-outline ${won ? 'text-nugget' : 'text-[#b8adc4]'}`}>{won ? 'VICTORY!' : 'DEFEAT'}</h2>
            {f.result.abandonedBy && <p>{f.result.abandonedBy === mySide ? 'You left the fight, so it counts as a loss.' : `${theirs.username} left the fight, so you win!`}</p>}
            {stakeText(f) && <p className="text-lg font-semibold">{stakeText(f)}</p>}
            {f.result.bossBeaten && <p className="text-lg font-semibold">👑 Boss beaten! The next region is open!</p>}
            {f.result.rewards[mySide] && (
              <div className="flex flex-wrap justify-center gap-2">
                <span className="chip bg-nugget">+{f.result.rewards[mySide]!.xp} XP</span>
                <span className="chip bg-nugget">🪙 +{f.result.rewards[mySide]!.nuggets}</span>
                {f.result.rewards[mySide]!.levelsGained > 0 && <span className="chip bg-goo">⭐ Level up!</span>}
              </div>
            )}
            {f.spin && (
              <details className="text-xs opacity-80">
                <summary className="cursor-pointer">🔒 Check the spin was fair</summary>
                <p className="break-all">Before round 1 the server published hash <code>{f.seedHash}</code>. The seed was <code>{f.spin.seed}</code>, roll {f.spin.roll.toFixed(4)} (A wins below {f.spin.pFinal.toFixed(4)}).</p>
                <button className="underline" onClick={async () => setVerify((await hashSeed(f.spin!.seed)) === f.seedHash)}>Verify now</button>
                {verify !== null && <span> {verify ? '✅ Hash matches!' : '❌ Mismatch'}</span>}
              </details>
            )}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Button colour="blue" onClick={() => navigate('/fight')}>Back to fights</Button>
              {!pvp && <Button colour="red" onClick={() => navigate(`/fight?mode=${f.kind}&monster=${mine.monster.status === 'alive' && mine.monster.ownerId === me.id ? mine.monster.id : ''}`)}>Fight again</Button>}
              {pvp && !theirs.isBot && <Link className="btn bg-[#6b7a8f]" to={`/player/${theirs.username}`}>{theirs.username}'s profile</Link>}
              {pvp && <ReportBlock username={theirs.username} fightId={f.id} />}
            </div>
          </div>
        )}
      </Panel>

      {pvp && (active || showResult) && (
        <Panel className="!p-2">
          <div className="flex flex-wrap justify-center gap-1">
            {CHAT_PHRASES.map(p => (
              <button key={p.id} className="chip bg-white" onClick={() => void run(() => request(socket!, 'chat:phrase', { fightId: f.id, phraseId: p.id }))}>{p.text}</button>
            ))}
          </div>
        </Panel>
      )}

      {active && (
        <div className="text-center">
          <button className="text-sm text-white/70 underline" onClick={() => setLeaving(true)}>Leave fight</button>
        </div>
      )}
      <Modal open={leaving} onClose={() => setLeaving(false)}>
        <h2 className="font-display text-2xl">Leave the fight?</h2>
        <p>Leaving after a fight starts counts as a loss{pvp ? ', and your stake applies.' : '.'}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button colour="grey" onClick={() => setLeaving(false)}>Stay</Button>
          <Button colour="red" onClick={async () => { setLeaving(false); await run(() => request(socket!, 'fight:leave', { fightId: f.id })); }}>Leave</Button>
        </div>
      </Modal>
    </div>
  );
}

export function ReportBlock({ username, fightId }: { username: string; fightId?: string }) {
  const { run, toast } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('rude');
  return (
    <>
      <Button colour="grey" size="sm" onClick={() => setOpen(true)}>🚩 Report / block</Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <h2 className="font-display text-2xl">Report or block {username}</h2>
        <p className="text-sm">Blocking stops them challenging, friending, trading or chatting with you.</p>
        <select className="mt-3 w-full rounded-xl border-[3px] border-black bg-white p-2" value={reason} onChange={e => setReason(e.target.value)} aria-label="Report reason">
          <option value="rude">Being rude</option>
          <option value="cheating">Cheating</option>
          <option value="bad_name">Bad monster name</option>
          <option value="other">Something else</option>
        </select>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button colour="grey" onClick={() => setOpen(false)}>Cancel</Button>
          <Button colour="purple" onClick={async () => {
            if (await run(() => post('/reports', { username, reason, ...(fightId ? { fightId } : {}) }))) { toast('Thanks, a grown-up will look at it.', 'good'); setOpen(false); }
          }}>Report</Button>
          <Button colour="red" onClick={async () => {
            if (await run(() => post('/blocks', { username }))) { toast(`${username} is blocked.`, 'good'); setOpen(false); }
          }}>Block</Button>
        </div>
      </Modal>
    </>
  );
}
