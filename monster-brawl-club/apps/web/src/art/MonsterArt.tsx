// Layered SVG monster art. Every part is drawn here in code and recoloured from the
// palette, so ~60 parts combine into thousands of monsters. Canvas: 200x200, ground y≈185.
import { memo, useId, type ReactNode } from 'react';
import { PALETTE, type MonsterPalette, type MonsterParts, type Variant } from '@mbc/shared';

interface Anchors {
  top: number;
  eyeY: number;
  mouthY: number;
  armY: number;
  halfW: number;
}

interface Ctx {
  a: Anchors;
  /** Unique per render, for gradient ids. */
  uid: string;
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
  /** Behind the body (tails, wings, antennae, auras). */
  back?: Part;
  /** The species' material, clipped to the body (fur, metal, goo, stone...). */
  texture?: Part;
  /** On top of the body outline, under the face. */
  front?: Part;
  /** Translucent bodies (slime, ghoul). */
  bodyOpacity?: number;
  /** Replaces legs: slimes sit in a puddle, ghouls float. */
  base?: Part;
}

// Deterministic "random" so textures look organic but never change between renders.
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Short curved strokes radiating out from a centre: fur. */
function furStrands(cx: number, cy: number, maxR: number, colour: string, opacity: number, seed: number) {
  const d: string[] = [];
  for (let i = 0; i < 90; i++) {
    const r = maxR * Math.sqrt(hash(i + seed));
    const a = hash(i * 3 + seed) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const len = 6 + hash(i * 7 + seed) * 6;
    const out = a + 0.5;
    d.push(`M${x.toFixed(1)} ${y.toFixed(1)} q${(Math.cos(out) * len * 0.6).toFixed(1)} ${(Math.sin(out) * len * 0.6).toFixed(1)} ${(Math.cos(a) * len).toFixed(1)} ${(Math.sin(a) * len + 3).toFixed(1)}`);
  }
  return <path d={d.join(' ')} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" opacity={opacity} />;
}

const SPECIES: Record<string, SpeciesDef> = {
  // Shaggy fur all over, with a cowlick on top.
  furball: {
    a: { top: 54, eyeY: 108, mouthY: 142, armY: 126, halfW: 62 },
    shape: fuzzPath(100, 120, 60, 26, 7),
    texture: c => <>{furStrands(100, 120, 62, c.dark, 0.4, 1)}{furStrands(100, 116, 58, c.light, 0.45, 50)}</>,
    front: c => <path d="M96 58 C88 40 104 34 108 44 C110 50 102 52 100 47" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />,
    back: c => <path d={fuzzPath(100, 120, 66, 26, 9)} fill={c.dark} opacity={0.5} />,
  },
  // Lumpy, stitched together, glowing toxic blisters, a drip of ooze.
  mutant: {
    a: { top: 50, eyeY: 94, mouthY: 130, armY: 128, halfW: 62 },
    shape: 'M100 50 C150 45 170 95 162 135 C156 175 120 182 98 182 C60 182 36 170 38 128 C40 92 60 55 100 50Z',
    texture: () => (
      <g>
        {[[136, 82, 10], [150, 104, 6], [58, 150, 8], [70, 166, 5], [148, 150, 7]].map(([x, y, r]) => (
          <g key={`${x}${y}`}>
            <circle cx={x} cy={y} r={r! + 3} fill="#9bff3a" opacity={0.35} />
            <circle cx={x} cy={y} r={r} fill="#9bff3a" stroke={INK} strokeWidth={2} />
            <circle cx={x! - r! * 0.3} cy={y! - r! * 0.3} r={r! * 0.35} fill="#e8ffd0" />
          </g>
        ))}
      </g>
    ),
    front: () => (
      <g stroke={INK} strokeWidth={2.5} strokeLinecap="round" fill="none">
        <path d="M58 82 C72 98 70 116 84 128" />
        {[0, 1, 2, 3].map(i => {
          const x = 61 + i * 7, y = 88 + i * 11;
          return <path key={i} d={`M${x - 5} ${y + 3} L${x + 5} ${y - 3}`} />;
        })}
      </g>
    ),
  },
  // Brushed metal plates, bolts, a chest screen and a blinking antenna.
  mechanoid: {
    a: { top: 56, eyeY: 96, mouthY: 142, armY: 126, halfW: 56 },
    shape: 'M56 56 H144 Q156 56 156 68 V170 Q156 182 144 182 H56 Q44 182 44 170 V68 Q44 56 56 56Z',
    texture: c => (
      <g>
        <rect x={40} y={50} width={120} height={140} fill={`url(#metal-${c.uid})`} />
        <path d="M44 118 H156 M100 118 V182" stroke={INK} strokeWidth={2.5} opacity={0.5} />
        {[60, 66, 72].map(y => <path key={y} d={`M${132} ${y + 64} H${150}`} stroke={INK} strokeWidth={2} opacity={0.4} />)}
      </g>
    ),
    front: c => (
      <g>
        <g fill="#d8dde5" stroke={INK} strokeWidth={1.5}>
          {[[52, 64], [148, 64], [52, 174], [148, 174], [52, 118], [148, 118]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={3.5} />)}
        </g>
        <rect x={62} y={152} width={30} height={20} rx={4} fill="#1d2330" stroke={INK} strokeWidth={2.5} />
        {[0, 1, 2].map(i => <rect key={i} x={66 + i * 8} y={168 - (6 + ((i * 5) % 9))} width={5} height={6 + ((i * 5) % 9)} fill={i === 1 ? c.accent : '#7dff3a'} />)}
        <circle cx={124} cy={162} r={8} fill="#c9cfd8" stroke={INK} strokeWidth={2.5} />
        <path d="M124 162 L129 157" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      </g>
    ),
    back: c => (
      <g>
        <path d="M138 58 L146 28" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        <circle cx={146} cy={26} r={6} fill={c.accent} stroke={INK} strokeWidth={2.5}>
          <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
        </circle>
      </g>
    ),
  },
  // Wobbly, see-through goo with bubbles inside and a shiny highlight. No legs: it sits in a puddle.
  slime: {
    a: { top: 54, eyeY: 102, mouthY: 138, armY: 132, halfW: 64 },
    shape: 'M100 54 C145 54 165 110 168 150 C170 172 156 182 140 178 C132 176 128 188 118 186 C108 184 104 176 96 180 C84 188 76 176 64 180 C44 184 32 172 34 150 C38 110 55 54 100 54Z',
    bodyOpacity: 0.86,
    texture: c => (
      <g>
        <ellipse cx={100} cy={176} rx={70} ry={22} fill={c.dark} opacity={0.3} />
        {[[76, 150, 7], [122, 124, 5], [108, 164, 6], [66, 118, 4], [138, 156, 4], [92, 132, 3]].map(([x, y, r]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill={c.light} stroke="#fff" strokeWidth={1.5} opacity={0.6} />
        ))}
      </g>
    ),
    front: () => (
      <g fill="#fff">
        <ellipse cx={72} cy={86} rx={12} ry={7} opacity={0.6} transform="rotate(-35 72 86)" />
        <circle cx={86} cy={74} r={3.5} opacity={0.7} />
      </g>
    ),
    base: c => <ellipse cx={100} cy={184} rx={76} ry={11} fill={c.body} stroke={INK} strokeWidth={3} opacity={0.85} />,
  },
  // Shaggy shoulders, a light muzzle, a chest tuft and a bushy tail.
  beast: {
    a: { top: 52, eyeY: 94, mouthY: 134, armY: 122, halfW: 64 },
    shape: 'M60 60 C80 48 120 48 140 60 C168 76 172 140 160 168 C150 184 50 184 40 168 C28 140 32 76 60 60Z',
    texture: c => (
      <g>
        <path d="M70 150 L80 160 L86 150 L94 164 L100 152 L106 164 L114 150 L120 160 L130 150 L130 190 L70 190Z" fill={c.light} />
        {furStrands(100, 110, 70, c.dark, 0.25, 7)}
      </g>
    ),
    front: c => (
      <g>
        <ellipse cx={100} cy={c.a.mouthY + 4} rx={34} ry={20} fill={c.light} stroke={INK} strokeWidth={2.5} />
        <ellipse cx={100} cy={c.a.mouthY - 12} rx={8} ry={5} fill={INK} />
        {[-1, 1].map(k => (
          <path key={k} d={k < 0 ? 'M44 92 L34 80 L50 84 L44 70 L60 78 L58 64 L70 72' : 'M156 92 L166 80 L150 84 L156 70 L140 78 L142 64 L130 72'}
            fill="none" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        ))}
      </g>
    ),
    back: c => (
      <path d="M150 160 C186 160 196 120 184 96 C200 108 204 136 192 156 C204 150 206 166 196 172 C184 182 162 180 150 172Z"
        fill={c.body} stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
    ),
  },
  // Shiny shell split down the middle, segment lines, extra side legs and mandibles.
  bug: {
    a: { top: 50, eyeY: 86, mouthY: 112, armY: 118, halfW: 52 },
    shape: 'M100 50 C126 50 144 66 144 90 C144 104 138 112 132 116 C152 124 158 142 156 156 C152 176 128 184 100 184 C72 184 48 176 44 156 C42 142 48 124 68 116 C62 112 56 104 56 90 C56 66 74 50 100 50Z',
    texture: c => (
      <g fill="none">
        <path d="M100 118 V186" stroke={INK} strokeWidth={2.5} opacity={0.6} />
        {[138, 154, 170].map(y => <path key={y} d={`M48 ${y} Q100 ${y + 10} 152 ${y}`} stroke={c.dark} strokeWidth={2.5} opacity={0.5} />)}
        <path d="M60 128 Q58 156 72 172" stroke="#fff" strokeWidth={6} strokeLinecap="round" opacity={0.35} />
        <path d="M70 64 Q64 80 66 98" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.35} />
      </g>
    ),
    front: c => (
      <g fill={c.dark} stroke={INK} strokeWidth={2} strokeLinejoin="round">
        <path d="M82 110 C72 114 72 126 80 128 C78 122 80 116 86 114Z" />
        <path d="M118 110 C128 114 128 126 120 128 C122 122 120 116 114 114Z" />
        <path d="M66 117 Q100 128 134 117" fill="none" stroke={c.dark} strokeWidth={3} />
      </g>
    ),
    back: () => (
      <g fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M50 134 L28 126 L18 142" /><path d="M48 150 L26 152 L20 170" />
        <path d="M150 134 L172 126 L182 142" /><path d="M152 150 L174 152 L180 170" />
      </g>
    ),
  },
  // See-through and glowing, fading out at the bottom. Floats, so no legs.
  ghoul: {
    a: { top: 40, eyeY: 92, mouthY: 130, armY: 118, halfW: 60 },
    shape: 'M100 40 C145 40 160 80 160 120 L160 180 L145 166 L130 182 L115 166 L100 182 L85 166 L70 182 L55 166 L40 180 L40 120 C40 80 55 40 100 40Z',
    bodyOpacity: 0.8,
    texture: c => (
      <g>
        <rect x={30} y={40} width={140} height={150} fill={`url(#fade-${c.uid})`} />
        <path d="M58 140 C70 128 84 150 96 138 M110 156 C122 144 134 164 146 150" fill="none" stroke="#fff" strokeWidth={3} opacity={0.4} strokeLinecap="round" />
      </g>
    ),
    back: c => <path d="M100 30 C152 30 170 76 170 120 L170 192 L30 192 L30 120 C30 76 48 30 100 30Z" fill={c.light} opacity={0.25} />,
    base: () => <ellipse cx={100} cy={200} rx={44} ry={6} fill="#000" opacity={0.15} />,
  },
  // Speckled stone with cracks, pebbles and a patch of moss on top.
  rockling: {
    a: { top: 50, eyeY: 100, mouthY: 138, armY: 126, halfW: 62 },
    shape: 'M70 58 L118 48 L155 72 L166 120 L156 168 L110 184 L58 178 L36 140 L40 88Z',
    texture: c => (
      <g>
        {Array.from({ length: 60 }, (_, i) => (
          <circle key={i} cx={36 + hash(i) * 130} cy={48 + hash(i + 99) * 136} r={1 + hash(i + 7) * 2.2} fill={i % 3 ? c.dark : c.light} opacity={0.55} />
        ))}
        <path d="M60 50 Q72 66 86 58 Q98 70 112 56 Q126 66 138 58 L160 40 L60 40Z" fill="#5cae4a" stroke="#2f6a24" strokeWidth={2} />
        <path d="M44 120 L60 112 L70 120 M150 96 L138 104" fill="none" stroke={c.light} strokeWidth={2.5} opacity={0.7} />
      </g>
    ),
    front: c => <path d="M120 70 L132 92 M60 140 L74 150 L70 166 M140 140 L150 152" stroke={c.dark} strokeWidth={3} fill="none" strokeLinecap="round" />,
  },
  // Leafy: a sprout on top, leaf veins on the body and a collar of leaves.
  sprout: {
    a: { top: 72, eyeY: 112, mouthY: 146, armY: 132, halfW: 58 },
    shape: 'M100 70 C140 70 158 100 158 128 C158 162 134 182 100 182 C66 182 42 162 42 128 C42 100 60 70 100 70Z',
    texture: c => (
      <g fill="none" stroke={c.dark} strokeWidth={2.5} opacity={0.35} strokeLinecap="round">
        <path d="M100 160 V186" />
        {[-1, 1].map(k => <path key={k} d={`M100 172 Q${100 + k * 22} ${166} ${100 + k * 40} ${150} M100 182 Q${100 + k * 26} ${178} ${100 + k * 48} ${166}`} />)}
      </g>
    ),
    back: c => (
      <g stroke={INK} strokeWidth={3} strokeLinejoin="round">
        {[-2, -1, 1, 2].map(i => (
          <path key={i} transform={`rotate(${i * 28} 100 84)`} d="M100 84 C88 70 92 54 100 46 C108 54 112 70 100 84Z" fill={i % 2 ? '#5cc24a' : '#7ad65f'} />
        ))}
        <path d="M100 74 Q98 52 104 32" fill="none" stroke="#2f7a2a" strokeWidth={5} strokeLinecap="round" />
        <path d="M103 36 C120 18 146 22 150 30 C138 46 116 48 103 36Z" fill="#5cc24a" />
        <path d="M101 46 C86 30 62 34 58 42 C70 56 90 56 101 46Z" fill="#7ad65f" />
        <circle cx={104} cy={30} r={7} fill={c.accent} />
      </g>
    ),
  },
  // Scales, gill slits, a dorsal fin and a big tail fin.
  fishling: {
    a: { top: 56, eyeY: 102, mouthY: 140, armY: 126, halfW: 58 },
    shape: 'M100 56 C140 56 160 92 160 124 C160 160 134 184 100 184 C66 184 40 160 40 124 C40 92 60 56 100 56Z',
    texture: c => (
      <g>
        <ellipse cx={100} cy={168} rx={52} ry={26} fill={c.light} opacity={0.7} />
        <g fill="none" stroke={c.dark} strokeWidth={1.8} opacity={0.45}>
          {Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (__, col) => {
            const x = 44 + col * 18 + (row % 2) * 9, y = 70 + row * 14;
            return <path key={`${row}-${col}`} d={`M${x - 9} ${y} A9 9 0 0 0 ${x + 9} ${y}`} />;
          }))}
        </g>
      </g>
    ),
    back: c => (
      <g fill={c.accent} stroke={INK} strokeWidth={3} strokeLinejoin="round">
        <path d="M78 64 C84 34 112 26 128 36 C118 44 116 56 120 66Z" />
        <path d="M46 146 C20 130 6 140 2 150 C14 154 14 168 4 178 C20 182 34 172 48 160Z" />
        <path d="M14 152 L36 156 M10 168 L36 162" fill="none" strokeWidth={2} />
      </g>
    ),
    front: c => <g fill="none" stroke={c.dark} strokeWidth={3} opacity={0.75} strokeLinecap="round"><path d="M134 104 q8 9 0 18" /><path d="M143 108 q6 7 0 14" /></g>,
  },
  // Dragon: wings, back spikes, belly plates and a spade-tipped tail.
  drake: {
    a: { top: 50, eyeY: 92, mouthY: 128, armY: 132, halfW: 60 },
    shape: 'M100 50 C140 50 150 94 160 134 C168 176 132 184 100 184 C68 184 32 176 40 134 C50 94 60 50 100 50Z',
    texture: c => (
      <g>
        <ellipse cx={100} cy={160} rx={34} ry={34} fill={c.light} />
        {[138, 150, 162, 174].map(y => <path key={y} d={`M68 ${y} Q100 ${y + 7} 132 ${y}`} fill="none" stroke={c.dark} strokeWidth={2.5} opacity={0.6} />)}
        <g fill="none" stroke={c.dark} strokeWidth={1.6} opacity={0.35}>
          {Array.from({ length: 5 }, (_, row) => Array.from({ length: 6 }, (__, col) => {
            const x = 46 + col * 22 + (row % 2) * 11, y = 70 + row * 14;
            return <path key={`${row}-${col}`} d={`M${x - 8} ${y} Q${x} ${y + 9} ${x + 8} ${y}`} />;
          }))}
        </g>
      </g>
    ),
    back: c => (
      <g stroke={INK} strokeWidth={3} strokeLinejoin="round">
        <g fill={c.accent} opacity={0.95}>
          <path d="M58 104 L6 70 L18 96 L2 108 L22 118 L14 138 L54 130Z" />
          <path d="M142 104 L194 70 L182 96 L198 108 L178 118 L186 138 L146 130Z" />
        </g>
        <path d="M60 172 C30 184 14 170 8 156 L2 146 L18 150 L12 160" fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" />
        <path d="M60 172 C30 184 14 170 8 156" fill="none" stroke={c.body} strokeWidth={5} strokeLinecap="round" />
        <path d="M8 156 L-4 140 L14 144 L18 128 L22 152Z" fill={c.accent} />
        {[0, 1, 2, 3].map(i => <path key={i} d={`M${70 + i * 20} ${56 - (i === 1 || i === 2 ? 6 : 0)} l8 -18 l8 18Z`} fill={c.accent} />)}
      </g>
    ),
  },
  // A little planet: a starry night-sky body with a ring around it.
  cosmo: {
    a: { top: 58, eyeY: 108, mouthY: 142, armY: 124, halfW: 60 },
    shape: 'M100 58 A61 61 0 1 1 99.9 58Z',
    texture: c => (
      <g>
        <circle cx={100} cy={119} r={62} fill={`url(#space-${c.uid})`} />
        {Array.from({ length: 22 }, (_, i) => (
          <circle key={i} cx={42 + hash(i + 3) * 116} cy={60 + hash(i + 40) * 118} r={0.8 + hash(i + 70) * 1.6} fill="#fff" opacity={0.9} />
        ))}
        <path d="M60 92 A50 50 0 0 1 104 64" fill="none" stroke="#fff" strokeWidth={5} opacity={0.35} strokeLinecap="round" />
      </g>
    ),
    front: c => <ellipse cx={100} cy={128} rx={86} ry={16} fill="none" stroke={c.accent} strokeWidth={7} opacity={0.85} transform="rotate(-12 100 128)" />,
    back: c => <ellipse cx={100} cy={128} rx={86} ry={16} fill="none" stroke={c.accent} strokeWidth={7} opacity={0.5} transform="rotate(-12 100 128)" />,
  },
};

/** Species with no legs (the builder hides the legs choice for these). */
export const LEGLESS_SPECIES = Object.keys(SPECIES).filter(k => SPECIES[k]!.base);

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
  variant?: Variant | undefined;
}

const SPARKLES: [number, number, number][] = [[12, 22, 0], [80, 14, 0.6], [86, 62, 1.1], [8, 70, 0.3], [50, 6, 1.4]];

/** Decorative layers behind and around rare-variant monsters. */
function VariantLayers({ variant }: { variant: Variant }) {
  if (variant === 'normal') return null;
  if (variant === 'radioactive') {
    return <>{[18, 36, 54, 72].map((x, i) => <span key={x} className="v-layer v-particle" style={{ left: `${x}%`, bottom: '18%', animationDelay: `${i * 0.6}s` }} />)}</>;
  }
  const stars = SPARKLES.map(([x, y, d]) => (
    <span key={`${x}${y}`} className="v-layer v-sparkle text-sm" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s`, color: variant === 'void' ? '#e6d4ff' : '#fff3a8' }}>✦</span>
  ));
  if (variant === 'void') return <>{stars}</>;
  if (variant === 'celestial') return <><span className="v-layer v-halo" />{stars}</>;
  return <>{stars}</>;
}

function MonsterArtImpl({ parts, palette, flip, ko = false, idle = false, className = '', variant = 'normal' }: MonsterArtProps) {
  const uid = useId().replace(/:/g, '');
  const sp = SPECIES[parts.species] ?? SPECIES.furball!;
  const body = PALETTE[palette.body] ?? PALETTE[0];
  const accentRaw = PALETTE[palette.accent] ?? PALETTE[1];
  // Avoid invisible details when both colours match.
  const accent = accentRaw === body ? mix(accentRaw, '#ffffff', 0.45) : accentRaw;
  const c: Ctx = { a: sp.a, uid, body, accent, dark: mix(body, '#120018', 0.55), light: mix(body, '#ffffff', 0.45), ko };
  const s = 100 - sp.a.halfW + 8;
  const arm = ARMS[parts.arms] ?? ARMS.stubby!;
  const leg = LEGS[parts.legs] ?? LEGS.stumpy!;
  const mirror = (node: ReactNode) => <>{node}<g transform="translate(200 0) scale(-1 1)">{node}</g></>;

  return (
    <div className={`relative ${idle ? 'monster-idle' : ''} ${variant !== 'normal' && !ko ? `variant-${variant}` : ''} ${className}`}>
      {variant === 'void' && !ko && <span className="v-layer v-vortex" />}
      <svg viewBox="-24 -54 248 256" className="block h-full w-full overflow-visible" role="img" aria-label={`${parts.species} monster`}>
        <defs>
          <clipPath id={`clip-${uid}`}><path d={sp.shape} /></clipPath>
          <linearGradient id={`metal-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0.55} />
            <stop offset="0.45" stopColor="#fff" stopOpacity={0} />
            <stop offset="0.55" stopColor="#000" stopOpacity={0.05} />
            <stop offset="1" stopColor="#000" stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id={`fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.45" stopColor="#fff" stopOpacity={0} />
            <stop offset="1" stopColor="#fff" stopOpacity={0.6} />
          </linearGradient>
          <radialGradient id={`space-${uid}`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#3a1f7a" stopOpacity={0.25} />
            <stop offset="1" stopColor="#0b0624" stopOpacity={0.75} />
          </radialGradient>
        </defs>
        <ellipse cx={100} cy={194} rx={68} ry={8} fill="#000" opacity={0.2} />
        <g transform={flip ? 'translate(200 0) scale(-1 1)' : undefined}>
          {sp.base ? sp.base(c) : (
            <>
              {parts.legs === 'hover' && <ellipse cx={100} cy={190} rx={52} ry={9} fill={accent} opacity={0.6} />}
              {mirror(leg(c))}
            </>
          )}
          {sp.back?.(c)}
          {(HEADS[parts.head] ?? HEADS.none!)(c)}
          {mirror(arm(c, s, sp.a.armY))}
          <path d={sp.shape} fill={body} opacity={sp.bodyOpacity ?? 1} />
          <g clipPath={`url(#clip-${uid})`}>
            {(PATTERNS[parts.pattern] ?? PATTERNS.plain!)(c)}
            {sp.texture?.(c)}
          </g>
          <path d={sp.shape} fill="none" stroke={INK} strokeWidth={W + 1} strokeLinejoin="round" />
          {sp.front?.(c)}
          {(EYES[parts.eyes] ?? EYES.googly!)(c)}
          {(MOUTHS[parts.mouth] ?? MOUTHS.grin!)(c)}
        </g>
      </svg>
      {!ko && <VariantLayers variant={variant} />}
    </div>
  );
}

export const MonsterArt = memo(MonsterArtImpl);
