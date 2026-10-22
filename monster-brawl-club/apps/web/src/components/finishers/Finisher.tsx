import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import { PALETTE, type MonsterPalette, type MonsterParts, type Variant } from '@mbc/shared';
import { MonsterArt } from '../../art/MonsterArt';
import { sfx } from '../../lib/sound';
import { finisherFor } from './finishers';
import { easeInOut, lerp, popText, Puppet, seg, type Box, type Kit } from './kit';
import { TAILS, type Outcome } from './tails';

export type { Outcome } from './tails';

export interface FighterLook {
  parts: MonsterParts;
  palette: MonsterPalette;
  variant: Variant;
}

const INTRO = 0.85;
const OUTRO = 0.6;

const hex = (s: string) => parseInt(s.slice(1), 16);
function mixHex(a: number, b: number, t: number): number {
  const ch = (n: number, s: number) => (n >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

function rectIn(el: Element, arena: DOMRect): Box {
  const r = el.getBoundingClientRect();
  const left = r.left - arena.left, top = r.top - arena.top;
  return { left, top, right: left + r.width, bottom: top + r.height, w: r.width, h: r.height, cx: left + r.width / 2, cy: top + r.height / 2 };
}

/** The visible monster inside a square art element (the art has padding for horns and arms). */
function bodyBox(left: number, top: number, S: number): Box {
  const w = S * 0.55, h = S * 0.6, cx = left + S / 2, bottom = top + S * 0.97;
  return { left: cx - w / 2, right: cx + w / 2, top: bottom - h, bottom, w, h, cx, cy: bottom - h / 2 };
}

interface Layout {
  W: number;
  H: number;
  S: number;
  dir: 1 | -1;
  winLeft: number;
  loseLeft: number;
  top: number;
  cardWin: Box;
  cardLose: Box;
}

/**
 * Both monsters jump out of their cards onto the arena floor, the winner performs its
 * species attack, the stake decides the ending (eat / bite / capture / K.O.), and the
 * survivors jump back into their cards. Calls onDone when finished.
 */
export function Finisher({ arena, winnerCard, loserCard, winner, loser, outcome, onDone }: {
  arena: HTMLElement;
  winnerCard: HTMLElement;
  loserCard: HTMLElement;
  winner: FighterLook;
  loser: FighterLook;
  outcome: Outcome;
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const winEl = useRef<HTMLDivElement>(null);
  const loseEl = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const [layout, setLayout] = useState<Layout | null>(null);

  useLayoutEffect(() => {
    const a = arena.getBoundingClientRect();
    const artOf = (card: HTMLElement) => rectIn(card.querySelector('[data-art]') ?? card, a);
    const cardWin = artOf(winnerCard), cardLose = artOf(loserCard);
    const dir: 1 | -1 = cardLose.cx >= cardWin.cx ? 1 : -1;
    const S = Math.min(a.height * 0.68, a.width * 0.3, 250);
    const top = a.height - 6 - S;
    const centre = (x: number) => x - S / 2;
    setLayout({
      W: a.width, H: a.height, S, dir, top, cardWin, cardLose,
      winLeft: centre(a.width / 2 - dir * a.width * 0.25),
      loseLeft: centre(a.width / 2 + dir * a.width * 0.25),
    });
  }, [arena, winnerCard, loserCard]);

  useEffect(() => {
    if (!layout || !winEl.current || !loseEl.current) return;
    const { W, H, S, dir, top } = layout;
    const app = new Application();
    let ready = false;
    let disposed = false;
    const win = new Puppet(winEl.current, bodyBox(layout.winLeft, top, S));
    const lose = new Puppet(loseEl.current, bodyBox(layout.loseLeft, top, S));
    const arenaRect = arena.getBoundingClientRect();
    const arenaPuppet = new Puppet(arena, rectIn(arena, arenaRect), '50% 50%');
    // Offsets that put a stage fighter exactly over its card art (origin: bottom centre).
    const fromCard = (card: Box, left: number) => ({ x: card.cx - (left + S / 2), y: card.bottom - (top + S), s: card.w / S });
    const homeWin = fromCard(layout.cardWin, layout.winLeft);
    const homeLose = fromCard(layout.cardLose, layout.loseLeft);

    void app.init({ width: W, height: H, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true })
      .then(() => {
        if (disposed) return app.destroy(true, { children: true });
        ready = true;
        host.current?.appendChild(app.canvas);
        const stage = new Container();
        app.stage.addChild(stage);
        let t = 0;
        const scheduled: { time: number; fn: () => void }[] = [];
        const updaters: ((t: number, dt: number) => void)[] = [];
        let shakeUntil = 0, shakeStrength = 0;
        const body = hex(PALETTE[winner.palette.body] ?? PALETTE[0]);
        const base: Kit = {
          app, stage, W, H, win, lose, arena: arenaPuppet, dir, ground: top + S * 0.97, S,
          cardArt: { win: layout.cardWin, lose: layout.cardLose },
          col: { body, accent: hex(PALETTE[winner.palette.accent] ?? PALETTE[1]), dark: mixHex(body, 0x120018, 0.55), light: mixHex(body, 0xffffff, 0.45) },
          at: (time, fn) => scheduled.push({ time, fn }),
          every: fn => updaters.push(fn),
          pop: () => undefined,
          shake: (strength, dur) => {
            shakeStrength = strength;
            shakeUntil = t + dur;
          },
        };
        base.pop = popText(stage, base.every, () => t);
        // Each phase schedules on its own clock.
        const phaseKit = (start: number): Kit => ({ ...base, at: (time, fn) => base.at(time + start, fn) });

        const def = finisherFor(winner.parts.species);
        const ending = outcome.kind === 'eat' ? 'eat' : 'spare';
        const tail = outcome.kind === 'eat' ? null : TAILS[outcome.kind];
        const attackStart = INTRO;
        const tailStart = attackStart + def.duration[ending];
        const outroStart = tailStart + (tail?.duration ?? 0);
        const end = outroStart + OUTRO;
        const attack = def.run(phaseKit(attackStart), ending);
        const tailStep = tail?.run(phaseKit(tailStart), outcome);
        const loserReturns = outcome.kind === 'bite' || outcome.kind === 'ko';

        // Jump out of the cards, starting where the card art is.
        const jump = (p: Puppet, home: { x: number; y: number; s: number }, p0: number, out: boolean) => {
          const f = out ? easeInOut(p0) : 1 - easeInOut(p0);
          const s = lerp(home.s, 1, f);
          p.set({ x: lerp(home.x, 0, f), y: lerp(home.y, 0, f) - Math.sin(p0 * Math.PI) * H * 0.3, sx: s, sy: s, rot: Math.sin(p0 * Math.PI) * -12, opacity: 1, filter: '', clip: '' });
        };
        jump(win, homeWin, 0, true);
        jump(lose, homeLose, 0, true);
        base.at(0, sfx.pop);
        base.at(0.1, sfx.pop);
        base.at(0.62, sfx.thump);
        base.at(outroStart, sfx.pop);

        let finished = false;
        app.ticker.add(tk => {
          const dt = Math.min(0.05, tk.deltaMS / 1000);
          t += dt;
          for (const s of scheduled) if (t >= s.time && s.time >= 0) { s.time = -1; s.fn(); }
          if (t < attackStart) {
            jump(win, homeWin, seg(t, 0, 0.6), true);
            jump(lose, homeLose, seg(t, 0.1, 0.7), true);
            // Land with a squash.
            const land = Math.sin(seg(t, 0.6, INTRO) * Math.PI);
            if (t > 0.6) {
              win.set({ sx: 1 + 0.12 * land, sy: 1 - 0.15 * land });
              if (t > 0.7) lose.set({ sx: 1 + 0.12 * land, sy: 1 - 0.15 * land });
            }
          } else if (t < tailStart) {
            attack(t - attackStart, dt);
          } else if (t < outroStart) {
            tailStep?.(t - tailStart, dt);
          } else {
            const p = seg(t, outroStart, end);
            jump(win, homeWin, p, false);
            if (loserReturns) jump(lose, homeLose, p, false);
            if (p >= 1) {
              win.set({ opacity: 0 });
              if (loserReturns) lose.set({ opacity: 0 });
            }
          }
          for (const u of updaters) u(t, dt);
          if (t < shakeUntil) {
            const k = (shakeUntil - t) * shakeStrength * 2;
            arenaPuppet.set({ x: (Math.random() - 0.5) * k, y: (Math.random() - 0.5) * k });
          } else if (shakeUntil) {
            shakeUntil = 0;
            arenaPuppet.reset();
          }
          if (!finished && t >= end) {
            finished = true;
            done.current();
          }
        });
      });

    return () => {
      disposed = true;
      if (ready) app.destroy(true, { children: true });
      arenaPuppet.reset();
    };
  }, [layout, arena, winner, outcome]);

  if (!layout) return null;
  const { S, dir, top } = layout;
  const fighter = (ref: React.RefObject<HTMLDivElement | null>, left: number, look: FighterLook, facing: 1 | -1, testId: string) => (
    <div ref={ref} data-testid={testId} className="absolute" style={{ left, top, width: S, height: S, opacity: 0, transformOrigin: '50% 100%' }}>
      <MonsterArt parts={look.parts} palette={look.palette} variant={look.variant} flip={facing < 0} className="h-full w-full" />
    </div>
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-30" data-testid="finisher">
      {fighter(winEl, layout.winLeft, winner, dir, 'fighter-winner')}
      {fighter(loseEl, layout.loseLeft, loser, dir > 0 ? -1 : 1, 'fighter-loser')}
      <div ref={host} className="absolute inset-0" />
    </div>
  );
}
