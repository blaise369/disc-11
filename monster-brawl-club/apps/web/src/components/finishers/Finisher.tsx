import { useEffect, useRef } from 'react';
import { Application, Container } from 'pixi.js';
import { PALETTE, type MonsterPalette } from '@mbc/shared';
import { finisherFor } from './finishers';
import { popText, Puppet, type Box, type Kit } from './kit';

function boxOf(el: HTMLElement, arena: DOMRect): Box {
  const r = el.getBoundingClientRect();
  const left = r.left - arena.left, top = r.top - arena.top;
  return { left, top, right: left + r.width, bottom: top + r.height, w: r.width, h: r.height, cx: left + r.width / 2, cy: top + r.height / 2 };
}

const hex = (s: string) => parseInt(s.slice(1), 16);
function mixHex(a: number, b: number, t: number): number {
  const ch = (n: number, s: number) => (n >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

/**
 * Plays the winner's finishing move over the arena. Moves the real loser (and sometimes
 * winner) cards and draws effects on a PixiJS layer on top. Calls onDone when finished;
 * the final scene stays in place until unmounted.
 */
export function Finisher({ arena, winnerEl, loserEl, species, palette, onDone }: {
  arena: HTMLElement;
  winnerEl: HTMLElement;
  loserEl: HTMLElement;
  species: string;
  palette: MonsterPalette;
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const app = new Application();
    let ready = false;
    let disposed = false;
    const rect = arena.getBoundingClientRect();
    const win = new Puppet(winnerEl, boxOf(winnerEl, rect));
    const lose = new Puppet(loserEl, boxOf(loserEl, rect));
    const arenaPuppet = new Puppet(arena, { left: 0, top: 0, right: rect.width, bottom: rect.height, w: rect.width, h: rect.height, cx: rect.width / 2, cy: rect.height / 2 }, '50% 50%');

    void app.init({ width: rect.width, height: rect.height, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true })
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
        const body = hex(PALETTE[palette.body] ?? PALETTE[0]);
        const kit: Kit = {
          app, stage, W: rect.width, H: rect.height, win, lose, arena: arenaPuppet,
          dir: lose.box.cx >= win.box.cx ? 1 : -1,
          ground: Math.max(win.box.bottom, lose.box.bottom),
          col: { body, accent: hex(PALETTE[palette.accent] ?? PALETTE[1]), dark: mixHex(body, 0x120018, 0.55), light: mixHex(body, 0xffffff, 0.45) },
          at: (time, fn) => scheduled.push({ time, fn }),
          every: fn => updaters.push(fn),
          pop: () => undefined,
          shake: (strength, dur) => {
            shakeStrength = strength;
            shakeUntil = t + dur;
          },
        };
        kit.pop = popText(stage, kit.every, () => t);
        const def = finisherFor(species);
        const step = def.run(kit);
        let finished = false;
        app.ticker.add(tk => {
          const dt = Math.min(0.05, tk.deltaMS / 1000);
          t += dt;
          for (const s of scheduled) if (t >= s.time && s.time >= 0) { s.time = -1; s.fn(); }
          step(t, dt);
          for (const u of updaters) u(t, dt);
          if (t < shakeUntil) {
            const k = (shakeUntil - t) * shakeStrength * 2;
            arenaPuppet.set({ x: (Math.random() - 0.5) * k, y: (Math.random() - 0.5) * k });
          } else if (shakeUntil) {
            shakeUntil = 0;
            arenaPuppet.reset();
          }
          if (!finished && t >= def.duration) {
            finished = true;
            done.current();
          }
        });
      });

    return () => {
      disposed = true;
      if (ready) app.destroy(true, { children: true });
      win.reset();
      lose.reset();
      arenaPuppet.reset();
    };
  }, [arena, winnerEl, loserEl, species, palette]);

  return <div ref={host} className="pointer-events-none absolute inset-0 z-30" data-testid="finisher" />;
}
