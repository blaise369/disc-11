import { useCallback, useEffect, useState } from 'react';
import type { FightView, Me } from '@mbc/shared';
import { Button, Empty, Loading, Modal, Panel, Title } from '../components/ui';
import { del, get, patch, post } from '../lib/api';
import { useSession } from '../lib/session';

interface Activity {
  fights: FightView[];
  trades: { id: string; from: string; to: string; state: string; createdAt: string }[];
  friends: { id: string; username: string }[];
  blocks: { id: string; username: string; byParent: boolean }[];
  reports: { username: string; reason: string; createdAt: string }[];
  ledger: { id: string; amount: number; reason: string; createdAt: string }[];
}

const input = 'rounded-xl border-[3px] border-black bg-white px-3 py-2';

function Toggle({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3">
      <input type="checkbox" className="mt-1 h-5 w-5 accent-[#3cb371]" checked={value} onChange={e => onChange(e.target.checked)} />
      <span><b>{label}</b><br /><span className="text-sm opacity-70">{help}</span></span>
    </label>
  );
}

function ChildPanel({ child, onChange }: { child: Me; onChange: (c: Me) => void }) {
  const { run, toast } = useSession();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [blockName, setBlockName] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [newPw, setNewPw] = useState('');

  const load = useCallback(async () => setActivity(await get<Activity>(`/parent/children/${child.id}/activity`)), [child.id]);
  useEffect(() => void load(), [load]);

  const update = async (data: Record<string, unknown>) => {
    const r = await run(() => patch<{ child: Me }>(`/parent/children/${child.id}`, data));
    if (r) { onChange(r.child); toast('Saved', 'good'); }
  };

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">🎮 {child.username}</h2>
        <span className="text-sm">⭐ Level {child.profileLevel} · 🪙 {child.nuggets} · {child.isMember ? '👑 Member' : 'Free'}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle label="Allow Collect and Eat stakes" help="Winning or losing whole monsters. Off: Bite fights only (strength changes, nobody loses a monster)." value={child.allowRiskyStakes} onChange={v => void update({ allowRiskyStakes: v })} />
        <Toggle label="Allow trading" help="Swap monsters with friends. Both players confirm twice." value={child.allowTrades} onChange={v => void update({ allowTrades: v })} />
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3">
        <b>Daily play time</b>
        <select className={input} value={child.dailyPlayCapMinutes ?? ''} onChange={e => void update({ dailyPlayCapMinutes: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Daily play time">
          <option value="">No limit</option>
          {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} minutes</option>)}
          <option value={0}>No play today</option>
        </select>
        <span className="text-sm opacity-70">Played today: {Math.floor(child.playSecondsToday / 60)} min</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3">
        <b>Membership</b>
        <span className="text-sm opacity-70">Bigger collection and graveyard, 2 dojo slots, extra parts. Never sells fight power.</span>
        <Button size="sm" colour={child.isMember ? 'grey' : 'gold'} onClick={() => setPinOpen(true)}>{child.isMember ? 'Cancel membership' : 'Turn on membership'}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3">
        <b>Password</b>
        <input className={input} type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} aria-label="New child password" />
        <Button size="sm" colour="blue" disabled={newPw.length < 6} onClick={() => { void update({ password: newPw }); setNewPw(''); }}>Change</Button>
      </div>

      {!activity ? <Loading /> : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-white p-3">
            <h3 className="font-display">Recent fights</h3>
            {activity.fights.length === 0 ? <p className="text-sm opacity-60">No fights yet.</p> : (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {activity.fights.map(f => {
                  const mine = f.a.userId === child.id ? 'A' : 'B';
                  const opp = mine === 'A' ? f.b : f.a;
                  const won = f.result?.winnerSide === mine;
                  return <li key={f.id}>{won ? '🏆 Won' : '💥 Lost'} vs <b>{opp.username}</b> ({f.kind}{f.kind === 'pvp' ? `, ${(mine === 'A' ? f.a.stake : f.b.stake) ?? ''}` : ''})</li>;
                })}
              </ul>
            )}
          </div>
          <div className="rounded-xl bg-white p-3">
            <h3 className="font-display">Friends</h3>
            {activity.friends.length === 0 ? <p className="text-sm opacity-60">No friends yet.</p> : <p className="text-sm">{activity.friends.map(f => f.username).join(', ')}</p>}
            <h3 className="mt-2 font-display">Trades</h3>
            {activity.trades.length === 0 ? <p className="text-sm opacity-60">No trades.</p> : (
              <ul className="text-sm">{activity.trades.map(t => <li key={t.id}>{t.from} → {t.to}: {t.state}</li>)}</ul>
            )}
          </div>
          <div className="rounded-xl bg-white p-3">
            <h3 className="font-display">Blocked players</h3>
            <ul className="text-sm">
              {activity.blocks.map(b => (
                <li key={b.id} className="flex items-center justify-between">
                  <span>{b.username}{b.byParent ? ' (by you)' : ''}</span>
                  <button className="underline" onClick={() => void run(async () => { await del(`/parent/children/${child.id}/blocks/${b.id}`); await load(); })}>Unblock</button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input className={`${input} min-w-0 flex-1`} placeholder="Username to block" value={blockName} onChange={e => setBlockName(e.target.value)} aria-label="Username to block" />
              <Button size="sm" colour="red" onClick={() => void run(async () => { await post(`/parent/children/${child.id}/blocks`, { username: blockName.trim() }); setBlockName(''); await load(); })}>Block</Button>
            </div>
          </div>
          <div className="rounded-xl bg-white p-3">
            <h3 className="font-display">Reports made · Nugget history</h3>
            <ul className="max-h-40 overflow-y-auto text-sm">
              {activity.reports.map((r, i) => <li key={i}>🚩 Reported {r.username} ({r.reason})</li>)}
              {activity.ledger.map(l => <li key={l.id} className="flex justify-between"><span>{l.reason.replace(/_/g, ' ')}</span><span className={l.amount < 0 ? 'text-attack' : 'text-brains'}>{l.amount > 0 ? '+' : ''}{l.amount}</span></li>)}
            </ul>
          </div>
        </div>
      )}

      <Modal open={pinOpen} onClose={() => setPinOpen(false)}>
        <h2 className="font-display text-2xl">Enter your parent PIN</h2>
        <p className="text-sm opacity-70">This demo has no payment provider connected: membership is switched on directly once the PIN is right.</p>
        <input className={`${input} mt-3 w-full`} inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} aria-label="Parent PIN" />
        <div className="mt-3 flex justify-end gap-2">
          <Button colour="grey" onClick={() => setPinOpen(false)}>Cancel</Button>
          <Button colour="gold" onClick={async () => {
            const r = await run(() => post<{ child: Me }>(`/parent/children/${child.id}/membership`, { pin, enable: !child.isMember }));
            if (r) { onChange(r.child); setPinOpen(false); setPin(''); }
          }}>Confirm</Button>
        </div>
      </Modal>
    </Panel>
  );
}

export function Parent() {
  const { run, logout } = useSession();
  const [data, setData] = useState<{ email: string; children: Me[] } | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const load = useCallback(async () => setData(await get<{ email: string; children: Me[] }>('/parent')), []);
  const loadChoices = useCallback(async () => {
    const r = await get<{ choices: string[] }>('/parent/username-choices');
    setChoices(r.choices);
    setUsername(r.choices[0] ?? '');
  }, []);
  useEffect(() => { void load(); void loadChoices(); }, [load, loadChoices]);

  if (!data) return <Loading />;
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-3 py-6">
      <div className="flex items-center justify-between">
        <Title sub={`Signed in as ${data.email}`}>👪 Parent centre</Title>
        <Button colour="grey" size="sm" onClick={() => void logout()}>Log out</Button>
      </div>
      {data.children.map(c => (
        <ChildPanel key={c.id} child={c} onChange={nc => setData(d => d && { ...d, children: d.children.map(x => (x.id === nc.id ? nc : x)) })} />
      ))}
      {data.children.length === 0 && <Empty>No player accounts yet. Make one below!</Empty>}
      <Panel>
        <h2 className="font-display text-2xl">➕ Add a player</h2>
        <p className="text-sm opacity-70">Usernames are picked from safe word pairs, so nobody types their real name.</p>
        <div className="my-3 flex flex-wrap gap-2">
          {choices.map(c => (
            <button key={c} onClick={() => setUsername(c)} className={`chip ${username === c ? 'bg-nugget' : 'bg-white'}`}>{c}</button>
          ))}
          <button className="chip bg-cream" onClick={() => void loadChoices()}>🎲 More</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={input} type="password" placeholder="Their password (6+ characters)" value={password} onChange={e => setPassword(e.target.value)} aria-label="Child password" />
          <Button colour="green" disabled={!username || password.length < 6} data-testid="create-child" onClick={async () => {
            const r = await run(() => post('/parent/children', { username, password }));
            if (r) { setPassword(''); await load(); await loadChoices(); }
          }}>Create {username}</Button>
        </div>
      </Panel>
    </div>
  );
}
