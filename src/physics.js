import Matter from 'matter-js';

const { Engine, Bodies, Body, Constraint, Composite } = Matter;

// Physics world sized in CSS pixels. The pet is a circle with rotation locked;
// walls keep it on-screen, the ceiling sits far above so throws can leave the top.
export function createPhysics(w, h, opts = {}) {
  const engine = Engine.create();
  engine.gravity.y = 1;

  const R = opts.radius ?? 36;
  const floorY = opts.floorY ?? h - 4;
  const left = opts.left ?? 0;
  const right = opts.right ?? w;
  const T = 400; // wall thickness

  const pet = Bodies.circle(left + (right - left) * 0.7, -80, R, {
    restitution: 0.35,
    friction: 0.9,
    frictionStatic: 1.2,
    frictionAir: 0.015,
    label: 'pet',
  });
  Body.setInertia(pet, Infinity);

  const cx = (left + right) / 2;
  const walls = [
    Bodies.rectangle(cx, floorY + T / 2, w * 4, T, { isStatic: true }),
    Bodies.rectangle(left - T / 2, h / 2 - h * 2, T, h * 8, { isStatic: true }),
    Bodies.rectangle(right + T / 2, h / 2 - h * 2, T, h * 8, { isStatic: true }),
    Bodies.rectangle(cx, -h * 3 - T / 2, w * 4, T, { isStatic: true }),
  ];
  Composite.add(engine.world, [pet, ...walls]);

  let dragC = null;
  let pinned = false;
  const baseMass = pet.mass;

  // "Ledge" = the top edge of the frontmost app window, as a one-way
  // platform: solid only while the pet is coming down onto it from above,
  // never when thrown from below or being dragged across it. Gated on the
  // previous frame's position — a falling pet covers tens of px per frame,
  // so checking the current overlap would let her tunnel straight through.
  let ledgeBody = null;
  let ledgeRect = null;
  let prevBottom = pet.position.y + R;

  const api = {
    engine,
    pet,
    R,
    floorY,
    step(dtMs) {
      if (ledgeBody) {
        const falling = pet.velocity.y >= -0.5;
        const wasAbove = prevBottom <= ledgeRect.y + 6;
        const canLand = !dragC && !pinned && falling && wasAbove;
        ledgeBody.collisionFilter.mask = canLand ? 0xffffffff : 0;
      }
      Engine.update(engine, Math.min(dtMs, 33));
      prevBottom = pet.position.y + R;
    },
    setLedge(rect) {
      const changed =
        !!rect !== !!ledgeRect ||
        (rect &&
          ledgeRect &&
          (Math.abs(rect.x - ledgeRect.x) > 1 ||
            Math.abs(rect.y - ledgeRect.y) > 1 ||
            Math.abs(rect.w - ledgeRect.w) > 1));
      if (!changed) return;
      if (ledgeBody) {
        Composite.remove(engine.world, ledgeBody);
        ledgeBody = null;
      }
      ledgeRect = rect ? { ...rect } : null;
      if (rect) {
        ledgeBody = Bodies.rectangle(rect.x + rect.w / 2, rect.y + 14, rect.w, 28, {
          isStatic: true,
          label: 'ledge',
        });
        Composite.add(engine.world, ledgeBody);
      }
    },
    getLedge: () => ledgeRect,
    grounded() {
      if (Math.abs(pet.velocity.y) >= 1.5) return false;
      const bottom = pet.position.y + R;
      if (bottom >= floorY - 3) return true;
      if (
        ledgeRect &&
        bottom >= ledgeRect.y - 6 &&
        bottom <= ledgeRect.y + 8 &&
        pet.position.x > ledgeRect.x - R / 2 &&
        pet.position.x < ledgeRect.x + ledgeRect.w + R / 2
      ) {
        return true;
      }
      return false;
    },
    startDrag(x, y) {
      api.endDrag();
      dragC = Constraint.create({
        pointA: { x, y },
        bodyB: pet,
        pointB: { x: 0, y: -R * 0.4 },
        stiffness: 0.12,
        damping: 0.08,
        length: 0,
      });
      Composite.add(engine.world, dragC);
    },
    moveDrag(x, y) {
      if (dragC) {
        dragC.pointA.x = x;
        dragC.pointA.y = y;
      }
    },
    endDrag() {
      if (dragC) {
        Composite.remove(engine.world, dragC);
        dragC = null;
      }
    },
    dragging: () => !!dragC,
    // Pinned: the pet stays exactly where the user placed her (static body,
    // no gravity) until she's grabbed again or explicitly let go.
    pin() {
      if (!pinned) {
        pinned = true;
        Body.setVelocity(pet, { x: 0, y: 0 });
        Body.setStatic(pet, true);
      }
    },
    unpin() {
      if (pinned) {
        pinned = false;
        Body.setStatic(pet, false);
        Body.setMass(pet, baseMass);
        Body.setInertia(pet, Infinity);
        Body.setVelocity(pet, { x: 0, y: 0 });
      }
    },
    isPinned: () => pinned,
    teleport(x, y) {
      Body.setPosition(pet, { x, y });
      Body.setVelocity(pet, { x: 0, y: 0 });
    },
    nudge(vx, vy) {
      Body.setVelocity(pet, {
        x: vx ?? pet.velocity.x,
        y: vy ?? pet.velocity.y,
      });
    },
    hop(power = 7) {
      if (api.grounded()) {
        Body.setVelocity(pet, { x: pet.velocity.x, y: -power });
      }
    },
  };
  return api;
}
