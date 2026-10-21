import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { randomLook, USERNAME_MAX, type Me } from '@mbc/shared';
import { MonsterArt } from '../art/MonsterArt';
import { Button, Panel } from '../components/ui';
import { get, post } from '../lib/api';
import { useSession } from '../lib/session';

const input = 'w-full rounded-xl border-[3px] border-black bg-white px-3 py-2 text-lg';

export function Landing() {
  const { setMe, run } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newPw, setNewPw] = useState('');
  const looks = useMemo(() => Array.from({ length: 5 }, () => randomLook()), []);

  const done = (me: Me) => {
    setMe(me);
    navigate('/map');
  };
  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => post<{ me: Me }>('/auth/login', { username: username.trim(), password }));
    if (r) done(r.me);
  };
  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => post<{ me: Me }>('/auth/signup', { username: newName.trim(), password: newPw }));
    if (r) done(r.me);
  };
  const suggest = async () => {
    const r = await run(() => get<{ choices: string[] }>('/auth/username-suggestions'));
    if (r?.choices[0]) setNewName(r.choices[0]);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="text-center">
        <h1 className="font-display text-outline text-5xl text-nugget sm:text-7xl">Monster<span className="text-flame">Brawl</span>Club</h1>
        <p className="mt-2 text-lg text-[#e8dcff]">Grow monsters. Out-think your rivals. Spin the wheel!</p>
      </div>
      <div className="my-6 flex items-end justify-center gap-1 sm:gap-4">
        {looks.map((l, i) => (
          <MonsterArt key={i} parts={l.parts} palette={l.palette} flip={i > 2} idle className={i === 2 ? 'w-36 sm:w-48' : 'w-20 sm:w-32'} />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <h2 className="font-display text-2xl">🎮 Log in</h2>
          <form onSubmit={submitLogin} className="mt-3 space-y-3">
            <input className={input} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" aria-label="Username" />
            <input className={input} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" aria-label="Password" />
            <Button type="submit" colour="green" className="w-full" data-testid="login">Let's brawl!</Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="font-display text-2xl">✨ New here?</h2>
          <form onSubmit={submitSignup} className="mt-3 space-y-3">
            <div className="flex gap-2">
              <input className={input} placeholder="Pick a username" maxLength={USERNAME_MAX} value={newName} onChange={e => setNewName(e.target.value)} autoComplete="username" aria-label="New username" />
              <button type="button" className="btn bg-tricks !px-3" onClick={() => void suggest()} aria-label="Suggest a username" title="Suggest one">🎲</button>
            </div>
            <input className={input} type="password" placeholder="Password (6+ characters)" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" aria-label="New password" />
            <Button type="submit" colour="orange" className="w-full" data-testid="signup">Join the club</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
