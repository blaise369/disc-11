import { useEffect, useRef } from 'react';
import { Application, Graphics, Text } from 'pixi.js';
import { sfx } from '../lib/sound';

/**
 * Cartoon defeat: a big weight drops onto the loser and dust puffs out. Never gory.
 * Calls onImpact when it lands so the card underneath can squash.
 */
export function Squash({ width, height, onImpact }: { width: number; height: number; onImpact?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const impact = useRef(onImpact);
  impact.current = onImpact;

  useEffect(() => {
    const app = new Application();
    let ready = false;
    let disposed = false;
    void app.init({ width, height, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true })
      .then(() => {
        if (disposed) return app.destroy(true, { children: true });
        ready = true;
        host.current?.appendChild(app.canvas);
        const ww = width * 0.6;
        const weight = new Graphics()
          .roundRect(-ww * 0.2, -20, ww * 0.4, 18, 6).stroke({ width: 4, color: 0x000000 })
          .poly([-ww / 2, 70, ww / 2, 70, ww * 0.38, 0, -ww * 0.38, 0]).fill(0x4a4f5c).stroke({ width: 4, color: 0x000000, join: 'round' });
        const label = new Text({ text: '1 TON', style: { fontFamily: 'Luckiest Guy, sans-serif', fontSize: 26, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
        label.anchor.set(0.5);
        label.position.set(0, 38);
        weight.addChild(label);
        weight.position.set(width / 2, -100);
        app.stage.addChild(weight);
        const dust: { g: Graphics; vx: number; vy: number; life: number }[] = [];
        const floor = height * 0.62;
        let vy = 0;
        let landed = false;
        app.ticker.add(t => {
          if (!landed) {
            vy += 1.6 * t.deltaTime;
            weight.y += vy * t.deltaTime;
            if (weight.y >= floor) {
              weight.y = floor;
              landed = true;
              sfx.thud();
              impact.current?.();
              for (let i = 0; i < 22; i++) {
                const g = new Graphics().circle(0, 0, 6 + Math.random() * 10).fill({ color: 0xe8dcc8, alpha: 0.9 });
                g.position.set(width / 2 + (Math.random() - 0.5) * ww, floor + 70);
                app.stage.addChild(g);
                dust.push({ g, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 3, life: 1 });
              }
            }
          }
          for (const d of dust) {
            d.g.x += d.vx * t.deltaTime;
            d.g.y += d.vy * t.deltaTime;
            d.life -= 0.02 * t.deltaTime;
            d.g.alpha = Math.max(0, d.life);
            d.g.scale.set(1 + (1 - d.life));
          }
        });
      });
    return () => {
      disposed = true;
      if (ready) app.destroy(true, { children: true });
    };
  }, [width, height]);

  return <div ref={host} className="pointer-events-none absolute inset-0 z-10" />;
}
