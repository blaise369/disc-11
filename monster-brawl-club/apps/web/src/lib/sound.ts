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
};
