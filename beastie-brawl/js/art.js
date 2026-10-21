// Procedural monster art. Every beastie is built from a numeric seed, so the
// same seed always draws the same creature and saves only need to store it.
const Art = (() => {
  let uid = 0;

  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const between = (r, a, b) => a + r() * (b - a);

  // Body shapes share one 200x200 canvas with the ground at y≈182.
  const BODIES = {
    blob:  { shape: '<ellipse cx="100" cy="124" rx="66" ry="57"/>', top: 67, eyeY: 104, mouthY: 140, armY: 128, halfW: 64 },
    tall:  { shape: '<ellipse cx="100" cy="112" rx="48" ry="70"/>', top: 42, eyeY: 82, mouthY: 118, armY: 122, halfW: 47 },
    pear:  { shape: '<path d="M100 46 C140 46 150 92 160 132 C170 176 132 182 100 182 C68 182 30 176 40 132 C50 92 60 46 100 46Z"/>', top: 46, eyeY: 86, mouthY: 120, armY: 138, halfW: 58 },
    box:   { shape: '<rect x="38" y="58" width="124" height="122" rx="34"/>', top: 58, eyeY: 96, mouthY: 136, armY: 132, halfW: 62 },
    round: { shape: '<circle cx="100" cy="119" r="61"/>', top: 58, eyeY: 102, mouthY: 140, armY: 124, halfW: 60 },
  };

  function dna(seed) {
    const r = rng(seed);
    const hue = Math.floor(r() * 360);
    const hue2 = (hue + 40 + Math.floor(r() * 220)) % 360;
    const sat = Math.floor(between(r, 55, 80));
    const light = Math.floor(between(r, 48, 62));
    return {
      seed,
      body: pick(r, Object.keys(BODIES)),
      color: `hsl(${hue} ${sat}% ${light}%)`,
      dark: `hsl(${hue} ${sat}% ${Math.max(18, light - 32)}%)`,
      belly: `hsl(${hue} ${sat}% ${Math.min(88, light + 24)}%)`,
      accent: `hsl(${hue2} 75% 55%)`,
      eyes: pick(r, [1, 2, 2, 2, 3, 3]),
      eyeSize: between(r, 0.85, 1.2),
      eyeStyle: pick(r, ['round', 'angry', 'angry', 'sleepy']),
      mouth: pick(r, ['grin', 'fangs', 'chomp', 'tusks']),
      horns: pick(r, ['none', 'devil', 'antennae', 'spikes', 'unihorn', 'devil']),
      hornColor: pick(r, ['#f4ead2', '#3a2f3f', `hsl(${hue2} 75% 55%)`]),
      pattern: pick(r, ['none', 'spots', 'stripes', 'spots']),
      patternSeed: Math.floor(r() * 1e9),
      belly_: r() < 0.6,
      claws: r() < 0.7,
    };
  }

  function eyesSvg(d, b, ko) {
    const out = [];
    const n = d.eyes;
    const base = (n === 1 ? 20 : n === 3 ? 11 : 14) * d.eyeSize;
    const gap = Math.min(b.halfW * 0.44, 27);
    const spots = n === 1 ? [[100, 0]] : n === 2 ? [[100 - gap, 0], [100 + gap, 0]] : [[100 - gap - 2, 0], [100, -10], [100 + gap + 2, 0]];
    for (const [x, dy] of spots) {
      const y = b.eyeY + dy, r = base;
      if (ko) {
        const k = r * 0.6;
        out.push(`<path d="M${x - k} ${y - k} L${x + k} ${y + k} M${x + k} ${y - k} L${x - k} ${y + k}" stroke="${d.dark}" stroke-width="5" stroke-linecap="round"/>`);
        continue;
      }
      out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${d.dark}" stroke-width="3"/>`);
      out.push(`<circle cx="${x + r * 0.28}" cy="${y + r * 0.05}" r="${r * 0.5}" fill="#1b1424"/>`);
      out.push(`<circle cx="${x + r * 0.42}" cy="${y - r * 0.15}" r="${r * 0.16}" fill="#fff"/>`);
      if (d.eyeStyle === 'sleepy') {
        out.push(`<path d="M${x - r - 1} ${y} A${r + 1} ${r + 1} 0 0 1 ${x + r + 1} ${y} Z" fill="${d.color}" stroke="${d.dark}" stroke-width="3"/>`);
      } else if (d.eyeStyle === 'angry') {
        const k = x < 99 ? 1 : x > 101 ? -1 : 0; // brows slope down toward the middle
        const y1 = y - r - 5 - k * 4, y2 = y - r - 5 + k * 4;
        const xa = x - r, xb = x + r;
        out.push(`<path d="M${xa} ${y1} L${xb} ${y2}" stroke="${d.dark}" stroke-width="5" stroke-linecap="round"/>`);
      }
    }
    return out.join('');
  }

  function mouthSvg(d, b) {
    const w = Math.min(b.halfW * 0.95, 62);
    const x0 = 100 - w / 2, x1 = 100 + w / 2, y = b.mouthY;
    const ink = '#2a1622';
    const parts = [];
    if (d.mouth === 'grin' || d.mouth === 'fangs') {
      parts.push(`<path d="M${x0} ${y} Q100 ${y + 30} ${x1} ${y} Z" fill="${ink}" stroke="${d.dark}" stroke-width="3" stroke-linejoin="round"/>`);
      parts.push(`<ellipse cx="100" cy="${y + 11}" rx="${w * 0.2}" ry="4" fill="#ff6b8a"/>`);
      if (d.mouth === 'grin') {
        for (let i = 1; i < 5; i++) {
          const tx = x0 + (w / 5) * i;
          parts.push(`<rect x="${tx - 4}" y="${y}" width="8" height="6" rx="1.5" fill="#fff"/>`);
        }
      } else {
        for (const fx of [100 - w / 4, 100 + w / 4]) {
          parts.push(`<path d="M${fx - 6} ${y} L${fx + 6} ${y} L${fx} ${y + 14} Z" fill="#fff"/>`);
        }
      }
    } else if (d.mouth === 'chomp') {
      const rx = w / 2.4;
      parts.push(`<ellipse cx="100" cy="${y + 6}" rx="${rx}" ry="13" fill="${ink}" stroke="${d.dark}" stroke-width="3"/>`);
      let top = `M${100 - rx + 3} ${y - 3}`, bot = `M${100 - rx + 3} ${y + 15}`;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const xa = 100 - rx + 3 + ((2 * rx - 6) / n) * i;
        const xb = xa + (2 * rx - 6) / n;
        top += ` L${(xa + xb) / 2} ${y + 5} L${xb} ${y - 3}`;
        bot += ` L${(xa + xb) / 2} ${y + 8} L${xb} ${y + 15}`;
      }
      parts.push(`<path d="${top} Z" fill="#fff"/><path d="${bot} Z" fill="#fff"/>`);
    } else {
      parts.push(`<path d="M${x0} ${y} Q100 ${y + 18} ${x1} ${y}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`);
      for (const [tx, dir] of [[x0 + 6, -1], [x1 - 6, 1]]) {
        parts.push(`<path d="M${tx - 5} ${y + 4} L${tx + 5} ${y + 4} L${tx + dir * 3} ${y - 14} Z" fill="#fff" stroke="${d.dark}" stroke-width="1.5"/>`);
      }
    }
    return parts.join('');
  }

  function hornsSvg(d, b) {
    const t = b.top, c = d.hornColor, s = d.dark;
    switch (d.horns) {
      case 'devil':
        return [-1, 1].map(k => {
          const x = 100 + k * 24;
          return `<path d="M${x - 9} ${t + 14} Q${x + k * 4} ${t - 6} ${x + k * 16} ${t - 30} Q${x + k * 14} ${t - 4} ${x + 9} ${t + 14} Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>`;
        }).join('');
      case 'antennae':
        return [-1, 1].map(k => {
          const x = 100 + k * 16, tx = 100 + k * 32;
          return `<path d="M${x} ${t + 10} Q${x + k * 4} ${t - 18} ${tx} ${t - 30}" stroke="${s}" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="${tx}" cy="${t - 32}" r="7" fill="${d.accent}" stroke="${s}" stroke-width="3"/>`;
        }).join('');
      case 'spikes': {
        let out = '';
        for (let i = -2; i <= 2; i++) {
          const x = 100 + i * 17, h = 22 - Math.abs(i) * 4;
          out += `<path d="M${x - 9} ${t + 14} L${x} ${t - h} L${x + 9} ${t + 14} Z" fill="${d.accent}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>`;
        }
        return out;
      }
      case 'unihorn':
        return `<path d="M90 ${t + 12} L100 ${t - 38} L110 ${t + 12} Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>` +
          `<path d="M94 ${t - 2} L106 ${t - 8} M96 ${t - 16} L104 ${t - 20}" stroke="${s}" stroke-width="2"/>`;
      default:
        return '';
    }
  }

  function patternSvg(d, b) {
    const r = rng(d.patternSeed);
    let out = '';
    if (d.pattern === 'spots') {
      for (let i = 0; i < 9; i++) {
        const x = between(r, 100 - b.halfW, 100 + b.halfW);
        const y = between(r, b.top + 5, 178);
        out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${between(r, 5, 13).toFixed(1)}" fill="${d.accent}" opacity="0.45"/>`;
      }
    } else if (d.pattern === 'stripes') {
      for (let y = b.top + 14; y < 182; y += 24) {
        out += `<path d="M20 ${y} Q100 ${y + 10} 180 ${y} L180 ${y + 8} Q100 ${y + 18} 20 ${y + 8} Z" fill="${d.accent}" opacity="0.4"/>`;
      }
    }
    if (d.belly_) {
      out += `<ellipse cx="100" cy="${b.armY + 34}" rx="${b.halfW * 0.6}" ry="34" fill="${d.belly}" opacity="0.9"/>`;
    }
    return out;
  }

  // Hats are drawn around (0,0), which sits on the crown of the head.
  const HATS = {
    party: () => `<path d="M-18 0 L0 -50 L18 0 Z" fill="#ff4fa3" stroke="#7a1f4f" stroke-width="3" stroke-linejoin="round"/><path d="M-12 -14 L10 -22 M-7 -30 L6 -35" stroke="#ffe14d" stroke-width="5"/><circle cx="0" cy="-52" r="7" fill="#ffe14d" stroke="#7a1f4f" stroke-width="2"/>`,
    bow: () => `<path d="M0 -8 L-26 -24 L-26 6 Z M0 -8 L26 -24 L26 6 Z" fill="#ff7ac6" stroke="#8a2a5e" stroke-width="3" stroke-linejoin="round"/><circle cx="0" cy="-9" r="8" fill="#ff4fa3" stroke="#8a2a5e" stroke-width="3"/>`,
    propeller: () => `<path d="M-26 2 A26 24 0 0 1 26 2 Z" fill="#3fa9f5" stroke="#173b66" stroke-width="3"/><path d="M-9 -20 A26 24 0 0 1 9 -20 L9 2 L-9 2 Z" fill="#ff5252"/><path d="M0 -22 L0 -32" stroke="#173b66" stroke-width="3"/><ellipse class="spin" cx="0" cy="-34" rx="22" ry="5" fill="#ffe14d" stroke="#173b66" stroke-width="2"/>`,
    tophat: () => `<ellipse cx="0" cy="0" rx="32" ry="7" fill="#1d1a24"/><rect x="-20" y="-46" width="40" height="46" rx="3" fill="#1d1a24"/><rect x="-20" y="-14" width="40" height="8" fill="#d33"/>`,
    viking: () => `<path d="M-24 -10 Q-46 -14 -44 -42 Q-36 -22 -20 -22 Z M24 -10 Q46 -14 44 -42 Q36 -22 20 -22 Z" fill="#f4ead2" stroke="#5a4a3a" stroke-width="3" stroke-linejoin="round"/><path d="M-28 4 A28 28 0 0 1 28 4 Z" fill="#a8b0bd" stroke="#4a5160" stroke-width="3"/><rect x="-29" y="-2" width="58" height="8" rx="3" fill="#c8913a" stroke="#5a4a3a" stroke-width="2"/>`,
    wizard: () => `<path d="M-30 2 L30 2 L8 -18 L14 -60 L-10 -20 Z" fill="#4b3bbf" stroke="#1f1660" stroke-width="3" stroke-linejoin="round"/><path d="M-30 2 L30 2" stroke="#1f1660" stroke-width="6" stroke-linecap="round"/><text x="-6" y="-12" font-size="14" fill="#ffe14d">★</text><text x="4" y="-36" font-size="9" fill="#ffe14d">★</text>`,
    crown: () => `<path d="M-26 2 L-26 -26 L-13 -12 L0 -34 L13 -12 L26 -26 L26 2 Z" fill="#ffd23f" stroke="#8a6200" stroke-width="3" stroke-linejoin="round"/><circle cx="0" cy="-8" r="5" fill="#e0245e"/><circle cx="-15" cy="-6" r="3.5" fill="#3fa9f5"/><circle cx="15" cy="-6" r="3.5" fill="#3fa9f5"/>`,
  };

  function render(seedOrDna, opts = {}) {
    const d = typeof seedOrDna === 'number' ? dna(seedOrDna) : seedOrDna;
    const b = BODIES[d.body];
    const id = 'bb' + (++uid);
    const arm = (k) => {
      const x = 100 + k * (b.halfW + 6);
      const claws = d.claws
        ? [-6, 0, 6].map(o => `<path d="M${x + k * 14} ${b.armY + o - 3} L${x + k * 24} ${b.armY + o} L${x + k * 14} ${b.armY + o + 3} Z" fill="#fff" stroke="${d.dark}" stroke-width="1.5"/>`).join('')
        : '';
      return `${claws}<ellipse cx="${x}" cy="${b.armY}" rx="20" ry="12" transform="rotate(${k * 20} ${x} ${b.armY})" fill="${d.color}" stroke="${d.dark}" stroke-width="4"/>`;
    };
    const feet = [-1, 1].map(k => `<ellipse cx="${100 + k * 32}" cy="182" rx="20" ry="10" fill="${d.color}" stroke="${d.dark}" stroke-width="4"/>`).join('');
    const hat = opts.hat && HATS[opts.hat]
      ? `<g transform="translate(100 ${b.top + 6}) scale(1.05)">${HATS[opts.hat]()}</g>` : '';
    const flip = opts.flip ? 'translate(200 0) scale(-1 1)' : '';
    return `<svg class="monster-svg" viewBox="-10 -30 220 230" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><clipPath id="${id}">${b.shape}</clipPath></defs>
<ellipse cx="100" cy="190" rx="70" ry="8" fill="#000" opacity="0.18"/>
<g transform="${flip}">
${hornsSvg(d, b)}${arm(-1)}${arm(1)}${feet}
<g fill="${d.color}" stroke="${d.dark}" stroke-width="5">${b.shape}</g>
<g clip-path="url(#${id})">${patternSvg(d, b)}</g>
<g fill="none" stroke="${d.dark}" stroke-width="5">${b.shape}</g>
${eyesSvg(d, b, opts.ko)}${mouthSvg(d, b)}${hat}
</g></svg>`;
  }

  return { dna, render, rng, hats: Object.keys(HATS) };
})();
