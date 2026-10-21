// Tiny WebAudio synth: no audio files needed.
let ctx: AudioContext | null = null;
const KEY = 'mbc-muted';

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(m: boolean): void {
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {
    // storage unavailable
  }
}

function beep(freq: number, dur = 0.1, type: OscillatorType = 'square', vol = 0.05, slide = 0, delay = 0): void {
  if (isMuted()) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    // audio unavailable
  }
}

/** A short burst of filtered noise (whooshes, splashes, fire, rumbles). */
function noise(dur = 0.4, freq = 800, vol = 0.08, delay = 0, type: BiquadFilterType = 'bandpass'): void {
  if (isMuted()) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  } catch {
    // audio unavailable
  }
}

export const sfx = {
  click: () => beep(660, 0.05, 'square', 0.03),
  pick: () => beep(520, 0.08, 'triangle', 0.06, 200),
  tick: () => beep(1200, 0.02, 'square', 0.02),
  reveal: () => { beep(300, 0.12, 'sawtooth', 0.05, 300); beep(600, 0.15, 'square', 0.04, 0, 0.1); },
  coin: () => { beep(988, 0.07, 'square', 0.04); beep(1319, 0.12, 'square', 0.04, 0, 0.07); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'square', 0.05, 0, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.22, 'triangle', 0.06, 0, i * 0.15)),
  thud: () => beep(90, 0.4, 'sawtooth', 0.12, -50),
  challenge: () => [880, 660, 880].forEach((f, i) => beep(f, 0.1, 'square', 0.05, 0, i * 0.12)),
  // Finisher effects
  gloop: () => { beep(180, 0.25, 'sine', 0.12, -120); beep(320, 0.15, 'sine', 0.08, -200, 0.12); },
  bubble: () => beep(500 + Math.random() * 400, 0.06, 'sine', 0.05, 300),
  servo: () => beep(220, 0.6, 'sawtooth', 0.04, 380),
  clank: () => { beep(1400, 0.05, 'square', 0.06); beep(700, 0.12, 'square', 0.05, -200, 0.02); },
  crunch: () => noise(0.35, 1200, 0.18, 0, 'highpass'),
  squish: () => { beep(140, 0.3, 'sine', 0.14, -90); noise(0.15, 400, 0.08); },
  burp: () => beep(110, 0.7, 'sawtooth', 0.12, -40),
  boom: () => { beep(70, 0.6, 'sine', 0.25, -30); noise(0.5, 200, 0.2, 0, 'lowpass'); },
  buzz: () => beep(240, 0.9, 'sawtooth', 0.03, 30),
  spooky: () => [440, 415, 392, 370].forEach((f, i) => beep(f, 0.35, 'triangle', 0.05, -20, i * 0.18)),
  rumble: () => noise(1.0, 120, 0.15, 0, 'lowpass'),
  thump: () => noise(0.18, 300, 0.12, 0, 'lowpass'),
  chime: () => [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.25, 'sine', 0.05, 0, i * 0.09)),
  splash: () => noise(0.9, 1500, 0.14),
  fire: () => noise(1.4, 700, 0.12),
  beam: () => beep(300, 1.2, 'sine', 0.06, 600),
  pop: () => beep(900, 0.06, 'square', 0.05, -500),
  zip: () => beep(400, 0.3, 'square', 0.04, 1200),
};
