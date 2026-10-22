// What happens after a spared attack, by stake: a bite, a capture, or a plain K.O.
import { Container, Graphics, Text } from 'pixi.js';
import { sfx } from '../../lib/sound';
import { easeIn, easeInOut, easeOut, easeOutBack, lerp, seg, type Kit } from './kit';
import { star, type Step } from './finishers';

export type Outcome =
  | { kind: 'eat' }
  | { kind: 'bite'; amount: number }
  | { kind: 'collect' }
  | { kind: 'ko' };

export interface TailDef {
  duration: number;
  run: (k: Kit, o: Outcome) => Step;
}

/** Practice fights: the loser is knocked out, seeing stars. */
const ko: TailDef = {
  duration: 1.5,
  run(k) {
    const L = k.lose.box;
    const stars = [0, 1, 2].map(() => {
      const s = star(10, 0xffe14d);
      k.stage.addChild(s);
      return s;
    });
    k.at(0.05, () => k.pop('K.O.!', L.cx, L.top - 34, { size: 46, colour: 0xffe14d }));
    return t => {
      k.lose.set({ rot: Math.sin(t * 6) * 9 * (1 - seg(t, 1.2, 1.5)), sy: 1 - 0.08 * easeOut(seg(t, 0, 0.2)), filter: '', clip: '' });
      stars.forEach((s, i) => {
        const a = t * 5 + (i * Math.PI * 2) / 3;
        s.position.set(L.cx + Math.cos(a) * L.w * 0.4, L.top - 4 + Math.sin(a) * 8);
        s.rotation = t * 4;
        s.alpha = 1 - seg(t, 1.15, 1.45);
      });
    };
  },
};

/** Bite stake: the winner takes a chomp out of the loser, and the strength flies across. */
const bite: TailDef = {
  duration: 1.7,
  run(k, o) {
    const L = k.lose.box, Wn = k.win.box, d = k.dir;
    const amount = o.kind === 'bite' ? o.amount : 0;
    const bx = L.cx - d * L.w * 0.3, by = L.top + L.h * 0.22;
    const reach = L.cx - Wn.cx - d * L.w * 0.85;
    const jaws = new Container();
    const jaw = (dir: 1 | -1) => {
      const g = new Graphics();
      const w = L.w * 0.5;
      const pts: number[] = [-w / 2, 0];
      for (let i = 0; i <= 6; i++) pts.push(-w / 2 + (i * w) / 6, i % 2 ? dir * 18 : 0);
      pts.push(w / 2, 0, w / 2, -dir * 16, -w / 2, -dir * 16);
      g.poly(pts).fill(0xffffff).stroke({ width: 3, color: 0x000000, join: 'round' });
      return g;
    };
    const top = jaw(1), bottom = jaw(-1);
    jaws.addChild(top, bottom);
    jaws.position.set(bx, by);
    jaws.visible = false;
    k.stage.addChild(jaws);
    const label = new Text({ text: `-${amount} STRENGTH`, style: { fontFamily: 'Luckiest Guy, sans-serif', fontSize: 34, fill: 0xff5a4a, stroke: { color: 0x000000, width: 7 } } });
    label.anchor.set(0.5);
    label.visible = false;
    k.stage.addChild(label);
    // A notch of three bite circles cut out of the loser (evenodd path in the art element's own pixels).
    const S = k.S;
    const divTop = L.bottom + S * 0.03 - S;
    // On the shoulder facing the winner, overlapping the body's edge.
    const nx = S / 2 - d * S * 0.19, ny = L.top + L.h * 0.22 - divTop, r = S * 0.085;
    const circle = (cx: number, cy: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
    const notch = `path(evenodd, "M0 0 H${S} V${S} H0 Z ${circle(nx - d * r * 0.4, ny + r * 0.9)} ${circle(nx, ny - r * 0.2)} ${circle(nx + d * r * 0.7, ny - r * 1.2)}")`;
    k.at(0.28, () => {
      sfx.crunch();
      sfx.squish();
      k.pop('CHOMP!', bx, by - 50, { size: 44 });
    });
    return t => {
      const go = easeIn(seg(t, 0, 0.25));
      const back = easeInOut(seg(t, 0.5, 0.9));
      k.win.set({ x: reach * go * (1 - back), y: -Math.sin(go * Math.PI) * 30, rot: d * 10 * go * (1 - back) });
      jaws.visible = t > 0.12 && t < 0.65;
      const close = easeIn(seg(t, 0.15, 0.28));
      top.y = lerp(-40, 0, close);
      bottom.y = lerp(40, 0, close);
      jaws.alpha = 1 - seg(t, 0.5, 0.65);
      const bitten = t >= 0.28;
      const flinch = seg(t, 0.28, 0.6);
      k.lose.set({ clip: bitten ? notch : '', filter: '', x: Math.sin(t * 60) * 5 * (1 - flinch) * (bitten ? 1 : 0), rot: bitten ? -d * 8 * Math.sin(flinch * Math.PI) : 0 });
      label.visible = t > 0.4 && amount > 0;
      const fly = easeInOut(seg(t, 0.55, 1.5));
      label.position.set(lerp(L.cx, Wn.cx, fly), lerp(L.top - 10, Wn.top - 20, fly) - Math.sin(fly * Math.PI) * 60);
      label.scale.set(easeOutBack(seg(t, 0.4, 0.55)) * (1 - 0.4 * fly));
      label.alpha = 1 - seg(t, 1.45, 1.7);
    };
  },
};

/** Collect stake: a capture orb swallows the loser and zooms into the winner's card. */
const collect: TailDef = {
  duration: 1.9,
  run(k) {
    const L = k.lose.box;
    const C = k.cardArt.win;
    const R = Math.max(L.w, L.h) * 0.62;
    const orb = new Graphics()
      .circle(0, 0, R).fill({ color: k.col.light, alpha: 0.22 }).stroke({ width: 6, color: k.col.accent })
      .circle(0, 0, R - 8).stroke({ width: 2, color: 0xffffff, alpha: 0.6 })
      .ellipse(-R * 0.4, -R * 0.45, R * 0.18, R * 0.1).fill({ color: 0xffffff, alpha: 0.7 });
    orb.position.set(L.cx, L.cy);
    orb.scale.set(0);
    const flash = new Graphics().circle(0, 0, 30).stroke({ width: 6, color: 0xffffff });
    flash.position.set(C.cx, C.cy);
    flash.visible = false;
    k.stage.addChild(orb, flash);
    k.at(0, sfx.beam);
    k.at(0.85, sfx.zip);
    k.at(1.5, () => {
      sfx.chime();
      k.pop('CAUGHT!', C.cx, C.top - 10, { size: 44, colour: 0xffe14d });
    });
    return t => {
      const grow = easeOutBack(seg(t, 0, 0.35));
      const shrink = easeInOut(seg(t, 0.35, 0.75));
      const fly = easeIn(seg(t, 0.8, 1.5));
      const ox = lerp(L.cx, C.cx, fly), oy = lerp(L.cy, C.cy, fly) - Math.sin(fly * Math.PI) * 120;
      const orbScale = grow * lerp(1, 0.22, fly);
      orb.position.set(ox, oy);
      orb.scale.set(orbScale * (1 + 0.04 * Math.sin(t * 20)));
      orb.visible = t < 1.5;
      const s = lerp(1, 0.4, shrink) * lerp(1, 0.22, fly);
      k.lose.set({ x: ox - L.cx, y: oy - L.bottom + (s * L.h) / 2, sx: s, sy: s, rot: fly * 360, opacity: t < 1.5 ? 1 : 0, filter: '', clip: '' });
      flash.visible = t >= 1.5;
      const f = seg(t, 1.5, 1.9);
      flash.scale.set(0.5 + f * 2.5);
      flash.alpha = 1 - f;
    };
  },
};

export const TAILS: Record<Exclude<Outcome['kind'], 'eat'>, TailDef> = { ko, bite, collect };
