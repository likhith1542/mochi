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

  const api = {
    engine,
    pet,
    R,
    floorY,
    step(dtMs) {
      Engine.update(engine, Math.min(dtMs, 33));
    },
    grounded() {
      return pet.position.y + R >= floorY - 3 && Math.abs(pet.velocity.y) < 1.5;
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
