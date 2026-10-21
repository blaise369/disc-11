// Toolkit for finisher animations: puppets that move the real card elements, plus a
// PixiJS layer for effects. Effects are created once and transformed every frame; nothing
// is destroyed mid-animation (redrawing/destroying Graphics mid-frame trips a Pixi bug).
import { Application, Container, Text } from 'pixi.js';

export interface Box {
  left: number; right: number; top: number; bottom: number;
  w: number; h: number; cx: number; cy: number;
}

export interface PuppetState {
  x: number; y: number; rot: number; sx: number; sy: number;
  opacity: number; filter: string; clip: string;
}

const IDLE: PuppetState = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, opacity: 1, filter: '', clip: '' };

/** Drives a DOM element (a fighter card or the arena) with transforms and filters. */
export class Puppet {
  s: PuppetState = { ...IDLE };
  constructor(private el: HTMLElement, public box: Box, origin = '50% 100%') {
    el.style.transformOrigin = origin;
    el.style.willChange = 'transform, filter, opacity';
  }
  set(p: Partial<PuppetState>): void {
    Object.assign(this.s, p);
    const { x, y, rot, sx, sy, opacity, filter, clip } = this.s;
    this.el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${sx}, ${sy})`;
    this.el.style.opacity = String(opacity);
    this.el.style.filter = filter;
    this.el.style.clipPath = clip;
  }
  reset(): void {
    this.s = { ...IDLE };
    this.el.style.transform = '';
    this.el.style.opacity = '';
    this.el.style.filter = '';
    this.el.style.clipPath = '';
    this.el.style.willChange = '';
  }
}

// ---------- timing and easing ----------
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Progress 0..1 of t through the window [a, b]. */
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeIn = (p: number) => p * p * p;
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const easeOutBack = (p: number) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- particles ----------
export interface Particle {
  c: Container;
  vx: number; vy: number;
  age: number; life: number;
  alive: boolean;
  data: Record<string, number>;
}

/** A fixed set of display objects reused as particles. */
export class Pool {
  items: Particle[] = [];
  constructor(parent: Container, n: number, make: (i: number) => Container) {
    for (let i = 0; i < n; i++) {
      const c = make(i);
      c.visible = false;
      parent.addChild(c);
      this.items.push({ c, vx: 0, vy: 0, age: 0, life: 1, alive: false, data: {} });
    }
  }
  spawn(x: number, y: number, init?: (p: Particle) => void): Particle | null {
    const p = this.items.find(i => !i.alive);
    if (!p) return null;
    Object.assign(p, { vx: 0, vy: 0, age: 0, life: 1, alive: true, data: {} });
    p.c.position.set(x, y);
    p.c.scale.set(1);
    p.c.alpha = 1;
    p.c.rotation = 0;
    p.c.visible = true;
    init?.(p);
    return p;
  }
  /** Step live particles; `fn` returns false to kill one. Default motion: velocity in px/s. */
  update(dt: number, fn?: (p: Particle, dt: number) => boolean | void): void {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.age += dt;
      p.c.x += p.vx * dt;
      p.c.y += p.vy * dt;
      if (p.age >= p.life || fn?.(p, dt) === false) {
        p.alive = false;
        p.c.visible = false;
      }
    }
  }
}

export interface Colours {
  body: number;
  accent: number;
  dark: number;
  light: number;
}

export interface Kit {
  app: Application;
  stage: Container;
  W: number;
  H: number;
  win: Puppet;
  lose: Puppet;
  arena: Puppet;
  /** +1 if the loser is to the right of the winner. */
  dir: 1 | -1;
  /** y of the ground line (bottom of the cards). */
  ground: number;
  col: Colours;
  /** Run fn once when the timeline passes `time` seconds. */
  at: (time: number, fn: () => void) => void;
  /** Run fn every frame (for particles and helpers). */
  every: (fn: (t: number, dt: number) => void) => void;
  /** A cartoon word that pops in, wobbles and fades out. */
  pop: (text: string, x: number, y: number, opts?: { colour?: number; size?: number; hold?: number }) => void;
  /** Shake the whole arena for `dur` seconds. */
  shake: (strength: number, dur: number) => void;
}

export function popText(stage: Container, every: Kit['every'], now: () => number) {
  return (text: string, x: number, y: number, opts: { colour?: number; size?: number; hold?: number } = {}) => {
    const t = new Text({
      text,
      style: {
        fontFamily: 'Luckiest Guy, Fredoka, sans-serif', fontSize: opts.size ?? 38, fill: opts.colour ?? 0xffe14d,
        stroke: { color: 0x000000, width: 7, join: 'round' }, letterSpacing: 2,
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0);
    t.rotation = rand(-0.15, 0.15);
    stage.addChild(t);
    const start = now();
    const hold = opts.hold ?? 0.9;
    every(tt => {
      const a = tt - start;
      if (a < 0) return;
      t.scale.set(easeOutBack(seg(a, 0, 0.25)) * (1 + 0.04 * Math.sin(a * 18)));
      t.y = y - a * 18;
      t.alpha = 1 - seg(a, hold, hold + 0.35);
    });
  };
}
