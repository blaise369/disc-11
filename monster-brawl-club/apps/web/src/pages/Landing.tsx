import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { randomLook, type Me } from '@mbc/shared';
import { MonsterArt } from '../art/MonsterArt';
import { Button, Panel } from '../components/ui';
import { post } from '../lib/api';
import { useSession } from '../lib/session';

const input = 'w-full rounded-xl border-[3px] border-black bg-white px-3 py-2 text-lg';

export function Landing() {
  const { setMe, run } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [parentPw, setParentPw] = useState('');
  const looks = useMemo(() => Array.from({ length: 5 }, () => randomLook()), []);

  const done = (me: Me) => {
    setMe(me);
    navigate(me.role === 'parent' ? '/parent' : '/map');
  };
  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => post<{ me: Me }>('/auth/login', { login, password }));
    if (r) done(r.me);
  };
  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => post<{ me: Me }>('/auth/parent/signup', { email, password: parentPw, pin }));
    if (r) done(r.me);
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
          <h2 className="font-display text-2xl">🎮 Players</h2>
          <p className="mb-3 text-sm opacity-80">Log in with the monster name a grown-up made for you.</p>
          <form onSubmit={submitLogin} className="space-y-3">
            <input className={input} placeholder="Username (like BraveBadger42)" value={login} onChange={e => setLogin(e.target.value)} autoComplete="username" aria-label="Username" />
            <input className={input} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" aria-label="Password" />
            <Button type="submit" colour="green" className="w-full" data-testid="login">Let's brawl!</Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="font-display text-2xl">👪 Grown-ups</h2>
          <p className="mb-3 text-sm opacity-80">Parents create player accounts and choose what they can do. Log in with your email above, or sign up here.</p>
          {mode === 'login' ? (
            <div className="space-y-3">
              <ul className="list-inside list-disc text-sm">
                <li>Collect/Eat stakes and trading start switched off</li>
                <li>Chat is a fixed list of friendly phrases</li>
                <li>Daily play-time limits, blocking and activity history</li>
              </ul>
              <Button colour="blue" className="w-full" onClick={() => setMode('signup')}>Parent sign up</Button>
            </div>
          ) : (
            <form onSubmit={submitSignup} className="space-y-3">
              <input className={input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" aria-label="Email" />
              <input className={input} type="password" placeholder="Password (8+ characters)" value={parentPw} onChange={e => setParentPw(e.target.value)} autoComplete="new-password" aria-label="Parent password" />
              <input className={input} inputMode="numeric" maxLength={4} placeholder="4-digit PIN (for purchases)" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} aria-label="PIN" />
              <div className="flex gap-2">
                <Button type="button" colour="grey" onClick={() => setMode('login')}>Back</Button>
                <Button type="submit" colour="blue" className="flex-1">Create parent account</Button>
              </div>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
