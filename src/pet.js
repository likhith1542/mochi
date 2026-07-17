// Pixel-art cat rendered from string grids, with a small behavior state machine.
// Grid letters: . transparent, k outline, o body, p pink, w cream, E eye (sclera).

import { sfx } from './sound.js';

const CELL = 5;
const COLS = 16;
const ROWS = 13;

// A species defines the sprite shape (base grid + eye/feet patch variants,
// eye centers for the pupil overlay, tail style). A pet pairs a species with
// a palette. Grid letters map through the palette, so shapes are reusable.

const CAT_SPECIES = {
  base: [
    '..kk........kk..',
    '.kppk......kppk.',
    '.kpppk....kpppk.',
    'koooookkkkoooook',
    'kooooooooooooook',
    'koooEEooooEEoook',
    'koooEEooooEEoook',
    'koooowwppwwooook',
    'kooooowwwwoooook',
    'kooooooooooooook',
    'kooooooooooooook',
    '.kooooooooooook.',
    '..kkk......kkk..',
  ],
  eyes: {
    open: [],
    closed: [
      [5, 'kooooooooooooook'],
      [6, 'koookkoooookkook'],
    ],
    wide: [[4, 'koooEEooooEEoook']],
  },
  feet: {
    stand: [],
    walkA: [[12, '.kkk........kkk.']],
    walkB: [[12, '...kkk....kkk...']],
  },
  eyeL: { x: 5 * CELL, y: 6 * CELL },
  eyeR: { x: 11 * CELL, y: 6 * CELL },
  tail: 'wag',
};

const BUNNY_SPECIES = {
  base: [
    '...kk......kk...',
    '..kppk....kppk..',
    '..kppk....kppk..',
    '.kooooooooooook.',
    'kooooooooooooook',
    'koooEEooooEEoook',
    'koooEEooooEEoook',
    'koooowwppwwooook',
    'kooooowwwwoooook',
    'kooooooooooooook',
    'kooooooooooooook',
    '.kooooooooooook.',
    '..kkk......kkk..',
  ],
  eyes: {
    open: [],
    closed: [
      [5, 'kooooooooooooook'],
      [6, 'koookkoooookkook'],
    ],
    wide: [[4, 'koooEEooooEEoook']],
  },
  feet: {
    stand: [],
    walkA: [[12, '.kkk........kkk.']],
    walkB: [[12, '...kkk....kkk...']],
  },
  eyeL: { x: 5 * CELL, y: 6 * CELL },
  eyeR: { x: 11 * CELL, y: 6 * CELL },
  tail: 'puff',
};

const PUP_SPECIES = {
  base: [
    '................',
    '.pp..........pp.',
    '.ppkkkkkkkkkkpp.',
    '.ppoooooooooopp.',
    '.ppoooooooooopp.',
    '.ppoEEooooEEopp.',
    '.ppoEEooooEEopp.',
    'koooowwwwwwooook',
    'kooooowppwoooook',
    'kooooooooooooook',
    'kooooooooooooook',
    '.kooooooooooook.',
    '..kkk......kkk..',
  ],
  eyes: {
    open: [],
    closed: [
      [5, '.ppoooooooooopp.'],
      [6, '.ppokkoooookkopp'],
    ],
    wide: [[4, '.ppoEEooooEEopp.']],
  },
  feet: {
    stand: [],
    walkA: [[12, '.kkk........kkk.']],
    walkB: [[12, '...kkk....kkk...']],
  },
  eyeL: { x: 5 * CELL, y: 6 * CELL },
  eyeR: { x: 11 * CELL, y: 6 * CELL },
  tail: 'wag',
};

const BIRD_SPECIES = {
  base: [
    '....kkkkkkkk....',
    '...kooooooook...',
    '..koooooooooook.',
    '..koEEooooEEok..',
    '..koEEooooEEok..',
    '..koooppppooook.',
    '..koowwwwwwook..',
    '.koowwwwwwwwook.',
    '.koowwwwwwwwook.',
    '.koowwwwwwwwook.',
    '.koowwwwwwwwook.',
    '..koowwwwwwook..',
    '..ppp......ppp..',
  ],
  eyes: {
    open: [],
    closed: [
      [3, '..koooooooooook.'],
      [4, '..kokkoooookkok.'],
    ],
    wide: [[2, '..koEEooooEEok..']],
  },
  feet: {
    stand: [],
    walkA: [[12, '...ppp....ppp...']],
    walkB: [[12, '.ppp......ppp...']],
  },
  eyeL: { x: 5 * CELL, y: 4 * CELL },
  eyeR: { x: 11 * CELL, y: 4 * CELL },
  tail: 'none',
};

const GHOST_SPECIES = {
  base: [
    '.....kkkkkk.....',
    '...kkooooookk...',
    '..koooooooooook.',
    '..koooooooooook.',
    '..koEEooooEEok..',
    '..koEEooooEEok..',
    '..kooooppooook..',
    '.kooooooooooook.',
    '.kooooooooooook.',
    'kooooooooooooook',
    'kooooooooooooook',
    'kooooooooooooook',
    'kk..kk..kk..kk..',
  ],
  eyes: {
    open: [],
    closed: [
      [4, '..koooooooooook.'],
      [5, '..kokkoooookkok.'],
    ],
    wide: [[3, '..koEEooooEEok..']],
  },
  feet: {
    stand: [],
    walkA: [[12, '..kk..kk..kk..kk']],
    walkB: [],
  },
  eyeL: { x: 5 * CELL, y: 5 * CELL },
  eyeR: { x: 11 * CELL, y: 5 * CELL },
  tail: 'none',
  float: true,
};

const SPECIES = {
  cat: CAT_SPECIES,
  bunny: BUNNY_SPECIES,
  pup: PUP_SPECIES,
  bird: BIRD_SPECIES,
  ghost: GHOST_SPECIES,
};

// Prop animations the pet can perform (per-reminder or while idle).
export const ANIMS = [
  { id: 'drink', emoji: '🚰', label: 'Drink water' },
  { id: 'stand', emoji: '🧍', label: 'Stand tall' },
  { id: 'read', emoji: '📖', label: 'Read a book' },
  { id: 'music', emoji: '🎧', label: 'Listen to music' },
  { id: 'type', emoji: '⌨️', label: 'Type away' },
];
const ANIM_IDS = new Set(ANIMS.map((a) => a.id));

export const SPECIES_INFO = [
  { id: 'cat', label: 'Cat' },
  { id: 'pup', label: 'Puppy' },
  { id: 'bunny', label: 'Bunny' },
  { id: 'bird', label: 'Bird' },
  { id: 'ghost', label: 'Ghost' },
];

// Every species comes in several color variants, each with a default name.
export const VARIANTS = {
  cat: [
    { id: 'orange', name: 'Mochi', pal: { k: '#463227', o: '#f4a259', p: '#f28482', w: '#fff3e2', E: '#fffdf6' } },
    { id: 'cream', name: 'Miso', pal: { k: '#4a3a28', o: '#e9cfa3', p: '#f0958f', w: '#fff7e8', E: '#fffdf6' } },
    { id: 'grey', name: 'Sumi', pal: { k: '#33323e', o: '#9fa3b5', p: '#f2a5b5', w: '#e9eaf2', E: '#ffffff' } },
    { id: 'white', name: 'Yuki', pal: { k: '#4a4038', o: '#f3efe6', p: '#f6b7c5', w: '#ffffff', E: '#ffffff' } },
    { id: 'black', name: 'Kuro', pal: { k: '#26212c', o: '#4d4653', p: '#e58a9a', w: '#6b6376', E: '#fffdf6' } },
  ],
  pup: [
    { id: 'brown', name: 'Kobe', pal: { k: '#3f2f23', o: '#c98d5a', p: '#7d5638', w: '#f6e7d3', E: '#fffdf6' } },
    { id: 'golden', name: 'Sunny', pal: { k: '#4a3820', o: '#e5b56b', p: '#b98a44', w: '#fdf2d9', E: '#fffdf6' } },
    { id: 'husky', name: 'Koda', pal: { k: '#363b45', o: '#aeb6c2', p: '#6f7683', w: '#eef1f5', E: '#ffffff' } },
    { id: 'choco', name: 'Bruno', pal: { k: '#2f2015', o: '#7a5238', p: '#4e3322', w: '#e8d6c3', E: '#fffdf6' } },
  ],
  bunny: [
    { id: 'white', name: 'Mimi', pal: { k: '#4a3c38', o: '#f7f1e9', p: '#f4a9bc', w: '#ffffff', E: '#ffffff' } },
    { id: 'grey', name: 'Pepper', pal: { k: '#3f3a44', o: '#b9b4bd', p: '#f2a9c0', w: '#f0edf3', E: '#ffffff' } },
    { id: 'brown', name: 'Clover', pal: { k: '#4a3826', o: '#c9a27a', p: '#f2b3a0', w: '#f4e8d8', E: '#fffdf6' } },
    { id: 'black', name: 'Ink', pal: { k: '#242028', o: '#4b4550', p: '#e58aa5', w: '#6d6678', E: '#fffdf6' } },
  ],
  bird: [
    { id: 'navy', name: 'Pip', pal: { k: '#20242f', o: '#333a4f', p: '#f2a24b', w: '#f4f6f8', E: '#ffffff' } },
    { id: 'yellow', name: 'Waddle', pal: { k: '#4a3a1e', o: '#f2cf5b', p: '#ef9f3c', w: '#fbf3dc', E: '#ffffff' } },
    { id: 'red', name: 'Ruby', pal: { k: '#3d1f1a', o: '#c95b4e', p: '#f2a24b', w: '#f7e1c9', E: '#ffffff' } },
    { id: 'blue', name: 'Sky', pal: { k: '#2c3e55', o: '#7fb3e0', p: '#f2b04b', w: '#eaf3fb', E: '#ffffff' } },
  ],
  ghost: [
    { id: 'lavender', name: 'Boo', pal: { k: '#474060', o: '#b9aef0', p: '#8d81c9', w: '#e6e0ff', E: '#ffffff' } },
    { id: 'mint', name: 'Minty', pal: { k: '#3c5c4e', o: '#9adbc0', p: '#6fae94', w: '#e4f7ee', E: '#ffffff' } },
    { id: 'peach', name: 'Peachy', pal: { k: '#5c4030', o: '#f7c59f', p: '#d99a6c', w: '#fdeee0', E: '#ffffff' } },
    { id: 'slate', name: 'Misty', pal: { k: '#333a47', o: '#9fa8b8', p: '#727c8f', w: '#e6eaf1', E: '#ffffff' } },
  ],
};

export const PETS = {};
for (const sp of Object.keys(VARIANTS)) {
  for (const v of VARIANTS[sp]) {
    PETS[`${sp}.${v.id}`] = { species: sp, variant: v.id, name: v.name, pal: v.pal };
  }
}

// Ids from builds before variants existed.
export const LEGACY_IDS = {
  mochi: 'cat.orange',
  miso: 'cat.cream',
  sumi: 'cat.grey',
  yuki: 'cat.white',
  kuro: 'cat.black',
  kobe: 'pup.brown',
  mimi: 'bunny.white',
  pip: 'bird.navy',
  waddle: 'bird.yellow',
  boo: 'ghost.lavender',
};

function normalize(row) {
  return (row + '.'.repeat(COLS)).slice(0, COLS);
}

function makeFrame(base, patches, pal) {
  const rows = base.slice();
  for (const [i, s] of patches) rows[i] = s;
  const c = document.createElement('canvas');
  c.width = COLS * CELL;
  c.height = ROWS * CELL;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    const r = normalize(row);
    for (let x = 0; x < COLS; x++) {
      const col = pal[r[x]];
      if (col) {
        g.fillStyle = col;
        g.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  });
  return c;
}

const SPR_W = COLS * CELL;
const SPR_H = ROWS * CELL;

// Small idle-pose preview for the pet picker in the menu.
const thumbCache = {};
export function petThumb(id, size = 22) {
  const key = `${id}:${size}`;
  if (thumbCache[key]) return thumbCache[key];
  const def = PETS[id];
  const sp = SPECIES[def.species];
  const frame = makeFrame(sp.base, [], def.pal);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const h = Math.round(size * (SPR_H / SPR_W));
  g.drawImage(frame, 0, size - h, size, h);
  return (thumbCache[key] = c.toDataURL());
}

export class Pet {
  constructor(phys, bounds, skinId = 'cat.orange') {
    this.phys = phys;
    this.bounds = bounds;
    this.t = 0;
    this.state = 'falling';
    this.facing = 1;
    this.dir = 1;
    this.squash = 0;
    this.prevVy = 0;
    this.alert = false;

    this.nextBlink = 2;
    this.blinkUntil = 0;
    this.decideAt = 2;
    this.walkUntil = 0;
    this.sleepUntil = 0;
    this.lastSleep = -100;
    this.hopAt = 0;
    this.zAt = 0;
    this.particles = [];
    this.cursor = { x: -1e4, y: -1e4 };
    this.cursorIdleMs = 0;
    this.visiting = false;
    this.acting = null;
    this.idleAnim = 'stand';
    this.rhythmAt = 0;

    this.setSkin(skinId);
  }

  setIdleAnim(name) {
    this.idleAnim = ANIM_IDS.has(name) ? name : null;
  }

  startAct(name, durMs = 0) {
    if (!ANIM_IDS.has(name)) return;
    this.acting = { name, until: durMs ? this.t + durMs / 1000 : Infinity };
    this.rhythmAt = 0;
    this.wake();
  }

  stopAct() {
    this.acting = null;
  }

  setSkin(id) {
    this.skinId = PETS[id] ? id : 'cat.orange';
    const def = PETS[this.skinId];
    this.speciesId = def.species;
    this.species = SPECIES[def.species];
    this.pal = def.pal;
    this.frames = {};
    for (const eyes of Object.keys(this.species.eyes)) {
      for (const feet of Object.keys(this.species.feet)) {
        this.frames[`${eyes}:${feet}`] = makeFrame(
          this.species.base,
          [...this.species.eyes[eyes], ...this.species.feet[feet]],
          this.pal
        );
      }
    }
  }

  setState(s) {
    if (this.state !== s) {
      this.state = s;
      if (s !== 'walk') this.visiting = false;
    }
  }

  wake() {
    if (this.state === 'sleep') {
      this.setState('idle');
      this.decideAt = this.t + 2;
    }
  }

  petted() {
    this.wake();
    this.squash = 0.18;
    sfx.voice(this.speciesId);
    for (let i = 0; i < 3; i++) this.spawn('♥', '#e5566d', 60);
  }

  celebrate() {
    this.wake();
    this.phys.hop(6);
    for (let i = 0; i < 4; i++) this.spawn('♥', '#e5566d', 70);
  }

  setAlert(on) {
    this.alert = on;
    if (on) {
      this.wake();
      this.hopAt = 0;
    }
  }

  forceSleep() {
    this.setState('sleep');
    this.sleepUntil = this.t + 20 + Math.random() * 20;
    this.lastSleep = this.t;
  }

  spawn(text, color = '#8b7355', spread = 40) {
    const b = this.phys.pet;
    this.particles.push({
      x: b.position.x + (Math.random() - 0.5) * spread,
      y: b.position.y - this.phys.R,
      vy: -(22 + Math.random() * 16),
      vx: (Math.random() - 0.5) * 14,
      life: 1.4,
      age: 0,
      text,
      color,
    });
  }

  decide() {
    const r = Math.random();
    const c = this.cursor;
    const dx = c.x - this.phys.pet.position.x;
    // If the user's cursor has been resting somewhere on screen for a while,
    // she sometimes wanders over to sit near it.
    const canVisit =
      this.cursorIdleMs > 4000 &&
      c.x > (this.bounds.left || 0) + 20 &&
      c.x < this.bounds.W - 20 &&
      c.y > 0 &&
      c.y < this.bounds.H &&
      Math.abs(dx) > 220;
    if (canVisit && r < 0.3) {
      this.setState('walk');
      this.visiting = true;
      this.dir = dx > 0 ? 1 : -1;
      this.walkUntil = this.t + 9;
    } else if (r < 0.55) {
      this.setState('walk');
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.walkUntil = this.t + 1.2 + Math.random() * 2.5;
    } else if (r < 0.68 && this.t - this.lastSleep > 45) {
      this.forceSleep();
    } else if (r < 0.8 && this.idleAnim) {
      this.startAct(this.idleAnim, 8000 + Math.random() * 8000);
    } else {
      this.decideAt = this.t + 2 + Math.random() * 4;
    }
  }

  update(dt, env) {
    this.t += dt;
    this.cursor = env.cursor;
    this.cursorIdleMs = env.cursorIdleMs || 0;
    const b = this.phys.pet;
    const v = b.velocity;
    const grounded = this.phys.grounded();

    if (this.t > this.nextBlink) {
      this.blinkUntil = this.t + 0.14;
      this.nextBlink = this.t + 2.5 + Math.random() * 4;
    }

    this.squash += (0 - this.squash) * Math.min(1, dt * 9);

    if (env.dragging) {
      this.setState('carried');
    } else if (env.pinned) {
      if (this.state !== 'perch') {
        this.squash = 0.12;
        this.setState('perch');
      }
      if (this.alert && this.t > this.hopAt) {
        this.squash = 0.15;
        this.spawn('!', '#e07a2f', 10);
        this.hopAt = this.t + 1.5;
      }
    } else if (!grounded && v.y > 2.5) {
      this.setState('falling');
    } else if (grounded) {
      if (this.state === 'falling' || this.state === 'carried' || this.state === 'perch') {
        this.squash = Math.min(0.5, Math.abs(this.prevVy) / 28);
        if (Math.abs(this.prevVy) > 7) sfx.boing(Math.abs(this.prevVy) / 12);
        this.setState('idle');
        this.decideAt = this.t + 1 + Math.random() * 2;
      }
      if (this.acting) {
        if (this.t > this.acting.until) {
          this.acting = null;
          this.decideAt = this.t + 1 + Math.random() * 2;
        } else {
          if (this.state !== 'idle') this.setState('idle');
          this.decideAt = this.t + 2;
          const a = this.acting.name;
          if (a === 'music' && this.t > this.rhythmAt) {
            this.spawn(Math.random() < 0.5 ? '♪' : '♫', '#7d6bb5', 30);
            this.rhythmAt = this.t + 0.8 + Math.random() * 0.5;
          } else if (a === 'drink' && this.t > this.rhythmAt) {
            this.spawn('💧', '#7fc4e0', 16);
            this.rhythmAt = this.t + 1.9;
          } else if (a === 'stand' && this.t > this.rhythmAt) {
            this.spawn('✦', '#e8b64c', 34);
            this.rhythmAt = this.t + 2.2;
          }
          if (this.alert && this.t > this.hopAt) {
            this.spawn('!', '#e07a2f', 10);
            this.squash = 0.12;
            this.hopAt = this.t + 2;
          }
        }
      } else if (this.alert) {
        if (this.t > this.hopAt) {
          this.phys.hop(6.5);
          this.spawn('!', '#e07a2f', 10);
          this.hopAt = this.t + 1.5;
        }
      } else if (this.state === 'walk') {
        if (this.visiting) {
          const dx = env.cursor.x - b.position.x;
          if (Math.abs(dx) < 80 || this.cursorIdleMs < 600) {
            // arrived next to the resting cursor (or it moved — she got shy)
            if (Math.abs(dx) < 80) this.spawn('♥', '#e5566d', 20);
            this.setState('idle');
            this.decideAt = this.t + 3 + Math.random() * 4;
          } else {
            this.dir = dx > 0 ? 1 : -1;
          }
        }
        if (this.state === 'walk') {
          if (this.t > this.walkUntil) {
            this.setState('idle');
            this.decideAt = this.t + 1.5 + Math.random() * 3;
          } else {
            const p = b.position;
            if (p.x < (this.bounds.left || 0) + 70) this.dir = 1;
            if (p.x > this.bounds.W - 70) this.dir = -1;
            this.facing = this.dir;
            this.phys.nudge(this.dir * 1.5, undefined);
          }
        }
      } else if (this.state === 'sleep') {
        if (this.t > this.sleepUntil) {
          this.setState('idle');
          this.decideAt = this.t + 2;
        }
        if (this.t > this.zAt) {
          this.spawn('z', '#9a866f', 16);
          this.zAt = this.t + 1.3;
        }
      } else if (this.state === 'idle' && this.t > this.decideAt) {
        this.decide();
      }
    }
    this.prevVy = v.y;

    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  // Props are drawn in sprite-local space: origin at bottom-center of the
  // pet, x -40..40, ground at y=0, head top around y=-65.
  drawProp(g, name) {
    const k = this.pal.k;
    if (name === 'drink') {
      g.fillStyle = '#eaf6fc';
      g.fillRect(26, -18, 14, 18);
      g.fillStyle = '#8fd0e8';
      g.fillRect(26, -11, 14, 11);
      g.fillStyle = k;
      g.fillRect(24, -18, 2, 20);
      g.fillRect(40, -18, 2, 20);
      g.fillRect(24, 0, 18, 2);
      g.fillStyle = '#f28482';
      g.fillRect(34, -30, 3, 14);
      g.fillRect(31, -33, 6, 3);
    } else if (name === 'read') {
      g.fillStyle = '#fffdf6';
      g.fillRect(-20, -12, 18, 12);
      g.fillRect(2, -12, 18, 12);
      g.fillStyle = '#d9c8ae';
      g.fillRect(-16, -9, 11, 2);
      g.fillRect(-16, -5, 11, 2);
      g.fillRect(6, -9, 11, 2);
      g.fillRect(6, -5, 11, 2);
      g.fillStyle = k;
      g.fillRect(-1, -13, 2, 13);
      g.fillRect(-21, 0, 42, 2);
      if (this.t % 2.8 < 0.2) {
        g.fillStyle = '#fffdf6';
        g.fillRect(0, -20, 10, 12);
      }
    } else if (name === 'music') {
      const c1 = '#5a4a7a';
      const c2 = '#8d81c9';
      g.fillStyle = c1;
      g.fillRect(-34, -74, 68, 5);
      g.fillRect(-40, -72, 6, 30);
      g.fillRect(34, -72, 6, 30);
      g.fillRect(-46, -44, 12, 18);
      g.fillRect(34, -44, 12, 18);
      g.fillStyle = c2;
      g.fillRect(-43, -40, 6, 10);
      g.fillRect(37, -40, 6, 10);
    } else if (name === 'type') {
      g.fillStyle = '#3a4152';
      g.fillRect(-19, -32, 38, 26);
      g.fillStyle = '#cfe8ff';
      g.fillRect(-16, -29, 32, 20);
      g.fillStyle = '#7fb3e0';
      const ph = Math.floor(this.t * 2.5) % 3;
      g.fillRect(-13, -26, 14 + ph * 4, 2);
      g.fillRect(-13, -22, 20 - ph * 3, 2);
      g.fillRect(-13, -18, 8 + ph * 5, 2);
      g.fillStyle = '#9aa0ad';
      g.fillRect(-22, -6, 44, 6);
      g.fillStyle = '#6b7280';
      for (let i = 0; i < 6; i++) g.fillRect(-18 + i * 6, -4, 3, 2);
    }
  }

  currentFrameKey() {
    let eyes = 'open';
    let feet = 'stand';
    if (this.state === 'carried' || this.state === 'falling') {
      eyes = 'wide';
      feet = 'walkA';
    } else if (this.state === 'sleep' || this.t < this.blinkUntil) {
      eyes = 'closed';
    }
    if (this.state === 'walk') {
      feet = Math.floor(this.t * 6) % 2 === 0 ? 'walkA' : 'walkB';
    }
    return `${eyes}:${feet}`;
  }

  draw(g) {
    const b = this.phys.pet;
    const R = this.phys.R;
    const x = b.position.x;
    const bottom = b.position.y + R;

    let sx = 1 + this.squash * 0.45;
    let sy = 1 - this.squash * 0.45;
    if (this.state === 'falling') {
      sx *= 0.93;
      sy *= 1.08;
    }
    if (this.state === 'sleep') {
      sx *= 1.06;
      sy *= 0.88;
    }
    if (this.state === 'idle' || this.state === 'sleep') {
      sy *= 1 + Math.sin(this.t * 2.2) * 0.015;
    }

    let bob = 0;
    if (this.state === 'perch') {
      bob = Math.sin(this.t * 1.8) * 2;
      sy *= 1 + Math.sin(this.t * 1.8) * 0.01;
    }
    if (this.species.float && this.state !== 'carried') {
      bob += Math.sin(this.t * 2.5) * 2.5;
    }

    const act =
      this.acting && (this.state === 'idle' || this.state === 'perch')
        ? this.acting.name
        : null;
    let tilt = 0;
    if (act === 'stand') {
      sy *= 1.05;
      sx *= 0.97;
    } else if (act === 'music') {
      bob += Math.sin(this.t * 5) * 1.5;
    } else if (act === 'drink') {
      const ph = (Math.sin(this.t * 2) + 1) / 2;
      tilt = ph > 0.72 ? 0.13 : 0;
    } else if (act === 'type') {
      sx *= 1 + Math.sin(this.t * 18) * 0.008;
    }

    const key = this.currentFrameKey();
    const frame = this.frames[key];

    g.save();
    g.translate(x, bottom + bob);
    g.scale(this.facing * sx, sy);
    if (tilt) g.rotate(tilt);
    g.imageSmoothingEnabled = false;

    // tail (behind body)
    if (this.species.tail === 'wag') {
      const wag = Math.sin(this.t * (this.state === 'sleep' ? 1.2 : 3.5));
      g.fillStyle = this.pal.o;
      const tx = -SPR_W / 2 - CELL;
      const ty = -CELL * 3;
      g.fillRect(tx, ty, CELL, CELL);
      g.fillRect(tx - CELL, ty - CELL + (wag > 0 ? 0 : CELL), CELL, CELL);
      g.fillStyle = this.pal.k;
      g.fillRect(tx - CELL * 2, ty - CELL * 2 + (wag > 0 ? 0 : CELL * 2), CELL, CELL);
    } else if (this.species.tail === 'puff') {
      g.fillStyle = this.pal.w;
      g.fillRect(-SPR_W / 2 - CELL, -CELL * 4, CELL * 2, CELL * 2);
      g.fillStyle = this.pal.k;
      g.fillRect(-SPR_W / 2 - CELL, -CELL * 2, CELL, CELL);
    }

    g.drawImage(frame, -SPR_W / 2, -SPR_H);

    // pupils (only when eyes open/wide)
    if (!key.startsWith('closed')) {
      const dx = this.cursor.x - x;
      const dy = this.cursor.y - (bottom - SPR_H / 2);
      const m = Math.hypot(dx, dy) || 1;
      const near = m < 400 ? 1 : 0.3;
      let ox = Math.max(-2, Math.min(2, (dx / m) * 2.4)) * near * this.facing;
      let oy = Math.max(-2, Math.min(2, (dy / m) * 2.4)) * near;
      if (act === 'read' || act === 'type') {
        ox = 0;
        oy = 2.6;
      } else if (act === 'drink') {
        ox = 2.2;
        oy = 1.4;
      } else if (act === 'stand') {
        ox = 0;
        oy = 0;
      }
      g.fillStyle = '#2f2724';
      const pw = key.startsWith('wide') ? 5 : 4;
      const eyeL = this.species.eyeL;
      const eyeR = this.species.eyeR;
      g.fillRect(-SPR_W / 2 + eyeL.x - pw / 2 + ox, -SPR_H + eyeL.y - pw / 2 + oy, pw, pw);
      g.fillRect(-SPR_W / 2 + eyeR.x - pw / 2 + ox, -SPR_H + eyeR.y - pw / 2 + oy, pw, pw);
    }
    if (act) this.drawProp(g, act);
    g.restore();

    // particles in world space
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = p.color;
      g.font = '600 15px ui-rounded, sans-serif';
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
  }
}
