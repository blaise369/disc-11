// One finishing move per body type. The WINNER's species decides how the loser goes out.
// Everything is cartoon: monsters get squashed, zapped, carried off or turned to ash with
// blinking eyes, never hurt in a gory way.
import { Container, Graphics, Text } from 'pixi.js';
import { sfx } from '../../lib/sound';
import { easeIn, easeInOut, easeOut, easeOutBack, lerp, Pool, rand, seg, type Kit } from './kit';

export type Step = (t: number, dt: number) => void;
export interface FinisherDef {
  name: string;
  duration: number;
  run: (k: Kit) => Step;
}

const offscreen = (k: Kit, d: number, margin: number) => (d > 0 ? k.W + margin : -margin);

// ---------------------------------------------------------------- slime
const slime: FinisherDef = {
  name: 'Gloop Engulf',
  duration: 3.4,
  run(k) {
    const L = k.lose.box, Wn = k.win.box;
    const gw = L.w * 1.4, gh = L.h * 1.05;
    const goo = new Container();
    const body = new Graphics();
    body.moveTo(-gw / 2, 0)
      .bezierCurveTo(-gw / 2, -gh * 0.75, -gw * 0.3, -gh, 0, -gh)
      .bezierCurveTo(gw * 0.3, -gh, gw / 2, -gh * 0.75, gw / 2, 0);
    for (let i = 0; i < 5; i++) {
      const x0 = gw / 2 - (i * gw) / 5;
      body.quadraticCurveTo(x0 - gw / 10, 14, x0 - gw / 5, 0);
    }
    body.closePath().fill({ color: k.col.body, alpha: 0.82 }).stroke({ width: 5, color: k.col.dark, alpha: 0.9 });
    const shine = new Graphics().ellipse(-gw * 0.24, -gh * 0.72, gw * 0.07, gh * 0.12).fill({ color: 0xffffff, alpha: 0.5 });
    goo.addChild(body, shine);
    const bubbles = new Pool(goo, 16, () => new Graphics().circle(0, 0, 7).fill({ color: 0xffffff, alpha: 0.5 }).stroke({ width: 2, color: k.col.dark, alpha: 0.5 }));
    goo.position.set(Wn.cx, k.ground);
    goo.scale.set(0.3, 0.15);
    k.stage.addChild(goo);
    k.at(0.05, sfx.gloop);
    k.at(0.95, sfx.gloop);
    k.at(1.5, () => k.pop('BLORP!', L.cx, L.top - 10, { colour: 0x9bff6a }));
    let lastBubble = 0;
    return (t, dt) => {
      goo.x = lerp(Wn.cx, L.cx, easeInOut(seg(t, 0, 0.9)));
      if (t < 0.9) goo.scale.set(0.3 + 0.05 * Math.sin(t * 20), 0.15 + 0.04 * Math.cos(t * 20));
      else if (t < 2.7) {
        const grow = easeOutBack(seg(t, 0.9, 1.4));
        const wob = 0.035 * Math.sin(t * 9);
        goo.scale.set(lerp(0.3, 1, grow) + wob, lerp(0.15, 1, grow) - wob);
      } else {
        const p = easeInOut(seg(t, 2.7, 3.3));
        goo.scale.set(lerp(1, 1.25, p), lerp(1, 0.1, p));
      }
      const dz = seg(t, 1.4, 2.7);
      k.lose.set({ sx: 1 - 0.5 * dz, sy: 1 - 0.6 * dz, y: -dz * 20, opacity: 1 - dz, filter: `hue-rotate(${dz * 120}deg) blur(${dz * 4}px) saturate(${1 + dz})` });
      if (t > 1.2 && t < 2.8 && t - lastBubble > 0.1) {
        lastBubble = t;
        bubbles.spawn(rand(-gw * 0.35, gw * 0.35), -rand(8, 40), p => {
          p.vy = -rand(60, 130);
          p.life = rand(0.6, 1.1);
          p.c.scale.set(rand(0.5, 1.4));
        });
        if (Math.random() < 0.35) sfx.bubble();
      }
      bubbles.update(dt, p => {
        p.c.x += Math.sin(p.age * 8 + p.c.y) * 0.4;
        return -p.c.y < gh * 0.92;
      });
    };
  },
};

// ---------------------------------------------------------------- mechanoid
const mechanoid: FinisherDef = {
  name: 'Grabber Arm',
  duration: 3.7,
  run(k) {
    const L = k.lose.box, Wn = k.win.box, d = k.dir;
    const sx0 = Wn.cx + d * Wn.w * 0.42, sy0 = Wn.cy - 10;
    const tx = L.cx - d * 18, ty = L.cy - L.h * 0.08;
    const dist = Math.hypot(tx - sx0, ty - sy0);
    const ang = Math.atan2(ty - sy0, tx - sx0);
    const N = 5, segLen = dist / N + 16;
    const arm = new Container();
    arm.position.set(sx0, sy0);
    const segs: Graphics[] = [];
    for (let i = 0; i < N; i++) {
      const h = 28 - i * 3.5;
      const s = new Graphics()
        .roundRect(0, -h / 2, segLen, h, 6).fill(i % 2 ? 0xaeb6c2 : 0xc9cfd8).stroke({ width: 3, color: 0x2a2f3a })
        .rect(4, -h / 2 + 2, 7, h - 4).fill(k.col.accent)
        .circle(segLen - 9, 0, 3).fill(0x6b7a8f);
      segs.push(s);
    }
    // Thinner tubes sit inside thicker ones: add thinnest first.
    [...segs].reverse().forEach(s => arm.addChild(s));
    const claw = new Container();
    const jaw = () => new Graphics()
      .moveTo(0, 0).lineTo(30, -10).lineTo(46, 4).lineTo(38, 8).lineTo(28, 0).lineTo(0, 7).closePath()
      .fill(0xdfe6ee).stroke({ width: 3, color: 0x2a2f3a, join: 'round' });
    const jawTop = jaw();
    jawTop.position.set(12, -9);
    const jawBot = jaw();
    jawBot.position.set(12, 9);
    jawBot.scale.y = -1;
    const palm = new Graphics().roundRect(-6, -18, 22, 36, 6).fill(0x8a94a6).stroke({ width: 3, color: 0x2a2f3a });
    claw.addChild(jawTop, jawBot, palm);
    const mount = new Graphics().circle(0, 0, 20).fill(0x6b7a8f).stroke({ width: 4, color: 0x2a2f3a }).circle(0, 0, 7).fill(k.col.accent);
    arm.addChild(claw, mount);
    arm.scale.set(0);
    arm.rotation = ang;
    k.stage.addChild(arm);
    const sparks = new Pool(k.stage, 24, () => new Graphics().rect(-6, -1.5, 12, 3).fill(0xffe14d));

    k.at(0.25, sfx.servo);
    k.at(1.0, sfx.clank);
    k.at(1.02, () => k.pop('CLAMP!', L.cx, L.top - 16, { colour: 0xc9cfd8 }));
    k.at(1.95, sfx.crunch);
    k.at(2.0, () => k.pop('CRUNCH!', L.cx, L.top - 40));
    k.at(2.62, sfx.zip);
    k.at(2.68, () => k.pop('YEET!', L.cx, 70, { colour: 0xff7a1a }));
    let fly: { x: number; y: number; vx: number; vy: number; rot: number } | null = null;
    return (t, dt) => {
      arm.scale.set(easeOutBack(seg(t, 0, 0.25)));
      const ext = t < 2.7 ? easeOut(seg(t, 0.25, 0.95)) : 1 - easeIn(seg(t, 2.9, 3.5));
      segs.forEach((s, i) => (s.x = (ext * i * dist) / N));
      claw.x = ext * dist;
      const open = t < 0.95 ? seg(t, 0.3, 0.8) : 1 - seg(t, 0.95, 1.1);
      jawTop.rotation = -open * 0.6;
      jawBot.rotation = -open * 0.6;
      const lift = easeInOut(seg(t, 1.2, 1.9));
      const fling = easeIn(seg(t, 2.45, 2.65));
      arm.rotation = ang - d * lift * 0.55 + d * fling * 0.9;
      const s = 1 - 0.55 * easeOutBack(seg(t, 1.9, 2.3));
      if (t >= 1.0 && t < 2.65) {
        const reach = claw.x + 26;
        const cx = sx0 + Math.cos(arm.rotation) * reach;
        const cy = sy0 + Math.sin(arm.rotation) * reach;
        const crush = seg(t, 1.9, 2.3);
        k.lose.set({
          x: cx - L.cx, y: cy - L.bottom + (s * L.h) / 2, sx: s, sy: s,
          rot: Math.sin(t * 30) * 5 * lift * (1 - crush),
          filter: crush ? `grayscale(${crush}) contrast(${1 + crush * 0.3})` : '',
          clip: crush ? `inset(${crush * 14}% round 10px)` : '',
        });
        if (t > 1.9 && t < 2.3 && Math.random() < 0.6) {
          sparks.spawn(cx, cy, p => {
            const a = rand(0, Math.PI * 2);
            p.vx = Math.cos(a) * rand(200, 420);
            p.vy = Math.sin(a) * rand(200, 420);
            p.c.rotation = a;
            p.life = 0.35;
          });
        }
      } else if (t >= 2.65) {
        fly ??= { x: k.lose.s.x, y: k.lose.s.y, vx: d * 620, vy: -820, rot: 0 };
        fly.vy += 1500 * dt;
        fly.x += fly.vx * dt;
        fly.y += fly.vy * dt;
        fly.rot += d * 900 * dt;
        k.lose.set({ x: fly.x, y: fly.y, rot: fly.rot });
      }
      sparks.update(dt, p => void (p.c.alpha = 1 - p.age / p.life));
    };
  },
};

// ---------------------------------------------------------------- furball
const furball: FinisherDef = {
  name: 'Hairball Steamroller',
  duration: 3.3,
  run(k) {
    const L = k.lose.box, Wn = k.win.box, d = k.dir;
    const R = Math.min(L.h * 0.4, 115);
    const ball = new Container();
    const fuzz = new Graphics();
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      fuzz.circle(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88, R * 0.2 + 4).fill(k.col.dark);
    }
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      fuzz.circle(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88, R * 0.2).fill(k.col.body);
    }
    fuzz.circle(0, 0, R * 0.9).fill(k.col.body);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      fuzz.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2)
        .quadraticCurveTo(Math.cos(a + 0.7) * R * 0.75, Math.sin(a + 0.7) * R * 0.75, Math.cos(a + 1.2) * R * 0.6, Math.sin(a + 1.2) * R * 0.6);
    }
    fuzz.stroke({ width: 5, color: k.col.dark, alpha: 0.45, cap: 'round' });
    ball.addChild(fuzz);
    ball.position.set(Wn.cx, k.ground - R);
    ball.scale.set(0);
    k.stage.addChild(ball);
    const fluff = new Pool(k.stage, 30, () => new Graphics().circle(0, 0, 6).fill(k.col.body).stroke({ width: 2, color: k.col.dark }));
    const startX = Wn.cx;
    const hitX = L.cx - d * L.w * 0.35;
    const endX = offscreen(k, d, R * 2);
    let hit = -1;
    k.at(0.3, sfx.rumble);
    return (t, dt) => {
      ball.scale.set(easeOutBack(seg(t, 0, 0.35)));
      const prevX = ball.x;
      if (t < 1.4) ball.x = lerp(startX, hitX + d * L.w * 0.4, easeIn(seg(t, 0.35, 1.4)));
      else ball.x = lerp(hitX + d * L.w * 0.4, endX, seg(t, 1.4, 2.2));
      ball.rotation += (ball.x - prevX) / R;
      ball.y = k.ground - R - Math.abs(Math.sin(t * 14)) * 6;
      if (hit < 0 && d * (ball.x - hitX) >= 0) {
        hit = t;
        sfx.squish();
        k.pop('SPLAT!', L.cx, L.top + L.h * 0.4, { size: 46 });
      }
      if (hit >= 0) {
        const f = easeOut(seg(t, hit, hit + 0.18));
        const flutter = Math.sin(t * 9) * 3 * seg(t, 2.2, 2.4) * (1 - seg(t, 2.6, 3.2));
        k.lose.set({ sy: lerp(1, 0.07, f), sx: lerp(1, 1.35, f), rot: flutter });
      }
      if (t > 0.4 && t < 2.2 && Math.random() < 0.5) {
        fluff.spawn(ball.x - d * R * 0.6, ball.y + rand(-R * 0.6, R * 0.6), p => {
          p.vx = -d * rand(40, 140);
          p.vy = rand(-120, -20);
          p.life = rand(0.5, 0.9);
        });
      }
      fluff.update(dt, p => {
        p.vy += 300 * dt;
        p.c.alpha = 1 - p.age / p.life;
      });
    };
  },
};

// ---------------------------------------------------------------- mutant
const mutant: FinisherDef = {
  name: 'Toxic Burp',
  duration: 3.5,
  run(k) {
    const L = k.lose.box, Wn = k.win.box, d = k.dir;
    const mx = Wn.cx + d * Wn.w * 0.15, my = Wn.top + Wn.h * 0.42;
    const gas = new Pool(k.stage, 44, () => new Graphics().circle(0, 0, 20).fill({ color: 0x9bff3a, alpha: 0.5 }).circle(6, -5, 9).fill({ color: 0xd8ff9a, alpha: 0.5 }));
    const ring = new Graphics().circle(0, 0, 40).stroke({ width: 6, color: 0x9bff3a });
    ring.visible = false;
    k.stage.addChild(ring);
    k.at(0.42, sfx.burp);
    k.at(0.45, () => k.pop('BUUURP!', Wn.cx, Wn.top - 4, { colour: 0x9bff3a }));
    k.at(1.75, sfx.pop);
    k.at(2.25, () => k.pop('eep!', L.cx, L.bottom - 60, { size: 24, colour: 0xffffff, hold: 0.5 }));
    const away = offscreen(k, d, 60) - L.cx;
    return (t, dt) => {
      const swell = easeOut(seg(t, 0, 0.4)) * (1 - easeOutBack(seg(t, 0.4, 0.65)));
      k.win.set({ sx: 1 + 0.14 * swell, sy: 1 + 0.1 * swell });
      if (t > 0.42 && t < 1.35) {
        for (let i = 0; i < 2; i++) {
          gas.spawn(mx, my + rand(-10, 10), p => {
            p.vx = d * rand(320, 560);
            p.vy = rand(-70, 50);
            p.life = 1.3;
            p.data.s = rand(0.4, 0.8);
          });
        }
      }
      gas.update(dt, p => {
        p.vx *= 0.985;
        p.c.scale.set(p.data.s! + p.age * 1.5);
        p.c.alpha = 0.8 * (1 - p.age / p.life);
      });
      const green = seg(t, 1.0, 1.7);
      const shrink = easeInOut(seg(t, 1.7, 2.2));
      const s = lerp(1, 0.28, shrink);
      let x = Math.sin(t * 60) * 4 * green * (1 - shrink);
      let y = 0;
      if (t > 2.2) {
        const hp = seg(t, 2.2, 3.4) * 3;
        const hop = hp % 1;
        x = (away * Math.min(hp, 3)) / 3;
        y = -Math.sin(hop * Math.PI) * 60;
        if (hp < 3 && hop < 0.05) sfx.pop();
      }
      k.lose.set({ x, y, sx: s, sy: s, filter: green ? `sepia(${green}) hue-rotate(${50 * green}deg) saturate(${1 + 2 * green})` : '' });
      if (t >= 1.7 && t < 2.1) {
        ring.visible = true;
        ring.position.set(L.cx, L.bottom - L.h * 0.3);
        const r = seg(t, 1.7, 2.1);
        ring.scale.set(0.5 + r * 2);
        ring.alpha = 1 - r;
      } else ring.visible = false;
    };
  },
};

// ---------------------------------------------------------------- beast
function star(size: number, colour: number): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? size * 0.45 : size;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new Graphics().poly(pts).fill(colour).stroke({ width: 2.5, color: 0x000000, join: 'round' });
}

const beast: FinisherDef = {
  name: 'Ground Pound',
  duration: 3.3,
  run(k) {
    const L = k.lose.box, Wn = k.win.box;
    const dx = L.cx - Wn.cx;
    const cracks = new Graphics();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      let x = L.cx, y = k.ground;
      cracks.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += Math.cos(a + rand(-0.4, 0.4)) * rand(20, 40) * -1;
        y += Math.abs(Math.sin(a)) * rand(2, 8);
        cracks.lineTo(x, y);
      }
    }
    cracks.stroke({ width: 4, color: 0x2a1622, cap: 'round', join: 'round' });
    cracks.pivot.set(L.cx, k.ground);
    cracks.position.set(L.cx, k.ground);
    cracks.scale.set(0);
    k.stage.addChild(cracks);
    const dust = new Pool(k.stage, 26, () => new Graphics().circle(0, 0, 12).fill({ color: 0xe8dcc8, alpha: 0.9 }));
    const stars = [0, 1, 2].map(() => {
      const s = star(11, 0xffe14d);
      s.visible = false;
      k.stage.addChild(s);
      return s;
    });
    k.at(1.0, () => {
      sfx.boom();
      k.shake(16, 0.5);
      k.pop('KA-THOOM!', L.cx, L.top - 34, { size: 48 });
      for (let i = 0; i < 22; i++) {
        dust.spawn(L.cx + rand(-L.w * 0.6, L.w * 0.6), k.ground - rand(0, 20), p => {
          p.vx = rand(-260, 260);
          p.vy = rand(-160, -30);
          p.life = rand(0.6, 1.0);
        });
      }
    });
    return (t, dt) => {
      const crouch = seg(t, 0, 0.25) * (1 - seg(t, 0.25, 0.35));
      if (t < 0.25) k.win.set({ sy: 1 - 0.15 * crouch, sx: 1 + 0.1 * crouch });
      else if (t < 0.85) {
        const p = seg(t, 0.25, 0.85);
        k.win.set({ sx: 1, sy: 1, x: dx * easeOut(p), y: -Math.sin((p * Math.PI) / 2) * L.h * 0.95, rot: -k.dir * 12 * p });
      } else if (t < 1.0) {
        const p = easeIn(seg(t, 0.85, 1.0));
        k.win.set({ x: dx, y: lerp(-L.h * 0.95, -L.h * 0.15, p), rot: -k.dir * 12 * (1 - p) });
      } else if (t < 1.25) {
        const sq = Math.sin(seg(t, 1.0, 1.25) * Math.PI);
        k.win.set({ x: dx, y: -L.h * 0.15, sx: 1 + 0.15 * sq, sy: 1 - 0.15 * sq, rot: 0 });
      } else if (t < 1.9) {
        const p = easeInOut(seg(t, 1.25, 1.9));
        k.win.set({ x: dx * (1 - p), y: lerp(-L.h * 0.15, 0, p) - Math.sin(p * Math.PI) * L.h * 0.5, sx: 1, sy: 1 });
      } else k.win.set({ x: 0, y: 0, rot: 0 });

      const flat = easeOutBack(seg(t, 0.98, 1.12));
      k.lose.set({ sy: 1 - 0.85 * flat, sx: 1 + 0.35 * flat });
      cracks.scale.set(easeOut(seg(t, 1.0, 1.15)));
      dust.update(dt, p => {
        p.vy += 200 * dt;
        p.c.alpha = 1 - p.age / p.life;
        p.c.scale.set(1 + p.age);
      });
      stars.forEach((s, i) => {
        s.visible = t > 1.3;
        const a = t * 5 + (i * Math.PI * 2) / 3;
        s.position.set(L.cx + Math.cos(a) * 46, k.ground - L.h * 0.22 + Math.sin(a) * 10);
        s.rotation = t * 4;
      });
    };
  },
};

// ---------------------------------------------------------------- bug
const bug: FinisherDef = {
  name: 'Swarm Lift',
  duration: 3.4,
  run(k) {
    const L = k.lose.box, Wn = k.win.box, d = k.dir;
    const N = 38;
    const bugs = Array.from({ length: N }, (_, i) => {
      const c = new Container();
      const wings = new Graphics().ellipse(-4, -6, 6, 4).ellipse(4, -6, 6, 4).fill({ color: 0xffffff, alpha: 0.75 }).stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
      const body = new Graphics().ellipse(0, 0, 7, 5).fill(i % 3 ? k.col.dark : k.col.accent).stroke({ width: 1.5, color: 0x000000 }).circle(7, -1, 3.5).fill(0x111111);
      c.addChild(wings, body);
      k.stage.addChild(c);
      const sx = Wn.cx + rand(-Wn.w * 0.3, Wn.w * 0.3), sy = Wn.cy + rand(-Wn.h * 0.3, Wn.h * 0.2);
      return {
        c, wings, sx, sy,
        ox: rand(-L.w * 0.45, L.w * 0.45), oy: rand(-L.h * 0.45, L.h * 0.45),
        cx: lerp(sx, L.cx, 0.5) + rand(-60, 60), cy: Math.min(sy, L.cy) - rand(60, 160),
        delay: i * 0.022, phase: rand(0, 10),
      };
    });
    k.at(0.05, sfx.buzz);
    k.at(1.0, sfx.buzz);
    k.at(1.5, () => k.pop('BZZZT!', L.cx, L.top - 20, { colour: 0xffe14d }));
    k.at(1.9, sfx.buzz);
    const carryX = d * k.W * 0.22, carryY = -(L.bottom + 80);
    return t => {
      const e = easeIn(seg(t, 1.9, 3.1));
      const cx = carryX * e, cy = carryY * e;
      const darken = seg(t, 1.3, 1.9);
      k.lose.set({ x: cx, y: cy + (e ? Math.sin(t * 8) * 6 : 0), rot: e ? Math.sin(t * 6) * 10 : 0, filter: darken ? `brightness(${1 - 0.35 * darken})` : '' });
      for (const b of bugs) {
        const p = easeInOut(seg(t, b.delay, b.delay + 0.95));
        const tx = L.cx + b.ox, ty = L.cy + b.oy;
        const prevX = b.c.x, prevY = b.c.y;
        // quadratic bezier from the winner to a spot on the loser
        const x = (1 - p) * (1 - p) * b.sx + 2 * (1 - p) * p * b.cx + p * p * tx;
        const y = (1 - p) * (1 - p) * b.sy + 2 * (1 - p) * p * b.cy + p * p * ty;
        const jig = p >= 1 ? 3 : 1;
        b.c.position.set(x + cx + Math.sin(t * 20 + b.phase) * jig, y + cy + Math.cos(t * 23 + b.phase) * jig);
        const vx = b.c.x - prevX, vy = b.c.y - prevY;
        if (Math.abs(vx) + Math.abs(vy) > 0.5) b.c.rotation = Math.atan2(vy, vx);
        b.c.visible = t >= b.delay;
        b.wings.scale.y = Math.sin(t * 60 + b.phase) > 0 ? 1 : 0.3;
      }
    };
  },
};

// ---------------------------------------------------------------- ghoul
const ghoul: FinisherDef = {
  name: 'Spooky Possession',
  duration: 3.4,
  run(k) {
    const L = k.lose.box, Wn = k.win.box, d = k.dir;
    const gw = Wn.w * 0.55, gh = gw * 1.1;
    const ghost = new Container();
    const shape = new Graphics()
      .moveTo(-gw / 2, 0).bezierCurveTo(-gw / 2, -gh * 1.15, gw / 2, -gh * 1.15, gw / 2, 0)
      .lineTo(gw / 3, gh * 0.25).lineTo(gw / 6, gh * 0.05).lineTo(0, gh * 0.25).lineTo(-gw / 6, gh * 0.05).lineTo(-gw / 3, gh * 0.25).closePath()
      .fill({ color: k.col.light, alpha: 0.8 }).stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
    const face = new Graphics()
      .ellipse(-gw * 0.16, -gh * 0.55, gw * 0.09, gh * 0.12).ellipse(gw * 0.16, -gh * 0.55, gw * 0.09, gh * 0.12).fill(0x1d1028)
      .ellipse(0, -gh * 0.28, gw * 0.08, gh * 0.09).fill(0x1d1028);
    ghost.addChild(shape, face);
    ghost.scale.set(d, 1);
    ghost.alpha = 0;
    k.stage.addChild(ghost);
    const wisps = new Pool(k.stage, 24, () => new Graphics().circle(0, 0, 8).fill({ color: 0xe6d4ff, alpha: 0.6 }));
    k.at(0.3, sfx.spooky);
    k.at(1.2, () => k.pop('BOO!', L.cx, L.top - 16, { colour: 0xe6d4ff, size: 50 }));
    const x0 = Wn.cx, y0 = Wn.cy, x1 = L.cx, y1 = L.cy;
    return (t, dt) => {
      const p = easeInOut(seg(t, 0.3, 1.2));
      ghost.position.set(lerp(x0, x1, p), lerp(y0, y1, p) - seg(t, 0, 0.3) * 30 + Math.sin(p * Math.PI * 3) * 25);
      const enter = seg(t, 1.2, 1.4);
      ghost.alpha = 0.85 * seg(t, 0, 0.3) * (1 - enter);
      ghost.scale.set(d * (1 - 0.7 * enter), 1 - 0.7 * enter);
      const pos = seg(t, 1.3, 2.2);
      const up = easeIn(seg(t, 2.2, 3.4));
      k.lose.set({
        filter: pos ? `grayscale(${pos}) brightness(${1 + 0.5 * pos}) drop-shadow(0 0 ${12 * pos}px #c9a0ff)` : '',
        opacity: (1 - 0.35 * pos) * (1 - up),
        x: Math.sin(t * 47) * 3 * pos * (1 - up) + Math.sin(t * 4) * 20 * up,
        rot: Math.sin(t * 31) * 5 * pos,
        y: -pos * 10 - up * (L.bottom + 40),
      });
      if (up > 0 && up < 0.9 && Math.random() < 0.4) {
        wisps.spawn(L.cx + k.lose.s.x + rand(-L.w * 0.3, L.w * 0.3), L.bottom + k.lose.s.y, q => {
          q.vy = rand(20, 60);
          q.life = 0.7;
        });
      }
      wisps.update(dt, q => {
        q.c.alpha = 0.6 * (1 - q.age / q.life);
        q.c.scale.set(1 - q.age / q.life);
      });
    };
  },
};

// ---------------------------------------------------------------- rockling
function rock(r: number, colour: number): Graphics {
  const pts: number[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * rand(0.75, 1.1);
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new Graphics().poly(pts).fill(colour).stroke({ width: 3.5, color: 0x2a2630, join: 'round' })
    .moveTo(-r * 0.3, -r * 0.2).lineTo(0, r * 0.1).lineTo(r * 0.25, 0).stroke({ width: 2, color: 0x2a2630, alpha: 0.6 });
}

const rockling: FinisherDef = {
  name: 'Rockslide',
  duration: 3.4,
  run(k) {
    const L = k.lose.box;
    const rows = [5, 4, 3, 2, 1];
    const rowH = L.h * 0.19;
    const spacing = (L.w * 1.25) / 5;
    const greys = [0x8a8f99, 0x6b7a8f, 0xa0a4ab, 0x7d7468];
    const rocks: { g: Graphics; x: number; y: number; start: number; landed: boolean; spin: number }[] = [];
    let i = 0;
    rows.forEach((n, row) => {
      for (let j = 0; j < n; j++) {
        const r = spacing * 0.62 * rand(0.9, 1.1);
        const gfx = rock(r, i % 5 === 4 ? k.col.accent : greys[i % greys.length]!);
        gfx.visible = false;
        k.stage.addChild(gfx);
        rocks.push({ g: gfx, x: L.cx + (j - (n - 1) / 2) * spacing + rand(-6, 6), y: k.ground - r * 0.7 - row * rowH, start: 0.45 + i * 0.12, landed: false, spin: rand(-6, 6) });
        i++;
      }
    });
    const dust = new Pool(k.stage, 30, () => new Graphics().circle(0, 0, 10).fill({ color: 0xd6cdbd, alpha: 0.85 }));
    k.at(0, () => {
      sfx.rumble();
      k.shake(5, 0.6);
      k.pop('RUMBLE!', L.cx, 60, { colour: 0xd6cdbd });
    });
    const last = rocks[rocks.length - 1]!;
    k.at(last.start + 0.4, () => k.pop('ROCK BOTTOM!', L.cx, last.y - 70, { size: 34 }));
    return (t, dt) => {
      for (const r of rocks) {
        if (t < r.start) continue;
        r.g.visible = true;
        const p = seg(t, r.start, r.start + 0.35);
        const fall = easeIn(p);
        const bounce = p >= 1 ? Math.sin(seg(t, r.start + 0.35, r.start + 0.55) * Math.PI) * 10 : 0;
        r.g.position.set(r.x, lerp(-80, r.y, fall) - bounce);
        r.g.rotation = r.spin * (1 - p) * 0.3;
        if (p >= 1 && !r.landed) {
          r.landed = true;
          sfx.thump();
          for (let j = 0; j < 4; j++) {
            dust.spawn(r.x + rand(-20, 20), r.y + 10, q => {
              q.vx = rand(-150, 150);
              q.vy = rand(-90, -20);
              q.life = 0.6;
            });
          }
        }
      }
      const cover = seg(t, 0.45, rocks[rocks.length - 1]!.start + 0.35);
      k.lose.set({ filter: `brightness(${1 - 0.5 * cover})`, y: cover * 12, opacity: 1 - seg(t, 2.3, 2.6) });
      dust.update(dt, q => {
        q.c.alpha = 0.85 * (1 - q.age / q.life);
        q.c.scale.set(1 + q.age * 1.5);
      });
    };
  },
};

// ---------------------------------------------------------------- sprout
const sprout: FinisherDef = {
  name: 'Overgrowth',
  duration: 3.7,
  run(k) {
    const L = k.lose.box;
    const vines = new Container();
    const mask = new Graphics().rect(0, 0, k.W, k.ground + 4).fill(0xffffff);
    k.stage.addChild(mask);
    vines.mask = mask;
    k.stage.addChild(vines);
    const M = 34;
    const strands = [0, 1, 2, 3].map(v => {
      const phase = (v / 4) * Math.PI * 2;
      const dots: Graphics[] = [];
      for (let j = 0; j < M; j++) {
        const s = j / (M - 1);
        const x = L.cx + Math.sin(s * Math.PI * 2.4 + phase) * L.w * 0.56 * (1 - 0.3 * s);
        const y = k.ground + 6 - s * L.h * 0.95;
        const dot = new Graphics().circle(0, 0, 6.5 - s * 2).fill(0x3f8a2a).stroke({ width: 2, color: 0x1f4a14 });
        if (j % 5 === 3) dot.ellipse(9, -4, 10, 5).fill(0x6fd04f).stroke({ width: 1.5, color: 0x1f4a14 });
        dot.position.set(x, y);
        dot.visible = false;
        vines.addChild(dot);
        dots.push(dot);
      }
      return { dots, start: 0.15 + v * 0.08 };
    });
    const stem = new Graphics().rect(-4, -80, 8, 80).fill(0x3f8a2a).stroke({ width: 2, color: 0x1f4a14 })
      .ellipse(-14, -40, 14, 6).fill(0x6fd04f);
    stem.position.set(L.cx, k.ground);
    stem.scale.set(1, 0);
    const flower = new Container();
    const petals = new Graphics();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      petals.ellipse(Math.cos(a) * 18, Math.sin(a) * 18, 14, 9);
    }
    petals.fill(k.col.accent).stroke({ width: 2.5, color: 0x000000 });
    petals.circle(0, 0, 11).fill(0xffe14d).stroke({ width: 2.5, color: 0x000000 });
    flower.addChild(petals);
    flower.position.set(L.cx, k.ground - 80);
    flower.scale.set(0);
    k.stage.addChild(stem, flower);
    k.at(0.15, sfx.rumble);
    k.at(1.7, () => k.pop('GULP!', L.cx, L.top - 10, { colour: 0x6fd04f }));
    k.at(2.85, sfx.chime);
    k.at(2.9, () => k.pop('BLOOM!', L.cx, k.ground - 150, { colour: 0xff9eb5 }));
    return t => {
      for (const s of strands) {
        const n = Math.floor(seg(t, s.start, s.start + 1.3) * M);
        s.dots.forEach((dot, j) => (dot.visible = j < n));
      }
      const sink = easeIn(seg(t, 1.6, 2.6)) * (L.h + 24);
      vines.y = sink;
      k.lose.set({ y: sink, x: sink ? Math.sin(t * 30) * 3 : 0, clip: sink ? `inset(0 0 ${sink}px 0)` : '' });
      stem.scale.y = easeOut(seg(t, 2.6, 2.9));
      flower.scale.set(easeOutBack(seg(t, 2.85, 3.2)));
      flower.rotation = Math.sin(t * 3) * 0.12;
    };
  },
};

// ---------------------------------------------------------------- fishling
const fishling: FinisherDef = {
  name: 'Tidal Wave',
  duration: 3.5,
  run(k) {
    const L = k.lose.box, Wn = k.win.box, d = k.dir;
    const ww = Math.min(k.W * 0.42, 420), wh = k.H * 0.92;
    const wave = new Container();
    const shape = new Graphics()
      .moveTo(-ww * 1.6, 0).quadraticCurveTo(-ww * 1.15, -wh * 0.08, -ww, -wh * 0.5)
      .bezierCurveTo(-ww * 0.6, -wh * 0.72, -ww * 0.25, -wh * 1.02, 0, -wh * 0.95)
      .bezierCurveTo(ww * 0.18, -wh * 0.9, ww * 0.22, -wh * 0.62, ww * 0.08, -wh * 0.55)
      .bezierCurveTo(ww * 0.02, -wh * 0.7, -ww * 0.05, -wh * 0.68, -ww * 0.06, -wh * 0.58)
      .bezierCurveTo(ww * 0.05, -wh * 0.3, ww * 0.12, -wh * 0.1, ww * 0.2, 0).closePath()
      .fill(0x2e9be6).stroke({ width: 5, color: 0x0d4a7a });
    const band = new Graphics()
      .moveTo(-ww, -wh * 0.2).bezierCurveTo(-ww * 0.5, -wh * 0.35, -ww * 0.2, -wh * 0.5, -ww * 0.06, -wh * 0.45)
      .bezierCurveTo(0, -wh * 0.25, ww * 0.06, -wh * 0.1, ww * 0.12, 0).lineTo(-ww * 1.4, 0).closePath()
      .fill({ color: 0x5fc0ff, alpha: 0.7 });
    const foam = new Graphics();
    for (let i = 0; i < 9; i++) foam.circle(-ww * 0.5 + i * ww * 0.07, -wh * (0.78 + Math.sin(i) * 0.06) - i * 4, 12 + (i % 3) * 4);
    foam.fill(0xffffff).stroke({ width: 2, color: 0x0d4a7a });
    wave.addChild(shape, band, foam);
    wave.scale.set(d, 0);
    // Only show the wave in front of the winner, so it rises up beside them, not over them.
    const waveMask = d > 0
      ? new Graphics().rect(Wn.right + 4, 0, k.W, k.H).fill(0xffffff)
      : new Graphics().rect(0, 0, Wn.left - 4, k.H).fill(0xffffff);
    wave.mask = waveMask;
    k.stage.addChild(waveMask, wave);
    const drops = new Pool(k.stage, 40, () => new Graphics().circle(0, 0, 5).fill(0xbfe6ff).stroke({ width: 1.5, color: 0x0d4a7a }));
    const fish = new Graphics().ellipse(0, 0, 22, 12).fill(k.col.accent).stroke({ width: 3, color: 0x000000 })
      .poly([-18, 0, -34, -12, -34, 12]).fill(k.col.accent).stroke({ width: 3, color: 0x000000, join: 'round' })
      .circle(10, -3, 3).fill(0x000000);
    fish.visible = false;
    k.stage.addChild(fish);
    const front0 = Wn.cx + d * Wn.w * 0.55;
    const frontEnd = offscreen(k, d, ww * 2);
    let hit = -1;
    let carry = { x: 0, rot: 0 };
    k.at(0.15, sfx.splash);
    return (t, dt) => {
      wave.scale.y = easeOutBack(seg(t, 0.15, 0.6));
      const front = lerp(front0, frontEnd, easeIn(seg(t, 0.4, 2.5)) * 0.6 + seg(t, 0.4, 2.5) * 0.4);
      wave.x = front - d * ww * 0.2;
      wave.y = k.ground + Math.sin(t * 6) * 4;
      if (hit < 0 && d * (front - (L.cx - d * L.w * 0.35)) >= 0) {
        hit = t;
        sfx.splash();
        k.pop('SPLOOSH!', L.cx, L.top - 20, { colour: 0xbfe6ff, size: 46 });
      }
      if (hit >= 0) {
        carry = { x: front - L.cx - d * L.w * 0.25, rot: carry.rot + d * 380 * dt };
        k.lose.set({ x: carry.x, y: -L.h * 0.25 - Math.sin(t * 10) * 10, rot: carry.rot, sx: 0.85, sy: 0.85 });
      }
      if (t > 0.3 && t < 2.5) {
        drops.spawn(front, k.ground - wh * rand(0.5, 0.9), p => {
          p.vx = d * rand(80, 260);
          p.vy = rand(-260, -60);
          p.life = 0.8;
        });
      }
      drops.update(dt, p => {
        p.vy += 700 * dt;
        p.c.alpha = 1 - p.age / p.life;
      });
      if (t > 2.4) {
        fish.visible = true;
        fish.position.set(L.cx, k.ground - 14 - Math.abs(Math.sin(t * 9)) * 26);
        fish.scale.x = Math.sin(t * 9) > 0 ? 1 : -1;
        fish.rotation = Math.sin(t * 18) * 0.3;
      }
    };
  },
};

// ---------------------------------------------------------------- drake
const FLAME = [0xffe14d, 0xff9a1a, 0xe94f37, 0x6b6b6b];
const drake: FinisherDef = {
  name: 'Dragon Breath',
  duration: 3.8,
  run(k) {
    const L = k.lose.box, Wn = k.win.box, d = k.dir;
    const mx = Wn.cx + d * Wn.w * 0.28, my = Wn.top + Wn.h * 0.4;
    const ax = L.cx - mx, ay = L.cy - my;
    const len = Math.hypot(ax, ay);
    const flames = new Pool(k.stage, 90, () => new Graphics().circle(0, 0, 14).fill(0xffffff));
    const ash = new Pool(k.stage, 40, () => new Graphics().circle(0, 0, 4).fill(0x4a4a52));
    const smoke = new Pool(k.stage, 20, () => new Graphics().circle(0, 0, 12).fill({ color: 0x6b6b6b, alpha: 0.5 }));
    const pile = new Graphics()
      .ellipse(0, 0, L.w * 0.42, L.h * 0.17).fill(0x3a3a42).stroke({ width: 4, color: 0x000000 })
      .ellipse(-L.w * 0.1, -L.h * 0.06, L.w * 0.18, L.h * 0.05).fill(0x5a5a62);
    pile.position.set(L.cx, k.ground);
    pile.scale.set(0);
    const eyes = new Graphics()
      .circle(-14, 0, 9).circle(14, 0, 9).fill(0xffffff).stroke({ width: 2.5, color: 0x000000 })
      .circle(-12, 1, 4).circle(16, 1, 4).fill(0x000000);
    eyes.position.set(L.cx, k.ground - L.h * 0.08);
    eyes.scale.set(0);
    k.stage.addChild(pile, eyes);
    k.at(0.3, sfx.fire);
    k.at(0.4, () => k.pop('FWOOOSH!', lerp(Wn.cx, L.cx, 0.5), Math.min(Wn.top, L.top) - 6, { colour: 0xff9a1a, size: 44 }));
    k.at(2.0, sfx.crunch);
    k.at(2.3, () => k.pop('CRISPY!', L.cx, L.top + L.h * 0.4, { colour: 0xd6cdbd }));
    return (t, dt) => {
      const rear = seg(t, 0, 0.3) * (1 - seg(t, 0.3, 0.45));
      const lunge = seg(t, 0.3, 0.45) * (1 - seg(t, 1.8, 2.1));
      k.win.set({ rot: -d * 8 * rear + d * 5 * lunge, sx: 1 + 0.05 * rear, sy: 1 + 0.05 * rear });
      if (t > 0.3 && t < 1.9) {
        for (let i = 0; i < 3; i++) {
          flames.spawn(mx, my, p => {
            const sp = rand(560, 760);
            const spread = rand(-0.18, 0.18);
            const a = Math.atan2(ay, ax) + spread;
            p.vx = Math.cos(a) * sp;
            p.vy = Math.sin(a) * sp;
            p.life = (len / sp) * rand(0.9, 1.3);
          });
        }
      }
      flames.update(dt, p => {
        const f = p.age / p.life;
        p.c.scale.set(0.4 + f * 2.2);
        p.c.alpha = 1 - f * 0.85;
        p.c.tint = FLAME[Math.min(3, Math.floor(f * 4))]!;
      });
      const char = seg(t, 0.7, 2.0);
      const crumble = easeIn(seg(t, 2.0, 2.9));
      k.lose.set({
        filter: char ? `brightness(${1 - 0.8 * char}) sepia(${0.6 * char}) contrast(${1 + 0.3 * char})` : '',
        x: Math.sin(t * 50) * 3 * char * (1 - crumble), sy: 1 - crumble, sx: 1 + 0.2 * crumble,
      });
      if (crumble > 0 && crumble < 1) {
        ash.spawn(L.cx + rand(-L.w * 0.4, L.w * 0.4), L.bottom - L.h * (1 - crumble) + rand(-10, 10), p => {
          p.vx = rand(-60, 60);
          p.vy = rand(20, 80);
          p.life = 0.8;
        });
      }
      ash.update(dt, p => {
        p.vy += 300 * dt;
        return p.c.y < k.ground;
      });
      pile.scale.set(easeOutBack(seg(t, 2.0, 2.8)));
      const eyesIn = easeOutBack(seg(t, 2.9, 3.15));
      eyes.scale.set(eyesIn, eyesIn * (t % 1.6 < 0.12 ? 0.1 : 1));
      if (t > 2.2 && Math.random() < 0.15) {
        smoke.spawn(L.cx + rand(-30, 30), k.ground - L.h * 0.1, p => {
          p.vy = rand(-60, -30);
          p.vx = rand(-10, 10);
          p.life = 1.2;
        });
      }
      smoke.update(dt, p => {
        p.c.scale.set(1 + p.age);
        p.c.alpha = 0.5 * (1 - p.age / p.life);
      });
    };
  },
};

// ---------------------------------------------------------------- cosmo
const cosmo: FinisherDef = {
  name: 'UFO Abduction',
  duration: 3.6,
  run(k) {
    const L = k.lose.box, d = k.dir;
    const ufo = new Container();
    const dome = new Graphics().ellipse(0, -16, 40, 30).fill({ color: 0xbfe6ff, alpha: 0.75 }).stroke({ width: 3, color: 0x000000 })
      .ellipse(-12, -26, 10, 6).fill({ color: 0xffffff, alpha: 0.7 });
    const saucer = new Graphics().ellipse(0, 0, 92, 22).fill(k.col.accent).stroke({ width: 4, color: 0x000000 })
      .ellipse(0, 8, 60, 10).fill(k.col.dark);
    const lights = [-60, -30, 0, 30, 60].map((x, i) => {
      const l = new Graphics().circle(0, 0, 6).fill(i % 2 ? 0xffe14d : 0xff5fa2).stroke({ width: 2, color: 0x000000 });
      l.position.set(x, 4);
      return l;
    });
    ufo.addChild(dome, saucer, ...lights);
    const hoverY = Math.max(70, L.top - 70);
    const beamH = k.ground - hoverY - 10;
    const beam = new Graphics().poly([-35, 0, 35, 0, L.w * 0.7, beamH, -L.w * 0.7, beamH]).fill({ color: 0xfff3a8, alpha: 1 });
    beam.position.set(L.cx, hoverY + 12);
    beam.alpha = 0;
    k.stage.addChild(beam, ufo);
    const sparkles = new Pool(k.stage, 30, () => new Text({ text: '✦', style: { fontSize: 16, fill: 0xffffff } }));
    const twinkle = new Text({ text: '✦', style: { fontSize: 40, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
    twinkle.anchor.set(0.5);
    twinkle.visible = false;
    k.stage.addChild(twinkle);
    const startX = L.cx + d * k.W * 0.35;
    k.at(0.1, sfx.zip);
    k.at(0.75, sfx.beam);
    k.at(1.1, () => k.pop('ZWOOP!', L.cx + d * 90, hoverY + 60, { colour: 0xfff3a8 }));
    k.at(2.4, sfx.zip);
    k.at(3.05, sfx.chime);
    let exitX = 0, exitY = 0;
    return (t, dt) => {
      const arrive = easeOut(seg(t, 0, 0.7));
      const leave = easeIn(seg(t, 2.4, 3.0));
      ufo.position.set(lerp(startX, L.cx, arrive) + leave * -d * k.W * 0.8, lerp(-80, hoverY, arrive) + Math.sin(t * 5) * 5 - leave * 220);
      ufo.scale.set(1 - 0.6 * leave);
      lights.forEach((l, i) => (l.alpha = Math.sin(t * 14 + i) > 0 ? 1 : 0.35));
      if (leave >= 1) { exitX = ufo.x; exitY = ufo.y; }
      const beamOn = seg(t, 0.75, 0.9) * (1 - seg(t, 2.2, 2.35));
      beam.alpha = beamOn * (0.3 + 0.1 * Math.sin(t * 20));
      const lift = easeIn(seg(t, 1.0, 2.2));
      const targetY = hoverY + 10 - L.bottom;
      k.lose.set({ y: lift * targetY, sx: 1 - 0.85 * lift, sy: 1 - 0.85 * lift, rot: lift * 200 * d, opacity: 1 - seg(t, 2.0, 2.2) });
      if (beamOn > 0.5 && Math.random() < 0.5) {
        sparkles.spawn(L.cx + rand(-L.w * 0.5, L.w * 0.5), k.ground - rand(0, 40), p => {
          p.vy = -rand(120, 220);
          p.life = 1;
        });
      }
      sparkles.update(dt, p => {
        p.c.alpha = 1 - p.age / p.life;
        return p.c.y > hoverY;
      });
      twinkle.visible = t > 3.0;
      if (twinkle.visible) {
        twinkle.position.set(exitX || ufo.x, exitY || ufo.y);
        const tw = seg(t, 3.0, 3.6);
        twinkle.scale.set(Math.sin(tw * Math.PI) * 1.2);
        twinkle.rotation = tw * 3;
      }
    };
  },
};

export const FINISHERS: Record<string, FinisherDef> = {
  slime, mechanoid, furball, mutant, beast, bug, ghoul, rockling, sprout, fishling, drake, cosmo,
};

export function finisherFor(species: string): FinisherDef {
  return FINISHERS[species] ?? beast;
}
