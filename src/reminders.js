const LS_KEY = 'pet.reminders.v1';

const DEFAULTS = [
  { id: 'water', emoji: '💧', label: 'Time for a sip of water', mins: 60, enabled: true, anim: 'drink' },
  { id: 'eyes', emoji: '👀', label: '20-20-20: look at something far away', mins: 20, enabled: true, anim: 'stand' },
  { id: 'stretch', emoji: '🙆', label: 'Stand up and stretch a bit', mins: 45, enabled: true, anim: 'stand' },
];

// anim values: '' = use the global default, 'none' = no animation,
// otherwise an id from ANIMS in pet.js.
const DEFAULT_ANIMS = { water: 'drink', eyes: 'stand', stretch: 'stand' };

export class Reminders {
  constructor(onDue) {
    this.onDue = onDue;
    this.active = null;
    let items = null;
    try {
      items = JSON.parse(localStorage.getItem(LS_KEY));
    } catch {
      items = null;
    }
    if (!Array.isArray(items) || items.length === 0) {
      const now = Date.now();
      items = DEFAULTS.map((d) => ({ ...d, nextAt: now + d.mins * 60e3 }));
    }
    for (const r of items) {
      if (r.anim === undefined) r.anim = DEFAULT_ANIMS[r.id] ?? '';
    }
    this.items = items;
    this.save();
  }

  setAnim(id, anim) {
    const r = this.items.find((r) => r.id === id);
    if (r) {
      r.anim = anim;
      this.save();
    }
  }

  save() {
    localStorage.setItem(LS_KEY, JSON.stringify(this.items));
  }

  tick(now) {
    if (this.active) return;
    const due = this.items
      .filter((r) => r.enabled && now >= r.nextAt)
      .sort((a, b) => a.nextAt - b.nextAt)[0];
    if (due) {
      this.active = due;
      this.onDue(due);
    }
  }

  done() {
    if (!this.active) return;
    if (this.active.once) {
      // one-shot reminders disappear once completed
      this.items = this.items.filter((r) => r.id !== this.active.id);
    } else {
      this.active.nextAt = Date.now() + this.active.mins * 60e3;
    }
    this.active = null;
    this.save();
  }

  snooze(mins = 5) {
    if (!this.active) return;
    this.active.nextAt = Date.now() + mins * 60e3;
    this.active = null;
    this.save();
  }

  ringNow(id) {
    const r = this.items.find((r) => r.id === id);
    if (r) {
      r.enabled = true;
      r.nextAt = Date.now();
      this.save();
    }
  }

  toggle(id) {
    const r = this.items.find((r) => r.id === id);
    if (!r) return;
    r.enabled = !r.enabled;
    if (r.enabled) r.nextAt = Date.now() + r.mins * 60e3;
    if (this.active && this.active.id === id && !r.enabled) this.active = null;
    this.save();
  }

  add(label, mins, emoji = '⏰', once = false, anim = '') {
    mins = Math.max(1, Math.floor(mins) || 30);
    this.items.push({
      id: 'r' + Date.now().toString(36),
      emoji,
      label,
      mins,
      once,
      anim,
      enabled: true,
      nextAt: Date.now() + mins * 60e3,
    });
    this.save();
  }

  remove(id) {
    this.items = this.items.filter((r) => r.id !== id);
    if (this.active && this.active.id === id) this.active = null;
    this.save();
  }
}

export function fmtIn(ms) {
  if (ms <= 0) return 'now';
  const m = Math.ceil(ms / 60e3);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  return `in ${h}h ${m % 60}m`;
}
