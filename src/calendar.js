// Calendar sync via a private ICS feed URL (Google's "secret address in
// iCal format" or an iCloud public-calendar link). Fetched through Rust
// (CORS blocks the webview), parsed with ical.js, recurring events expanded.

import ICAL from 'ical.js';
import { invoke } from '@tauri-apps/api/core';

const CFG_KEY = 'pet.cal.cfg';
const ALERTED_KEY = 'pet.cal.alerted';
const SYNC_EVERY = 5 * 60e3;
const HORIZON = 36 * 3600e3;

function parseICS(text) {
  const comp = new ICAL.Component(ICAL.parse(text));
  for (const vtz of comp.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(vtz);
    } catch {
      /* duplicate registration */
    }
  }
  const now = Date.now();
  const past = now - 3600e3;
  const horizon = now + HORIZON;
  const out = [];
  for (const ve of comp.getAllSubcomponents('vevent')) {
    try {
      const ev = new ICAL.Event(ve);
      if (!ev.startDate) continue;
      const summary = ev.summary || 'Event';
      if (ev.isRecurring()) {
        // NOTE: iterator(startTime) would *re-anchor* DTSTART to startTime,
        // shifting occurrence clock times — iterate from the real DTSTART
        // and skip occurrences that are already past.
        const it = ev.iterator();
        let t;
        let guard = 0;
        let pushed = 0;
        while ((t = it.next()) && guard++ < 5000 && pushed < 50) {
          const ms = t.toJSDate().getTime();
          if (ms > horizon) break;
          if (ms < past) continue;
          out.push({ id: `${ev.uid}:${ms}`, start: ms, summary, allDay: t.isDate });
          pushed++;
        }
      } else {
        const ms = ev.startDate.toJSDate().getTime();
        if (ms >= past && ms <= horizon) {
          out.push({ id: `${ev.uid}:${ms}`, start: ms, summary, allDay: ev.startDate.isDate });
        }
      }
    } catch {
      /* skip malformed events */
    }
  }
  // all-day events have no meaningful "starts in N minutes" moment
  return out.filter((e) => !e.allDay).sort((a, b) => a.start - b.start);
}

export class CalendarSync {
  constructor() {
    try {
      this.cfg = JSON.parse(localStorage.getItem(CFG_KEY));
    } catch {
      this.cfg = null;
    }
    try {
      this.alerted = JSON.parse(localStorage.getItem(ALERTED_KEY)) || {};
    } catch {
      this.alerted = {};
    }
    this.events = [];
    this.lastSync = 0;
    this.error = null;
  }

  configured() {
    return !!(this.cfg && this.cfg.url);
  }

  lead() {
    return (this.cfg && this.cfg.lead) || 5;
  }

  provider() {
    return (this.cfg && this.cfg.provider) || 'google';
  }

  setConfig(url, provider, lead) {
    this.cfg = { url: url.trim(), provider, lead };
    localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg));
    this.events = [];
    this.lastSync = 0;
    this.error = null;
  }

  disconnect() {
    this.cfg = null;
    localStorage.removeItem(CFG_KEY);
    this.events = [];
    this.error = null;
  }

  // Re-fetch unless the last sync is younger than maxAge ms.
  // sync() = background cadence; sync(30e3) = menu-open freshness; sync(0) = force.
  async sync(maxAge = SYNC_EVERY) {
    if (!this.configured()) return;
    const now = Date.now();
    if (now - this.lastSync < maxAge) return;
    this.lastSync = now;
    try {
      const text = await invoke('fetch_ics', { url: this.cfg.url });
      this.events = parseICS(text);
      this.error = null;
    } catch (e) {
      this.error = String(e);
    }
  }

  next() {
    const now = Date.now();
    return this.events.find((e) => e.start > now) || null;
  }

  // events whose lead-time alert is due and not yet shown
  due(now) {
    const leadMs = this.lead() * 60e3;
    return this.events.filter(
      (e) => !this.alerted[e.id] && now >= e.start - leadMs && now < e.start + 60e3
    );
  }

  markAlerted(id) {
    this.alerted[id] = Date.now();
    const cutoff = Date.now() - 48 * 3600e3;
    for (const k of Object.keys(this.alerted)) {
      if (this.alerted[k] < cutoff) delete this.alerted[k];
    }
    localStorage.setItem(ALERTED_KEY, JSON.stringify(this.alerted));
  }
}
