// Tiny synthesized sound effects via Web Audio — no asset files.
// Soft, rounded tones: every voice gets an attack ramp (no clicky onsets)
// and most run through a lowpass so nothing sounds sharp or alarming.

let ctx = null;
let muted = localStorage.getItem('pet.muted') === '1';

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  localStorage.setItem('pet.muted', m ? '1' : '0');
}

function note({
  freq = 440,
  to = null,
  time = 0.2,
  type = 'sine',
  gain = 0.05,
  when = 0,
  attack = 0.015,
  lowpass = 0,
}) {
  if (muted) return;
  try {
    const c = ac();
    const t0 = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + time);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
    let tail = o;
    if (lowpass) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      tail.connect(f);
      tail = f;
    }
    tail.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + time + 0.03);
  } catch {
    /* audio unavailable */
  }
}

// A soft bell: fundamental plus a quiet inharmonic partial that decays faster.
function bell(freq, { gain = 0.05, time = 0.5, when = 0 } = {}) {
  note({ freq, time, gain, when, type: 'sine' });
  note({ freq: freq * 2.51, time: time * 0.45, gain: gain * 0.22, when, type: 'sine' });
}

// ---------- species voices (played when petted) ----------

// cat: buzzy rumble with ~24Hz tremolo. Pitched high enough (110Hz saw,
// harmonics through a 520Hz lowpass) to be audible on laptop speakers.
function purr() {
  if (muted) return;
  try {
    const c = ac();
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 110;
    f.type = 'lowpass';
    f.frequency.value = 520;
    lfo.frequency.value = 24;
    lg.gain.value = 0.03;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.07);
    g.gain.setValueAtTime(0.05, t0 + 0.62);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95);
    lfo.connect(lg).connect(g.gain);
    o.connect(f).connect(g).connect(c.destination);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 1);
    lfo.stop(t0 + 1);
  } catch {
    /* audio unavailable */
  }
}

// puppy: happy double "boof"
function boof() {
  note({ freq: 170, to: 85, time: 0.13, type: 'sawtooth', gain: 0.07, lowpass: 750, attack: 0.008 });
  note({ freq: 200, to: 95, time: 0.14, type: 'sawtooth', gain: 0.065, lowpass: 750, attack: 0.008, when: 0.18 });
}

// bunny: quick little squeaks
function squeak() {
  note({ freq: 1500, to: 2200, time: 0.07, gain: 0.04 });
  note({ freq: 2100, to: 1300, time: 0.1, gain: 0.035, when: 0.08 });
  note({ freq: 1600, to: 2300, time: 0.07, gain: 0.035, when: 0.24 });
}

// bird: cheerful tweet-tweet
function tweet() {
  note({ freq: 1568, time: 0.07, gain: 0.04, type: 'triangle' });
  note({ freq: 1865, time: 0.07, gain: 0.045, when: 0.09, type: 'triangle' });
  note({ freq: 2093, to: 1760, time: 0.12, gain: 0.04, when: 0.18, type: 'triangle' });
}

// ghost: airy down-up "woooo"
function woo() {
  note({ freq: 480, to: 330, time: 0.42, gain: 0.035, attack: 0.06 });
  note({ freq: 330, to: 540, time: 0.45, gain: 0.03, when: 0.4, attack: 0.06 });
}

// humans: a cheerful two-note whistle (girl's a bit brighter)
function whistleBoy() {
  note({ freq: 740, to: 988, time: 0.12, gain: 0.045, type: 'sine' });
  note({ freq: 988, to: 740, time: 0.16, gain: 0.04, when: 0.15, type: 'sine' });
}

function whistleGirl() {
  note({ freq: 932, to: 1245, time: 0.12, gain: 0.045, type: 'sine' });
  note({ freq: 1245, to: 932, time: 0.16, gain: 0.04, when: 0.15, type: 'sine' });
}

const VOICES = {
  cat: purr,
  pup: boof,
  bunny: squeak,
  bird: tweet,
  ghost: woo,
  boy: whistleBoy,
  girl: whistleGirl,
};

export const sfx = {
  // reminder due: gentle three-note pentatonic rise (C6 E6 G6)
  chirp() {
    note({ freq: 1047, time: 0.16, gain: 0.04, type: 'sine' });
    note({ freq: 1319, time: 0.16, gain: 0.045, when: 0.1, type: 'sine' });
    note({ freq: 1568, time: 0.28, gain: 0.05, when: 0.2, type: 'sine' });
  },
  // reminder completed: warm little bell answer (E6 → A6)
  ding() {
    bell(1319, { gain: 0.045, time: 0.4 });
    bell(1760, { gain: 0.05, time: 0.55, when: 0.12 });
  },
  // landing: soft marshmallow plop, scaled by impact
  boing(v = 1) {
    note({
      freq: 240,
      to: 95,
      time: 0.14,
      type: 'sine',
      gain: Math.min(0.055, 0.028 * v),
      lowpass: 480,
      attack: 0.006,
    });
  },
  // species-appropriate reaction to petting
  voice(species) {
    (VOICES[species] || purr)();
  },
  purr,
};
