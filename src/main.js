import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from '@tauri-apps/plugin-autostart';
import { createPhysics } from './physics.js';
import { Pet, PETS, VARIANTS, SPECIES_INFO, LEGACY_IDS, petThumb } from './pet.js';
import { Reminders, fmtIn } from './reminders.js';
import { sfx, isMuted, setMuted } from './sound.js';

const win = getCurrentWindow();
const canvas = document.getElementById('stage');
const g = canvas.getContext('2d');
const bubbleEl = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const bubbleBtns = document.getElementById('bubble-btns');
const menuEl = document.getElementById('menu');

let W = 0;
let H = 0;
let scale = 1;
let winPos = { x: 0, y: 0 };
// Visible area (menu bar / Dock excluded) in window-local CSS px. macOS may
// also shift the window below the menu bar, so the window's bottom edge can
// sit below the physical screen — everything must clamp to this, not to H.
let view = { left: 0, top: 0, right: 0, bottom: 0 };
let phys, pet, reminders;

const cursor = { x: -1e4, y: -1e4 };
let lastCursorMoveAt = Date.now();
let interactive = false; // whether the window currently accepts mouse events

const storedSkin = localStorage.getItem('pet.skin');
let skinId = PETS[storedSkin] ? storedSkin : LEGACY_IDS[storedSkin] || 'cat.orange';
localStorage.setItem('pet.skin', skinId);

// Each pet keeps its own name; unnamed pets use their variant's default.
let petNames = {};
try {
  petNames = JSON.parse(localStorage.getItem('pet.names')) || {};
} catch {
  petNames = {};
}
const legacyName = localStorage.getItem('pet.name');
if (legacyName) {
  if (!petNames[skinId] && !Object.values(PETS).some((p) => p.name === legacyName)) {
    petNames[skinId] = legacyName;
  }
  localStorage.removeItem('pet.name');
  localStorage.setItem('pet.names', JSON.stringify(petNames));
}
const petName = () => petNames[skinId] || PETS[skinId].name;
const savePetNames = () => localStorage.setItem('pet.names', JSON.stringify(petNames));
let autostartOn = false;
let dragging = false;
let downAt = 0;
let downPos = null;
let menuOpen = false;
let menuAwayMs = 0;

// ---------- window / overlay setup ----------

async function setupWindow() {
  const mon = await primaryMonitor();
  if (!mon) throw new Error('no monitor found');
  scale = mon.scaleFactor || 1;
  await win.setPosition(new PhysicalPosition(mon.position.x, mon.position.y));
  await win.setSize(new PhysicalSize(mon.size.width, mon.size.height));
  winPos = { x: mon.position.x, y: mon.position.y };
  // Give the window manager a beat to settle (it may refuse the exact
  // position, e.g. push the window below the macOS menu bar), then read
  // where the window actually ended up.
  await new Promise((r) => setTimeout(r, 60));
  try {
    const p = await win.outerPosition();
    winPos = { x: p.x, y: p.y };
  } catch {
    /* keep monitor origin */
  }

  W = Math.round(mon.size.width / scale);
  H = Math.round(mon.size.height / scale);

  const wa = mon.workArea && mon.workArea.size ? mon.workArea : { position: mon.position, size: mon.size };
  view = {
    left: Math.max(0, (wa.position.x - winPos.x) / scale),
    top: Math.max(0, (wa.position.y - winPos.y) / scale),
    right: Math.min(W, (wa.position.x + wa.size.width - winPos.x) / scale),
    bottom: Math.min(H, (wa.position.y + wa.size.height - winPos.y) / scale),
  };
  const dpr = window.devicePixelRatio || scale;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  await win.setIgnoreCursorEvents(true);
  interactive = false;
}

// ---------- hit testing (what counts as "ours" vs click-through) ----------

function overPet(x, y) {
  const p = phys.pet.position;
  const r = phys.R + 16;
  const dx = x - p.x;
  const dy = y - p.y;
  return dx * dx + dy * dy < r * r;
}

function inRect(el, x, y, pad = 8) {
  const r = el.getBoundingClientRect();
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

function hitTest(x, y) {
  if (overPet(x, y)) return true;
  if (!bubbleEl.classList.contains('hidden') && inRect(bubbleEl, x, y)) return true;
  if (menuOpen && inRect(menuEl, x, y, 10)) return true;
  return false;
}

// ---------- global cursor poll: drives click-through + eye tracking ----------

async function pollLoop() {
  for (;;) {
    try {
      const [cx, cy] = await invoke('cursor_pos');
      const nx = (cx - winPos.x) / scale;
      const ny = (cy - winPos.y) / scale;
      if (Math.hypot(nx - cursor.x, ny - cursor.y) > 2) lastCursorMoveAt = Date.now();
      cursor.x = nx;
      cursor.y = ny;
      const want = dragging || hitTest(cursor.x, cursor.y);
      if (want !== interactive) {
        interactive = want;
        await win.setIgnoreCursorEvents(!want);
      }
    } catch {
      /* transient IPC errors are fine */
    }
    await new Promise((r) => setTimeout(r, 16));
  }
}

// ---------- mouse interaction (only fires while interactive) ----------

// Placement: release the pet gently anywhere above the floor and she stays
// pinned at that spot; throw her (fast release) or drop her near the floor
// and physics takes over. The pinned spot survives restarts.

function savePin() {
  const p = phys.pet.position;
  localStorage.setItem('pet.pin', JSON.stringify({ fx: p.x / W, fy: p.y / H }));
}

function clearPin() {
  localStorage.removeItem('pet.pin');
}

function restorePin() {
  let pin = null;
  try {
    pin = JSON.parse(localStorage.getItem('pet.pin'));
  } catch {
    pin = null;
  }
  if (pin && pin.fx >= 0 && pin.fx <= 1 && pin.fy >= 0 && pin.fy <= 1) {
    const x = Math.max(view.left + phys.R, Math.min(pin.fx * W, view.right - phys.R));
    const y = Math.max(view.top + phys.R, Math.min(pin.fy * H, view.bottom - phys.R));
    phys.teleport(x, y);
    phys.pin();
  }
}

let dragStarted = false; // physics drag engaged (vs. a click that may become one)

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (overPet(e.clientX, e.clientY)) {
    dragging = true;
    dragStarted = false;
    downAt = performance.now();
    downPos = { x: e.clientX, y: e.clientY };
    // A pinned pet is only unpinned once the pointer actually moves, so a
    // plain click (petting) never knocks her off her spot.
    if (!phys.isPinned()) {
      phys.startDrag(e.clientX, e.clientY);
      dragStarted = true;
    }
    e.preventDefault();
  }
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  if (!dragStarted) {
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (moved > 6) {
      phys.unpin();
      phys.startDrag(e.clientX, e.clientY);
      dragStarted = true;
    }
    return;
  }
  phys.moveDrag(e.clientX, e.clientY);
});

window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const dt = performance.now() - downAt;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  if (!dragStarted) {
    if (dt < 250 && moved < 6) pet.petted();
    return;
  }
  dragStarted = false;
  phys.endDrag();
  if (dt < 250 && moved < 6) {
    pet.petted();
    return;
  }
  const v = phys.pet.velocity;
  const speed = Math.hypot(v.x, v.y);
  const nearFloor = phys.pet.position.y + phys.R > phys.floorY - 70;
  if (speed < 4.5 && !nearFloor) {
    phys.pin();
    savePin();
  } else {
    clearPin();
  }
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (overPet(e.clientX, e.clientY)) openMenu();
});

// ---------- speech bubble ----------

const bubbleEmoji = document.getElementById('bubble-emoji');

function showBubble(text, buttons, emoji = '') {
  bubbleEmoji.textContent = emoji;
  bubbleEmoji.style.display = emoji ? '' : 'none';
  bubbleText.textContent = text;
  bubbleBtns.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.ghost) btn.className = 'ghost';
    btn.addEventListener('click', b.cb);
    bubbleBtns.appendChild(btn);
  }
  bubbleEl.classList.remove('hidden');
}

function hideBubble() {
  bubbleEl.classList.add('hidden');
}

function layoutBubble() {
  if (bubbleEl.classList.contains('hidden')) return;
  const p = phys.pet.position;
  const bw = bubbleEl.offsetWidth;
  const bh = bubbleEl.offsetHeight;
  const x = Math.max(view.left + 8, Math.min(p.x - bw / 2, view.right - bw - 8));
  let y = p.y - phys.R - bh - 20;
  let below = false;
  if (y < view.top + 8) {
    y = p.y + phys.R + 16;
    below = true;
  }
  bubbleEl.classList.toggle('below', below);
  bubbleEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

// ---------- right-click menu ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const ICONS = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
};

const EMOJIS = ['⏰', '💧', '👀', '🙆', '🧘', '☕', '💊', '🍎'];
const CHIP_MINS = [15, 30, 45, 60, 120];

let addOpen = false;
let selEmoji = '⏰';

function fmtEvery(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function renderMenu() {
  const rows = reminders.items
    .map(
      (r) => `
    <div class="rem ${r.enabled ? '' : 'off'}" data-id="${r.id}">
      <div class="rem-emoji">${r.emoji}</div>
      <div class="rem-main">
        <div class="rem-label" title="${esc(r.label)}">${esc(r.label)}</div>
        <div class="rem-sub">every ${fmtEvery(r.mins)}</div>
        <div class="rem-bar"><i></i></div>
      </div>
      <span class="rem-due"></span>
      <span class="rem-actions">
        <button class="icon" data-act="ring" title="Ring now">${ICONS.bell}</button>
        <button class="icon danger" data-act="del" title="Delete">${ICONS.trash}</button>
      </span>
      <button class="switch ${r.enabled ? 'on' : ''}" data-act="toggle" title="${r.enabled ? 'Pause' : 'Resume'}"></button>
    </div>`
    )
    .join('');

  const addForm = addOpen
    ? `
    <div class="add-form">
      <div class="emoji-row">${EMOJIS.map(
        (e) => `<button class="emoji-btn ${e === selEmoji ? 'sel' : ''}" data-act="emoji" data-emoji="${e}">${e}</button>`
      ).join('')}</div>
      <input type="text" id="add-label" placeholder="Remind me to…" maxlength="60" autocomplete="off" />
      <div class="mins-row">
        ${CHIP_MINS.map(
          (m) => `<button class="chip ${m === 30 ? 'sel' : ''}" data-act="chip" data-mins="${m}">${m < 60 ? m + 'm' : m / 60 + 'h'}</button>`
        ).join('')}
        <input type="number" id="add-mins" min="1" max="1440" value="30" />
        <span class="unit">min</span>
      </div>
      <div class="add-actions">
        <button data-act="add">Add reminder</button>
        <button class="ghost" data-act="cancel-add">Cancel</button>
      </div>
    </div>`
    : '<button class="add-open" data-act="open-add">＋ New reminder</button>';

  menuEl.innerHTML = `
    <div class="m-head">
      <div>
        <div class="m-title">🐾 ${esc(petName())}</div>
        <div class="m-sub">your gentle reminders</div>
      </div>
      <button class="icon" data-act="close" title="Close">${ICONS.x}</button>
    </div>
    <div class="rem-list">${rows || '<div class="empty">No reminders yet — add one below 🐾</div>'}</div>
    ${addForm}
    <div class="pet-sec">
      <input type="text" id="pet-name" value="${esc(petName())}" maxlength="14" title="Pet name" />
      <div class="skin-dots">
        ${SPECIES_INFO.map((s) => {
          const cur = PETS[skinId].species === s.id;
          const rep = cur ? skinId : `${s.id}.${VARIANTS[s.id][0].id}`;
          return `<button class="dot ${cur ? 'sel' : ''}" data-act="species" data-species="${s.id}" title="${s.label}"><img src="${petThumb(rep)}" alt="${s.label}" /></button>`;
        }).join('')}
      </div>
      <div class="variant-dots">
        ${VARIANTS[PETS[skinId].species]
          .map((v) => {
            const id = `${PETS[skinId].species}.${v.id}`;
            return `<button class="vdot ${id === skinId ? 'sel' : ''}" data-act="skin" data-skin="${id}" style="background:${v.pal.o}" title="${v.name}"></button>`;
          })
          .join('')}
      </div>
    </div>
    <div class="set-row"><span>🔊 Sounds</span><button class="switch ${isMuted() ? '' : 'on'}" data-act="mute"></button></div>
    <div class="set-row"><span>🚀 Launch at login</span><button class="switch ${autostartOn ? 'on' : ''}" data-act="autostart"></button></div>
    <div class="foot">
      ${phys.isPinned() ? '<button class="ghost" data-act="drop">🍃 Let go</button>' : '<button class="ghost" data-act="nap">💤 Nap</button>'}
      <button class="ghost quit" data-act="quit">Quit</button>
    </div>`;
  updateMenuTimes();
}

// Refreshes countdown pills and progress bars in place, so open inputs and
// hover states are never clobbered by a full re-render.
function updateMenuTimes() {
  const now = Date.now();
  for (const el of menuEl.querySelectorAll('.rem')) {
    const r = reminders.items.find((x) => x.id === el.dataset.id);
    if (!r) continue;
    const rem = r.nextAt - now;
    const due = el.querySelector('.rem-due');
    due.textContent = r.enabled ? fmtIn(rem) : 'paused';
    due.classList.toggle('now', r.enabled && rem <= 0);
    const bar = el.querySelector('.rem-bar i');
    bar.style.width =
      (r.enabled ? Math.max(0, Math.min(100, 100 * (1 - rem / (r.mins * 60e3)))) : 0) + '%';
  }
}

function applySkin(id) {
  if (!PETS[id] || id === skinId) return;
  skinId = id;
  localStorage.setItem('pet.skin', id);
  pet.setSkin(id);
  renderMenu();
}

function doAdd() {
  const labelInput = menuEl.querySelector('#add-label');
  if (!labelInput) return;
  const label = labelInput.value.trim();
  const mins = parseInt(menuEl.querySelector('#add-mins').value, 10);
  if (!label) {
    labelInput.classList.add('err');
    labelInput.focus();
    setTimeout(() => labelInput.classList.remove('err'), 900);
    return;
  }
  reminders.add(label, mins, selEmoji);
  addOpen = false;
  renderMenu();
}

menuEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.closest('[data-id]')?.dataset.id;
  if (act === 'ring' && id) {
    reminders.ringNow(id);
    reminders.tick(Date.now());
    closeMenu();
  } else if (act === 'toggle' && id) {
    reminders.toggle(id);
    renderMenu();
  } else if (act === 'del' && id) {
    reminders.remove(id);
    renderMenu();
  } else if (act === 'open-add') {
    addOpen = true;
    renderMenu();
    menuEl.querySelector('#add-label')?.focus();
  } else if (act === 'cancel-add') {
    addOpen = false;
    renderMenu();
  } else if (act === 'emoji') {
    selEmoji = btn.dataset.emoji;
    for (const b of menuEl.querySelectorAll('.emoji-btn')) {
      b.classList.toggle('sel', b.dataset.emoji === selEmoji);
    }
  } else if (act === 'chip') {
    menuEl.querySelector('#add-mins').value = btn.dataset.mins;
    for (const b of menuEl.querySelectorAll('.chip')) {
      b.classList.toggle('sel', b === btn);
    }
  } else if (act === 'add') {
    doAdd();
  } else if (act === 'skin') {
    applySkin(btn.dataset.skin);
  } else if (act === 'species') {
    const sp = btn.dataset.species;
    if (PETS[skinId].species !== sp) applySkin(`${sp}.${VARIANTS[sp][0].id}`);
  } else if (act === 'mute') {
    setMuted(!isMuted());
    if (!isMuted()) sfx.ding();
    renderMenu();
  } else if (act === 'autostart') {
    (autostartOn ? autostartDisable() : autostartEnable())
      .then(() => autostartIsEnabled())
      .then((v) => {
        autostartOn = v;
        renderMenu();
      })
      .catch((err) => console.error('autostart toggle failed:', err));
  } else if (act === 'nap') {
    pet.forceSleep();
    closeMenu();
  } else if (act === 'drop') {
    phys.unpin();
    clearPin();
    closeMenu();
  } else if (act === 'close') {
    closeMenu();
  } else if (act === 'quit') {
    win.close();
  }
});

menuEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target.id === 'add-label' || e.target.id === 'add-mins')) doAdd();
  if (e.key === 'Enter' && e.target.id === 'pet-name') e.target.blur();
});

menuEl.addEventListener('change', (e) => {
  if (e.target.id !== 'pet-name') return;
  const v = e.target.value.trim().slice(0, 14);
  // Custom names are stored per pet; clearing the field (or typing the
  // default) reverts this pet to its default name.
  if (v && v !== PETS[skinId].name) petNames[skinId] = v;
  else delete petNames[skinId];
  savePetNames();
  e.target.value = petName();
  const title = menuEl.querySelector('.m-title');
  if (title) title.textContent = `🐾 ${petName()}`;
});

const menuAnchor = { x: 0, y: 0 };

// Clamp the menu to the screen from its anchor point. Re-run whenever the
// menu grows or shrinks (e.g. the add-reminder form expanding) so it never
// extends past the bottom edge.
function positionMenu() {
  const mw = menuEl.offsetWidth || 296;
  const mh = menuEl.offsetHeight || 280;
  const x = Math.max(view.left + 8, Math.min(menuAnchor.x, view.right - mw - 8));
  const y = Math.max(view.top + 8, Math.min(menuAnchor.y, view.bottom - mh - 8));
  menuEl.style.left = Math.round(x) + 'px';
  menuEl.style.top = Math.round(y) + 'px';
}

new ResizeObserver(() => {
  if (menuOpen) positionMenu();
}).observe(menuEl);

function openMenu() {
  menuOpen = true;
  menuAwayMs = 0;
  addOpen = false;
  renderMenu();
  menuEl.classList.remove('hidden');
  const p = phys.pet.position;
  menuAnchor.x = p.x + phys.R + 14;
  menuAnchor.y = p.y - (menuEl.offsetHeight || 280) / 2;
  positionMenu();
  win.setFocus().catch(() => {});
}

function closeMenu() {
  menuOpen = false;
  menuEl.classList.add('hidden');
}

// ---------- reminders wiring ----------

function onDue(r) {
  pet.setAlert(true);
  sfx.chirp();
  showBubble(r.label, [
    {
      label: 'Done ✓',
      cb() {
        reminders.done();
        pet.setAlert(false);
        hideBubble();
        pet.celebrate();
        sfx.ding();
      },
    },
    {
      label: 'Snooze 5m',
      ghost: true,
      cb() {
        reminders.snooze(5);
        pet.setAlert(false);
        hideBubble();
      },
    },
  ], r.emoji);
}

function maybeWelcome() {
  if (localStorage.getItem('pet.welcomed')) return;
  setTimeout(() => {
    showBubble(`Hi! I'm ${petName()} — drag me around, toss me, pet me. Right-click me to set up reminders.`, [
      {
        label: `Hi ${petName()}!`,
        cb() {
          localStorage.setItem('pet.welcomed', '1');
          hideBubble();
          pet.celebrate();
        },
      },
    ], '🐾');
  }, 6000);
}

// ---------- main loop ----------

let last = performance.now();
let lastTick = 0;

function frame(now) {
  const dt = now - last;
  last = now;

  phys.step(dt);
  pet.update(dt / 1000, {
    cursor,
    dragging,
    pinned: phys.isPinned(),
    cursorIdleMs: Date.now() - lastCursorMoveAt,
  });

  if (now - lastTick > 1000) {
    lastTick = now;
    reminders.tick(Date.now());
    if (menuOpen) updateMenuTimes();
  }

  // auto-close the menu when the cursor wanders far away for a while
  if (menuOpen) {
    if (!inRect(menuEl, cursor.x, cursor.y, 80) && !overPet(cursor.x, cursor.y)) {
      menuAwayMs += dt;
      if (menuAwayMs > 2000) closeMenu();
    } else {
      menuAwayMs = 0;
    }
  }

  g.clearRect(0, 0, W, H);
  pet.draw(g);
  layoutBubble();
  requestAnimationFrame(frame);
}

(async () => {
  await setupWindow();
  phys = createPhysics(W, H, {
    floorY: view.bottom - 4,
    left: view.left,
    right: view.right,
  });
  pet = new Pet(phys, { W: view.right, H: view.bottom, left: view.left }, skinId);
  restorePin();
  reminders = new Reminders(onDue);
  autostartIsEnabled()
    .then((v) => (autostartOn = v))
    .catch(() => {});
  pollLoop();
  requestAnimationFrame(frame);
  maybeWelcome();
})().catch((err) => console.error('pet boot failed:', err));
