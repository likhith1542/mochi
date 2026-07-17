# Mochi 🐾

[![CI](https://github.com/likhith1542/mochi/actions/workflows/ci.yml/badge.svg)](https://github.com/likhith1542/mochi/actions/workflows/ci.yml)

A desktop pet that lives on top of your screen — and nudges you with gentle reminders (drink water, rest your eyes, stretch). Pick from 21 pets across 5 species: cats, puppies, bunnies, birds, and ghosts.

## Install

Grab the build for your OS from [Releases](https://github.com/likhith1542/mochi/releases):

- **macOS** — `.dmg` (universal: Apple Silicon + Intel). Unsigned build: right-click `Mochi.app` → **Open** → **Open**, or run `xattr -cr /Applications/Mochi.app`.
- **Windows** — `.msi` or `-setup.exe`. SmartScreen may warn: **More info** → **Run anyway**.
- **Linux** — `.AppImage` (`chmod +x`, then run), `.deb`, or `.rpm`. Window transparency requires a compositor.

## Releasing

CI builds and attaches installers for all three platforms whenever a `v*` tag is pushed:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

This creates a **draft** release with all artifacts — review it, then publish.

- **Transparent full-screen overlay** that never blocks your work: clicks pass through everywhere except on the pet itself (per-pixel-style hit testing driven by a global cursor poll).
- **Real physics** (Matter.js): gravity, bounce, walking, and drag-to-throw. Pick her up, toss her, she lands with a squash.
- **Reminders**: water, eye breaks, stretching by default — add your own with any interval. She hops and shows a speech bubble when one is due.

## Interactions

| Action | Result |
| --- | --- |
| Click the pet briefly | Pet her (hearts!) |
| Drag & release gently | She stays pinned right where you placed her (survives restarts) |
| Drag & release fast (throw) | Physics takes over — she flies, falls, and bounces |
| Right-click → 🍃 Let go | Unpin her so she falls back to the floor |
| Right-click her | Reminder menu: ring now, pause, delete, add new, nap, quit |
| Reminder due | She hops with a speech bubble (and a soft chirp) — **Done ✓** or **Snooze 5m** |
| Drop her onto your focused window | She sits on its top edge, walks along it, falls off the end (toggle: 🪟 Sit on windows) |
| One-shot reminders | Add form → **⏱ Once**: "remind me in N minutes", fires once, deletes itself |
| Calendar sync | Menu → **📅 Sync with calendar**: paste your Google/Apple private iCal link; she alerts you 2–15 min before each event. Syncs every 5 min, on menu open, and via the 🔄 button |
| Leave your cursor still | She sometimes wanders over to sit next to it |
| Rename / swap pets | Right-click → name field, species picker (cat, puppy, bunny, bird, ghost), and color variants per species — 21 pets in all, each with its own default name |
| Sounds & launch at login | Toggles in the right-click menu |

## Dev

```sh
npm install
npm run tauri dev
```

## Build

```sh
npm run tauri build
```

## Stack

- [Tauri 2](https://tauri.app) — transparent, always-on-top, click-through overlay window (`macOSPrivateApi` enabled for transparency on macOS; no Dock icon via `ActivationPolicy::Accessory`).
- [Matter.js](https://brm.io/matter-js/) — 2D physics (gravity, drag constraint, throw).
- Vanilla JS + canvas — pixel-art sprite frames generated from string grids in [src/pet.js](src/pet.js).

The one non-obvious mechanism: the window covers the whole screen but starts with `setIgnoreCursorEvents(true)`. A Rust command reports the global cursor position ~60×/s; when the cursor is over the pet (or an open bubble/menu), the frontend flips ignore off so it can be clicked/dragged — everywhere else, your clicks go straight through to the apps underneath.
