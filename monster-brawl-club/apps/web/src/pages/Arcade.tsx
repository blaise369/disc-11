import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Loading, Panel, Title } from '../components/ui';
import { get, post } from '../lib/api';
import { useSession } from '../lib/session';
import { sfx } from '../lib/sound';

interface Q { a: number; b: number; op: '+' | '-' | 'x' }

export function Arcade() {
  const { run, refresh } = useSession();
  const [info, setInfo] = useState<{ earnedToday: number; maxPerDay: number; maxPerGame: number } | null>(null);
  const [game, setGame] = useState<{ gameId: string; questions: Q[]; seconds: number; started: number } | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<{ correct: number; total: number; reward: number; capped: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setInfo(await get('/arcade')), []);
  useEffect(() => void load(), [load]);

  const finish = useCallback(async (final: (number | null)[]) => {
    if (!game) return;
    const r = await run(() => post<{ correct: number; total: number; reward: number; capped: boolean }>(`/arcade/${game.gameId}/finish`, { answers: final }));
    setGame(null);
    if (r) { setResult(r); if (r.reward) sfx.coin(); await load(); await refresh(); }
  }, [game, run, load, refresh]);

  useEffect(() => {
    if (!game) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [game]);
  const left = game ? Math.max(0, game.seconds - Math.floor((now - game.started) / 1000)) : 0;
  useEffect(() => {
    if (game && left === 0) void finish(answers);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    const r = await run(() => post<{ gameId: string; questions: Q[]; seconds: number }>('/arcade/start'));
    if (!r) return;
    setGame({ ...r, started: Date.now() });
    setAnswers(r.questions.map(() => null));
    setI(0);
    setTyped('');
    setResult(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const submit = () => {
    if (!game) return;
    const next = [...answers];
    next[i] = typed === '' || typed === '-' ? null : Number(typed);
    setAnswers(next);
    setTyped('');
    sfx.pick();
    if (i + 1 >= game.questions.length) void finish(next);
    else setI(i + 1);
  };

  if (!info) return <Loading />;
  const q = game?.questions[i];
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Title sub={`2 nuggets per right answer, up to ${info.maxPerGame} a game and ${info.maxPerDay} a day. Earned today: ${info.earnedToday}.`}>🕹️ Maths Sprint</Title>
      <Panel className="text-center">
        {!game ? (
          <>
            {result && (
              <div className="pop-in mb-3">
                <div className="font-display text-3xl">{result.correct} / {result.total} right!</div>
                <div className="text-lg">🪙 +{result.reward}{result.capped ? ' (daily limit reached)' : ''}</div>
              </div>
            )}
            <p>Answer 10 sums in 60 seconds. Ready?</p>
            <Button size="lg" colour="green" className="mt-3" onClick={() => void start()}>{result ? 'Play again' : 'Start!'}</Button>
          </>
        ) : q && (
          <>
            <div className="flex justify-between font-display text-lg"><span>Question {i + 1}/10</span><span className={left <= 10 ? 'text-attack' : ''}>⏱️ {left}s</span></div>
            <div className="my-4 font-display text-6xl">{q.a} {q.op === 'x' ? '×' : q.op} {q.b} = ?</div>
            <form onSubmit={e => { e.preventDefault(); submit(); }} className="flex justify-center gap-2">
              <input ref={inputRef} inputMode="numeric" value={typed} onChange={e => setTyped(e.target.value.replace(/[^\d-]/g, ''))} aria-label="Answer"
                className="w-32 rounded-xl border-[3px] border-black bg-white px-3 py-2 text-center font-display text-3xl" />
              <Button type="submit" colour="blue">Next</Button>
            </form>
          </>
        )}
      </Panel>
    </div>
  );
}
