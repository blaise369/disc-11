import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { sfx } from '../lib/sound';

const COLOUR_A = 0xff7a1a;
const COLOUR_B = 0x2e9be6;
const SPIN_MS = 4500;
const TURNS = 6;

/**
 * The fight wheel. A's slice starts at the pointer (top) and runs clockwise. When `spinRoll`
 * is set it spins and lands so the pointer sits at roll * 360° — A wins if roll < share.
 */
export function Wheel({ shareA, spinRoll, onSpinEnd, size = 260 }: {
  shareA: number;
  spinRoll: number | null;
  onSpinEnd?: () => void;
  size?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ target: shareA, roll: spinRoll, onSpinEnd });
  live.current.target = shareA;
  live.current.roll = spinRoll;
  live.current.onSpinEnd = onSpinEnd;

  useEffect(() => {
    const app = new Application();
    let ready = false;
    let disposed = false;
    const r = size / 2 - 14;

    void app.init({ width: size, height: size, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true })
      .then(() => {
        if (disposed) return app.destroy(true, { children: true });
        ready = true;
        host.current?.appendChild(app.canvas);
        app.canvas.style.width = `${size}px`;
        app.canvas.style.height = `${size}px`;

        const spinner = new Container();
        spinner.position.set(size / 2, size / 2);
        const pointer = new Graphics()
          .poly([size / 2 - 14, 2, size / 2 + 14, 2, size / 2, 30])
          .fill(0xffffff)
          .stroke({ width: 4, color: 0x000000, join: 'round' });
        app.stage.addChild(spinner, pointer);

        let share = -1;
        let wheel: Graphics | null = null;
        // A fresh Graphics per redraw. The replaced one is destroyed a few frames later:
        // destroying it in the frame it was swapped out leaves the renderer pointing at freed
        // batch data ("Cannot read properties of null (reading 'count')").
        const trash: { g: Graphics; frame: number }[] = [];
        let frame = 0;
        const draw = (p: number) => {
          const start = -Math.PI / 2;
          const split = start + Math.PI * 2 * p;
          const g = new Graphics();
          g.moveTo(0, 0).arc(0, 0, r, start, split).closePath().fill(COLOUR_A);
          g.moveTo(0, 0).arc(0, 0, r, split, start + Math.PI * 2).closePath().fill(COLOUR_B);
          for (let i = 0; i < 20; i++) {
            const a = start + (i / 20) * Math.PI * 2;
            g.moveTo(Math.cos(a) * (r - 10), Math.sin(a) * (r - 10)).lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          g.stroke({ width: 2, color: 0x000000, alpha: 0.35 });
          g.moveTo(0, 0).lineTo(Math.cos(start) * r, Math.sin(start) * r).moveTo(0, 0).lineTo(Math.cos(split) * r, Math.sin(split) * r)
            .stroke({ width: 4, color: 0xffffff });
          g.circle(0, 0, r).stroke({ width: 6, color: 0x000000 });
          g.circle(0, 0, 16).fill(0xfff8e8).stroke({ width: 4, color: 0x000000 });
          if (wheel) {
            spinner.removeChild(wheel);
            trash.push({ g: wheel, frame });
          }
          spinner.addChild(g);
          wheel = g;
        };

        let spin: { start: number; to: number; lastTick: number; done: boolean } | null = null;
        app.ticker.add(() => {
          frame++;
          while (trash.length && frame - trash[0]!.frame > 5) trash.shift()!.g.destroy();
          const cur = live.current;
          // Ease the slice toward the latest share after each skill round.
          const next = share < 0 ? cur.target : share + (cur.target - share) * 0.12;
          if (Math.abs(next - share) > 0.0005) {
            share = Math.abs(next - cur.target) < 0.001 ? cur.target : next;
            draw(share);
          }
          if (cur.roll !== null && !spin) {
            spin = { start: performance.now(), to: TURNS * Math.PI * 2 - cur.roll * Math.PI * 2, lastTick: 0, done: false };
          }
          if (spin && !spin.done) {
            const t = Math.min(1, (performance.now() - spin.start) / SPIN_MS);
            const eased = 1 - Math.pow(1 - t, 4);
            spinner.rotation = spin.to * eased;
            const ticks = Math.floor(spinner.rotation / (Math.PI / 10));
            if (ticks !== spin.lastTick) {
              spin.lastTick = ticks;
              sfx.tick();
            }
            if (t >= 1) {
              spin.done = true;
              cur.onSpinEnd?.();
            }
          }
        });
      });

    return () => {
      disposed = true;
      if (ready) app.destroy(true, { children: true });
    };
  }, [size]);

  return <div ref={host} style={{ width: size, height: size }} className="mx-auto" data-testid="wheel" />;
}
