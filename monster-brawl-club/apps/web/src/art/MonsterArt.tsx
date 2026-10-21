// Layered SVG monster art. Every part is drawn here in code and recoloured from the
// palette, so ~60 parts combine into thousands of monsters. Canvas: 200x200, ground y≈185.
import { memo, useId, type ReactNode } from 'react';
import { PALETTE, type MonsterPalette, type MonsterParts } from '@mbc/shared';

interface Anchors {
  top: number;
  eyeY: number;
  mouthY: number;
  armY: number;
  halfW: number;
}

interface Ctx {
  a: Anchors;
  body: string;
  accent: string;
  dark: string;
  light: string;
  ko: boolean;
}

type Part = (c: Ctx) => ReactNode;

// ---------- colour helpers ----------
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex: string, other: string, t: number): string {
  const a = hexToRgb(hex), b = hexToRgb(other);
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

const INK = '#1d1028';
const W = 4; // outline width

// ---------- species (body shapes) ----------
function fuzzPath(cx: number, cy: number, r: number, bumps: number, depth: number): string {
  let d = '';
  for (let i = 0; i < bumps; i++) {
    const a0 = (i / bumps) * Math.PI * 2, a1 = ((i + 0.5) / bumps) * Math.PI * 2, a2 = ((i + 1) / bumps) * Math.PI * 2;
    const p = (a: number, rr: number) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
    if (i === 0) d += `M${p(a0, r)} `;
    d += `Q${p(a1, r + depth)} ${p(a2, r)} `;
  }
  return d + 'Z';
}

interface SpeciesDef {
  a: Anchors;
  shape: string;
  back?: Part;
  front?: Part;
}

const SPECIES: Record<string, SpeciesDef> = {
  furball: { a: { top: 54, eyeY: 108, mouthY: 142, armY: 126, halfW: 62 }, shape: fuzzPath(100, 120, 60, 26, 7) },
  mutant: {
    a: { top: 50, eyeY: 94, mouthY: 130, armY: 128, halfW: 62 },
    shape: 'M100 50 C150 45 170 95 162 135 C156 175 120 182 98 182 C60 182 36 170 38 128 C40 92 60 55 100 50Z',
    front: c => <g fill={c.accent} opacity={0.75} stroke={c.dark} strokeWidth={2}><circle cx={138} cy={78} r={9} /><circle cx={150} cy={96} r={5} /></g>,
  },
  mechanoid: {
    a: { top: 56, eyeY: 96, mouthY: 142, armY: 126, halfW: 56 },
    shape: 'M56 56 H144 Q156 56 156 68 V170 Q156 182 144 182 H56 Q44 182 44 170 V68 Q44 56 56 56Z',
    front: c => (
      <g fill={c.light} stroke={c.dark} strokeWidth={1.5}>
        {[[54, 66], [146, 66], [54, 172], [146, 172]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={3.5} />)}
        <rect x={84} y={160} width={32} height={10} rx={3} fill={c.accent} />
      </g>
    ),
  },
  slime: {
    a: { top: 54, eyeY: 102, mouthY: 138, armY: 132, halfW: 64 },
    shape: 'M100 54 C145 54 165 110 168 150 C170 172 156 182 140 178 C132 176 128 188 118 186 C108 184 104 176 96 180 C84 188 76 176 64 180 C44 184 32 172 34 150 C38 110 55 54 100 54Z',
    front: () => <ellipse cx={74} cy={84} rx={10} ry={6} fill="#fff" opacity={0.55} transform="rotate(-30 74 84)" />,
  },
  beast: {
    a: { top: 52, eyeY: 94, mouthY: 134, armY: 122, halfW: 64 },
    shape: 'M60 60 C80 48 120 48 140 60 C168 76 172 140 160 168 C150 184 50 184 40 168 C28 140 32 76 60 60Z',
  },
  bug: {
    a: { top: 50, eyeY: 86, mouthY: 112, armY: 118, halfW: 52 },
    shape: 'M100 50 C126 50 144 66 144 90 C144 104 138 112 132 116 C152 124 158 142 156 156 C152 176 128 184 100 184 C72 184 48 176 44 156 C42 142 48 124 68 116 C62 112 56 104 56 90 C56 66 74 50 100 50Z',
    front: c => <path d="M66 117 Q100 128 134 117" fill="none" stroke={c.dark} strokeWidth={3} />,
  },
  ghoul: {
    a: { top: 40, eyeY: 92, mouthY: 130, armY: 118, halfW: 60 },
    shape: 'M100 40 C145 40 160 80 160 120 L160 180 L145 166 L130 182 L115 166 L100 182 L85 166 L70 182 L55 166 L40 180 L40 120 C40 80 55 40 100 40Z',
  },
  rockling: {
    a: { top: 50, eyeY: 100, mouthY: 138, armY: 126, halfW: 62 },
    shape: 'M70 58 L118 48 L155 72 L166 120 L156 168 L110 184 L58 178 L36 140 L40 88Z',
    front: c => <path d="M120 70 L132 92 M60 140 L74 150 L70 166 M140 140 L150 152" stroke={c.dark} strokeWidth={3} fill="none" strokeLinecap="round" />,
  },
  sprout: {
    a: { top: 72, eyeY: 112, mouthY: 146, armY: 132, halfW: 58 },
    shape: 'M100 70 C140 70 158 100 158 128 C158 162 134 182 100 182 C66 182 42 162 42 128 C42 100 60 70 100 70Z',
    back: c => (
      <g stroke={INK} strokeWidth={3} strokeLinejoin="round">
        <path d="M100 74 Q98 52 104 36" fill="none" stroke="#2f7a2a" strokeWidth={5} strokeLinecap="round" />
        <path d="M103 40 C120 22 146 26 150 34 C138 50 116 52 103 40Z" fill="#5cc24a" />
        <path d="M101 50 C86 34 62 38 58 46 C70 60 90 60 101 50Z" fill="#7ad65f" />
        <circle cx={104} cy={34} r={6} fill={c.accent} />
      </g>
    ),
  },
  fishling: {
    a: { top: 56, eyeY: 102, mouthY: 140, armY: 126, halfW: 58 },
    shape: 'M100 56 C140 56 160 92 160 124 C160 160 134 184 100 184 C66 184 40 160 40 124 C40 92 60 56 100 56Z',
    back: c => <path d="M78 64 C84 34 112 26 128 36 C118 44 116 56 120 66Z" fill={c.accent} stroke={INK} strokeWidth={3} strokeLinejoin="round" />,
    front: c => <g fill="none" stroke={c.dark} strokeWidth={2.5} opacity={0.7}><path d="M136 110 q8 8 0 16" /><path d="M144 116 q6 6 0 12" /></g>,
  },
  drake: {
    a: { top: 50, eyeY: 92, mouthY: 128, armY: 132, halfW: 60 },
    shape: 'M100 50 C140 50 150 94 160 134 C168 176 132 184 100 184 C68 184 32 176 40 134 C50 94 60 50 100 50Z',
    back: c => (
      <g fill={c.accent} stroke={INK} strokeWidth={3} strokeLinejoin="round" opacity={0.95}>
        <path d="M58 104 L6 70 L18 96 L2 108 L22 118 L14 138 L54 130Z" />
        <path d="M142 104 L194 70 L182 96 L198 108 L178 118 L186 138 L146 130Z" />
      </g>
    ),
    front: c => <path d="M84 166 Q100 156 116 166" fill="none" stroke={c.light} strokeWidth={4} />,
  },
  cosmo: {
    a: { top: 58, eyeY: 108, mouthY: 142, armY: 124, halfW: 60 },
    shape: 'M100 58 A61 61 0 1 1 99.9 58Z',
    front: c => (
      <g>
        <ellipse cx={100} cy={128} rx={86} ry={16} fill="none" stroke={c.accent} strokeWidth={7} opacity={0.85} transform="rotate(-12 100 128)" />
        {[[70, 86], [128, 78], [140, 150], [62, 156]].map(([x, y]) => <text key={`${x}`} x={x} y={y} fontSize={10} fill="#fff" opacity={0.85}>✦</text>)}
      </g>
    ),
  },
};

// ---------- eyes ----------
function eyePositions(c: Ctx, n: 1 | 2 | 3): [number, number][] {
  const gap = Math.min(c.a.halfW * 0.42, 26);
  if (n === 1) return [[100, c.a.eyeY]];
  if (n === 2) return [[100 - gap, c.a.eyeY], [100 + gap, c.a.eyeY]];
  return [[100 - gap - 2, c.a.eyeY + 2], [100, c.a.eyeY - 10], [100 + gap + 2, c.a.eyeY + 2]];
}

function ball(x: number, y: number, r: number, c: Ctx, pupil: ReactNode = null): ReactNode {
  if (c.ko) {
    const k = r * 0.6;
    return <path key={`${x}${y}`} d={`M${x - k} ${y - k} L${x + k} ${y + k} M${x + k} ${y - k} L${x - k} ${y + k}`} stroke={INK} strokeWidth={5} strokeLinecap="round" />;
  }
  return (
    <g key={`${x}${y}`}>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth={3} />
      {pupil ?? <><circle cx={x + r * 0.28} cy={y + r * 0.05} r={r * 0.5} fill={INK} /><circle cx={x + r * 0.42} cy={y - r * 0.15} r={r * 0.17} fill="#fff" /></>}
    </g>
  );
}

const EYES: Record<string, Part> = {
  googly: c => eyePositions(c, 2).map(([x, y]) => ball(x, y, 16, c)),
  angry: c => eyePositions(c, 2).map(([x, y], i) => (
    <g key={i}>
      {ball(x, y, 13, c)}
      {!c.ko && <path d={i === 0 ? `M${x - 15} ${y - 22} L${x + 13} ${y - 13}` : `M${x - 13} ${y - 13} L${x + 15} ${y - 22}`} stroke={INK} strokeWidth={5} strokeLinecap="round" />}
    </g>
  )),
  sleepy: c => eyePositions(c, 2).map(([x, y], i) => (
    <g key={i}>
      {ball(x, y, 13, c)}
      {!c.ko && <path d={`M${x - 14} ${y} A14 14 0 0 1 ${x + 14} ${y} Z`} fill={c.body} stroke={INK} strokeWidth={3} />}
    </g>
  )),
  cyclops: c => ball(100, c.a.eyeY, 22, c),
  triple: c => eyePositions(c, 3).map(([x, y]) => ball(x, y, 11, c)),
  stalks: c => [-1, 1].map(k => {
    const bx = 100 + k * 15, tx = 100 + k * 28, ty = c.a.top - 30;
    return (
      <g key={k}>
        <path d={`M${bx} ${c.a.top + 12} Q${bx + k * 2} ${c.a.top - 10} ${tx} ${ty}`} stroke={INK} strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d={`M${bx} ${c.a.top + 12} Q${bx + k * 2} ${c.a.top - 10} ${tx} ${ty}`} stroke={c.body} strokeWidth={5} fill="none" strokeLinecap="round" />
        {ball(tx, ty - 6, 12, c)}
      </g>
    );
  }),
  visor: c => {
    const y = c.a.eyeY, w = c.a.halfW * 1.3;
    if (c.ko) return eyePositions(c, 2).map(([x, yy]) => ball(x, yy, 12, c));
    return (
      <g>
        <rect x={100 - w / 2} y={y - 13} width={w} height={26} rx={13} fill={INK} stroke={INK} strokeWidth={3} />
        <rect x={100 - w / 2 + 8} y={y - 5} width={w - 16} height={10} rx={5} fill={c.accent} opacity={0.95} />
        <rect x={100 - w / 2 + 14} y={y - 3} width={14} height={3} rx={1.5} fill="#fff" opacity={0.8} />
      </g>
    );
  },
  starry: c => eyePositions(c, 2).map(([x, y]) => ball(x, y, 16, c, (
    <text x={x} y={y + 7} fontSize={20} textAnchor="middle" fill={c.accent} stroke={INK} strokeWidth={1}>★</text>
  ))),
};

// ---------- mouths ----------
const MOUTHS: Record<string, Part> = {
  grin: c => {
    const w = Math.min(c.a.halfW * 0.95, 60), y = c.a.mouthY, x0 = 100 - w / 2;
    return (
      <g>
        <path d={`M${x0} ${y} Q100 ${y + 30} ${x0 + w} ${y} Z`} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <ellipse cx={100} cy={y + 11} rx={w * 0.2} ry={4} fill="#ff6b8a" />
        {[1, 2, 3, 4].map(i => <rect key={i} x={x0 + (w / 5) * i - 4} y={y} width={8} height={6} rx={1.5} fill="#fff" />)}
      </g>
    );
  },
  fangs: c => {
    const w = Math.min(c.a.halfW * 0.95, 60), y = c.a.mouthY, x0 = 100 - w / 2;
    return (
      <g>
        <path d={`M${x0} ${y} Q100 ${y + 26} ${x0 + w} ${y} Z`} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        {[100 - w / 4, 100 + w / 4].map(fx => <path key={fx} d={`M${fx - 6} ${y} L${fx + 6} ${y} L${fx} ${y + 15} Z`} fill="#fff" />)}
      </g>
    );
  },
  chomper: c => {
    const rx = Math.min(c.a.halfW * 0.4, 25), y = c.a.mouthY + 4;
    let top = `M${100 - rx + 3} ${y - 9}`, bot = `M${100 - rx + 3} ${y + 9}`;
    const n = 5, step = (2 * rx - 6) / n;
    for (let i = 0; i < n; i++) {
      const xa = 100 - rx + 3 + step * i;
      top += ` L${xa + step / 2} ${y - 1} L${xa + step} ${y - 9}`;
      bot += ` L${xa + step / 2} ${y + 2} L${xa + step} ${y + 9}`;
    }
    return (
      <g>
        <ellipse cx={100} cy={y} rx={rx} ry={13} fill={INK} stroke={INK} strokeWidth={3} />
        <path d={top + 'Z'} fill="#fff" />
        <path d={bot + 'Z'} fill="#fff" />
      </g>
    );
  },
  tusks: c => {
    const w = Math.min(c.a.halfW * 0.95, 60), y = c.a.mouthY, x0 = 100 - w / 2, x1 = x0 + w;
    return (
      <g>
        <path d={`M${x0} ${y} Q100 ${y + 18} ${x1} ${y}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        {([[x0 + 6, -1], [x1 - 6, 1]] as const).map(([tx, dir]) => (
          <path key={tx} d={`M${tx - 5} ${y + 4} L${tx + 5} ${y + 4} L${tx + dir * 3} ${y - 15} Z`} fill="#fffbe8" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        ))}
      </g>
    );
  },
  beak: c => {
    const y = c.a.mouthY - 4;
    return (
      <g stroke={INK} strokeWidth={3} strokeLinejoin="round">
        <path d={`M84 ${y} L116 ${y} L100 ${y + 12} Z`} fill="#f6a623" />
        <path d={`M86 ${y + 1} L114 ${y + 1} L100 ${y + 22} Z`} fill="#e08a0b" />
      </g>
    );
  },
  zigzag: c => {
    const w = Math.min(c.a.halfW * 0.9, 56), y = c.a.mouthY + 4, x0 = 100 - w / 2;
    let d = `M${x0} ${y}`;
    for (let i = 1; i <= 6; i++) d += ` L${x0 + (w / 6) * i} ${y + (i % 2 ? 7 : 0)}`;
    return <path d={d} fill="none" stroke={INK} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />;
  },
  tongue: c => {
    const w = Math.min(c.a.halfW * 0.8, 48), y = c.a.mouthY;
    return (
      <g>
        <path d={`M${100 - w / 2} ${y} Q100 ${y + 26} ${100 + w / 2} ${y} Z`} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d={`M${92} ${y + 8} Q${88} ${y + 32} ${100} ${y + 32} Q${112} ${y + 32} ${108} ${y + 8} Z`} fill="#ff6b8a" stroke={INK} strokeWidth={3} />
        <path d={`M100 ${y + 12} L100 ${y + 26}`} stroke="#d94a6a" strokeWidth={2} />
      </g>
    );
  },
  grille: c => {
    const w = Math.min(c.a.halfW * 0.9, 50), y = c.a.mouthY - 4;
    return (
      <g>
        <rect x={100 - w / 2} y={y} width={w} height={18} rx={4} fill="#c9cfd8" stroke={INK} strokeWidth={3} />
        {[1, 2, 3, 4, 5].map(i => <line key={i} x1={100 - w / 2 + (w / 6) * i} y1={y + 3} x2={100 - w / 2 + (w / 6) * i} y2={y + 15} stroke={INK} strokeWidth={2.5} />)}
      </g>
    );
  },
};

// ---------- head tops (drawn behind the body) ----------
const HEADS: Record<string, Part> = {
  none: () => null,
  'devil-horns': c => [-1, 1].map(k => {
    const x = 100 + k * 24, t = c.a.top;
    return <path key={k} d={`M${x - 9} ${t + 16} Q${x + k * 4} ${t - 6} ${x + k * 16} ${t - 32} Q${x + k * 14} ${t - 4} ${x + 9} ${t + 16} Z`} fill={c.accent} stroke={INK} strokeWidth={3} strokeLinejoin="round" />;
  }),
  antennae: c => [-1, 1].map(k => {
    const x = 100 + k * 16, tx = 100 + k * 34, t = c.a.top;
    return (
      <g key={k}>
        <path d={`M${x} ${t + 12} Q${x + k * 4} ${t - 18} ${tx} ${t - 30}`} stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />
        <circle cx={tx} cy={t - 32} r={7} fill={c.accent} stroke={INK} strokeWidth={3} />
      </g>
    );
  }),
  spikes: c => [-2, -1, 0, 1, 2].map(i => {
    const x = 100 + i * 17, h = 24 - Math.abs(i) * 5, t = c.a.top + Math.abs(i) * 3;
    return <path key={i} d={`M${x - 10} ${t + 16} L${x} ${t - h} L${x + 10} ${t + 16} Z`} fill={c.accent} stroke={INK} strokeWidth={3} strokeLinejoin="round" />;
  }),
  unihorn: c => {
    const t = c.a.top;
    return (
      <g stroke={INK} strokeWidth={3} strokeLinejoin="round">
        <path d={`M89 ${t + 14} L100 ${t - 40} L111 ${t + 14} Z`} fill={c.accent} />
        <path d={`M93 ${t} L107 ${t - 7} M95 ${t - 16} L105 ${t - 21}`} strokeWidth={2} />
      </g>
    );
  },
  mohawk: c => [-3, -2, -1, 0, 1, 2, 3].map(i => {
    const x = 100 + i * 9, t = c.a.top + Math.abs(i) * 2.5;
    return <path key={i} d={`M${x - 6} ${t + 14} L${x + 4} ${t - 26 + Math.abs(i) * 4} L${x + 6} ${t + 14} Z`} fill={c.accent} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />;
  }),
  ears: c => [-1, 1].map(k => {
    const x = 100 + k * c.a.halfW * 0.55, t = c.a.top + 10;
    return (
      <g key={k} stroke={INK} strokeWidth={3} strokeLinejoin="round">
        <path d={`M${x - 18} ${t + 14} L${x + k * 6} ${t - 30} L${x + 18} ${t + 14} Z`} fill={c.body} />
        <path d={`M${x - 9} ${t + 8} L${x + k * 4} ${t - 16} L${x + 9} ${t + 8} Z`} fill="#ff9eb5" strokeWidth={2} />
      </g>
    );
  }),
  'crown-fin': c => {
    const t = c.a.top;
    return (
      <g stroke={INK} strokeWidth={3} strokeLinejoin="round">
        <path d={`M70 ${t + 16} C70 ${t - 30} 130 ${t - 30} 130 ${t + 16} Z`} fill={c.accent} />
        <path d={`M85 ${t + 6} L88 ${t - 16} M100 ${t + 4} L100 ${t - 20} M115 ${t + 6} L112 ${t - 16}`} strokeWidth={2} fill="none" />
      </g>
    );
  },
};

// ---------- arms (drawn for the left side, mirrored for the right) ----------
function limbStroke(d: string, c: Ctx, width = 12): ReactNode {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={INK} strokeWidth={width + 6} />
      <path d={d} stroke={c.body} strokeWidth={width} />
    </g>
  );
}

const ARMS: Record<string, (c: Ctx, s: number, y: number) => ReactNode> = {
  stubby: (c, s, y) => <ellipse cx={s - 12} cy={y} rx={22} ry={12} transform={`rotate(-20 ${s - 12} ${y})`} fill={c.body} stroke={INK} strokeWidth={W} />,
  claws: (c, s, y) => (
    <g>
      {[-7, 0, 7].map(o => <path key={o} d={`M${s - 26} ${y + o - 3} L${s - 40} ${y + o} L${s - 26} ${y + o + 3} Z`} fill="#fffbe8" stroke={INK} strokeWidth={2} />)}
      <ellipse cx={s - 12} cy={y} rx={20} ry={13} fill={c.body} stroke={INK} strokeWidth={W} />
    </g>
  ),
  tentacles: (c, s, y) => (
    <g>
      {limbStroke(`M${s} ${y} Q${s - 28} ${y + 4} ${s - 32} ${y + 26} Q${s - 36} ${y + 44} ${s - 20} ${y + 46}`, c)}
      {[0, 1, 2].map(i => <circle key={i} cx={s - 18 - i * 6} cy={y + 8 + i * 12} r={2.4} fill={c.light} />)}
    </g>
  ),
  pincers: (c, s, y) => (
    <g stroke={INK} strokeWidth={3} strokeLinejoin="round">
      {limbStroke(`M${s} ${y} L${s - 26} ${y - 10}`, c, 10)}
      <path d={`M${s - 26} ${y - 10} C${s - 50} ${y - 40} ${s - 64} ${y - 10} ${s - 44} ${y - 2} L${s - 36} ${y - 12} C${s - 46} ${y - 18} ${s - 44} ${y - 28} ${s - 30} ${y - 16} Z`} fill={c.accent} />
      <path d={`M${s - 28} ${y - 6} C${s - 40} ${y + 14} ${s - 56} ${y + 8} ${s - 48} ${y - 2}`} fill={c.accent} />
    </g>
  ),
  wings: (c, s, y) => (
    <path d={`M${s + 4} ${y - 20} L${s - 50} ${y - 46} L${s - 44} ${y - 20} L${s - 58} ${y - 6} L${s - 36} ${y} L${s - 40} ${y + 18} L${s + 2} ${y + 6} Z`} fill={c.accent} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
  ),
  robo: (c, s, y) => (
    <g stroke={INK} strokeWidth={3}>
      <rect x={s - 28} y={y - 6} width={30} height={12} rx={3} fill="#c9cfd8" />
      <circle cx={s - 30} cy={y} r={7} fill={c.accent} />
      <rect x={s - 40} y={y + 4} width={10} height={24} rx={3} fill="#c9cfd8" />
      <path d={`M${s - 43} ${y + 28} L${s - 43} ${y + 38} M${s - 27} ${y + 28} L${s - 27} ${y + 38}`} strokeWidth={4} strokeLinecap="round" />
    </g>
  ),
  noodle: (c, s, y) => (
    <g>
      {limbStroke(`M${s} ${y} C${s - 30} ${y + 4} ${s - 10} ${y + 30} ${s - 34} ${y + 44} S${s - 40} ${y + 64} ${s - 30} ${y + 62}`, c, 7)}
      <circle cx={s - 30} cy={y + 62} r={8} fill={c.body} stroke={INK} strokeWidth={3} />
    </g>
  ),
  blades: (c, s, y) => (
    <g stroke={INK} strokeWidth={3} strokeLinejoin="round">
      <ellipse cx={s - 12} cy={y} rx={18} ry={11} fill={c.body} strokeWidth={W} />
      <path d={`M${s - 26} ${y - 4} L${s - 66} ${y - 30} L${s - 30} ${y + 6} Z`} fill="#dfe6ee" />
      <path d={`M${s - 30} ${y - 6} L${s - 58} ${y - 24}`} stroke={c.accent} strokeWidth={2} />
    </g>
  ),
};

// ---------- legs (drawn for the left side at x≈72, mirrored) ----------
const LEGS: Record<string, (c: Ctx) => ReactNode> = {
  stumpy: c => <rect x={58} y={160} width={28} height={30} rx={11} fill={c.body} stroke={INK} strokeWidth={W} />,
  feet: c => (
    <g stroke={INK} strokeWidth={W}>
      <rect x={62} y={160} width={20} height={24} rx={8} fill={c.body} />
      <ellipse cx={66} cy={188} rx={24} ry={10} fill={c.body} />
      {[50, 60, 70].map(x => <circle key={x} cx={x} cy={186} r={3} fill={c.light} strokeWidth={1.5} />)}
    </g>
  ),
  tentacles: c => (
    <g>
      {limbStroke('M72 164 Q60 186 48 186 Q38 186 42 176', c, 11)}
      {limbStroke('M86 168 Q84 190 70 192', c, 9)}
    </g>
  ),
  wheels: c => (
    <g stroke={INK} strokeWidth={3}>
      <rect x={64} y={160} width={16} height={16} fill="#8a94a6" />
      <circle cx={72} cy={182} r={14} fill="#3a3a4a" />
      <circle cx={72} cy={182} r={5} fill={c.accent} />
    </g>
  ),
  'bug-legs': () => (
    <g fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M76 158 L56 168 L50 190" />
      <path d="M82 166 L70 176 L68 192" />
      <path d="M70 150 L44 156 L34 176" />
    </g>
  ),
  hover: () => null,
  paws: c => (
    <g stroke={INK} strokeWidth={W}>
      <rect x={60} y={158} width={24} height={26} rx={9} fill={c.body} />
      <ellipse cx={72} cy={188} rx={18} ry={9} fill={c.body} />
      <g fill="#ff9eb5" strokeWidth={0}>
        <circle cx={64} cy={187} r={2.6} /><circle cx={72} cy={185} r={2.6} /><circle cx={80} cy={187} r={2.6} />
      </g>
    </g>
  ),
  springs: c => (
    <g stroke={INK} strokeLinejoin="round">
      <path d="M72 160 L62 166 L82 172 L62 178 L82 184 L72 188" fill="none" strokeWidth={4} />
      <rect x={56} y={186} width={32} height={7} rx={3} fill={c.accent} strokeWidth={3} />
    </g>
  ),
};

// ---------- patterns (clipped to the body) ----------
const SPOTS: [number, number, number][] = [[64, 92, 10], [128, 100, 13], [80, 150, 9], [140, 152, 11], [104, 74, 7], [56, 128, 7], [150, 122, 8], [110, 170, 8]];

const PATTERNS: Record<string, Part> = {
  plain: () => null,
  spots: c => <g fill={c.accent} opacity={0.55}>{SPOTS.map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} />)}</g>,
  stripes: c => (
    <g fill={c.accent} opacity={0.5}>
      {Array.from({ length: 7 }, (_, i) => c.a.top + 12 + i * 22).map(y => (
        <path key={y} d={`M10 ${y} Q100 ${y + 12} 190 ${y} L190 ${y + 9} Q100 ${y + 21} 10 ${y + 9} Z`} />
      ))}
    </g>
  ),
  belly: c => <ellipse cx={100} cy={c.a.armY + 36} rx={c.a.halfW * 0.62} ry={34} fill={c.light} />,
  scales: c => (
    <g fill="none" stroke={c.dark} strokeWidth={2} opacity={0.45}>
      {Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (__, col) => {
        const x = 30 + col * 20 + (row % 2) * 10, y = c.a.top + 6 + row * 17;
        return <path key={`${row}-${col}`} d={`M${x - 10} ${y} A10 10 0 0 0 ${x + 10} ${y}`} />;
      }))}
    </g>
  ),
  swirl: c => (
    <path d="M100 120 m0 -6 a6 6 0 1 1 -6 6 a12 12 0 1 1 12 12 a20 20 0 1 1 -20 -20 a30 30 0 1 1 30 30 a42 42 0 1 1 -42 -42 a56 56 0 1 1 56 56"
      fill="none" stroke={c.accent} strokeWidth={6} opacity={0.55} />
  ),
};

export interface MonsterArtProps {
  parts: MonsterParts;
  palette: MonsterPalette;
  /** Face left (opponents on the fight screen). */
  flip?: boolean | undefined;
  ko?: boolean | undefined;
  idle?: boolean | undefined;
  className?: string | undefined;
}

function MonsterArtImpl({ parts, palette, flip, ko = false, idle = false, className = '' }: MonsterArtProps) {
  const uid = useId().replace(/:/g, '');
  const sp = SPECIES[parts.species] ?? SPECIES.furball!;
  const body = PALETTE[palette.body] ?? PALETTE[0];
  const accentRaw = PALETTE[palette.accent] ?? PALETTE[1];
  // Avoid invisible details when both colours match.
  const accent = accentRaw === body ? mix(accentRaw, '#ffffff', 0.45) : accentRaw;
  const c: Ctx = { a: sp.a, body, accent, dark: mix(body, '#120018', 0.55), light: mix(body, '#ffffff', 0.45), ko };
  const s = 100 - sp.a.halfW + 8;
  const arm = ARMS[parts.arms] ?? ARMS.stubby!;
  const leg = LEGS[parts.legs] ?? LEGS.stumpy!;
  const mirror = (node: ReactNode) => <>{node}<g transform="translate(200 0) scale(-1 1)">{node}</g></>;

  return (
    <div className={`${idle ? 'monster-idle' : ''} ${className}`}>
      <svg viewBox="-24 -54 248 256" className="block h-full w-full overflow-visible" role="img" aria-label={`${parts.species} monster`}>
        <defs>
          <clipPath id={`clip-${uid}`}><path d={sp.shape} /></clipPath>
        </defs>
        <ellipse cx={100} cy={194} rx={68} ry={8} fill="#000" opacity={0.2} />
        <g transform={flip ? 'translate(200 0) scale(-1 1)' : undefined}>
          {parts.legs === 'hover' && <ellipse cx={100} cy={190} rx={52} ry={9} fill={accent} opacity={0.6} />}
          {mirror(leg(c))}
          {sp.back?.(c)}
          {(HEADS[parts.head] ?? HEADS.none!)(c)}
          {mirror(arm(c, s, sp.a.armY))}
          <path d={sp.shape} fill={body} />
          <g clipPath={`url(#clip-${uid})`}>{(PATTERNS[parts.pattern] ?? PATTERNS.plain!)(c)}</g>
          <path d={sp.shape} fill="none" stroke={INK} strokeWidth={W + 1} strokeLinejoin="round" />
          {sp.front?.(c)}
          {(EYES[parts.eyes] ?? EYES.googly!)(c)}
          {(MOUTHS[parts.mouth] ?? MOUTHS.grin!)(c)}
        </g>
      </svg>
    </div>
  );
}

export const MonsterArt = memo(MonsterArtImpl);
