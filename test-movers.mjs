// test-movers.mjs — self-check for the moving-obstacle system + new holes.
// Run from the repo root:  node test-movers.mjs
import { COURSES, HOLE_COUNT, moverSegments } from "./courses.js";
import { buildWorld, addCourse, makeBall, shoot, stepWorld, moverKick, inRect, R } from "./physics.js";

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; } else { fail++; console.error("  FAIL:", msg); } };

// 1) moverSegments is deterministic (peers must agree from the same t)
{
  const m = { type: "rotor", x: 1, z: 2, arms: 3, len: 3, speed: 1.4 };
  const a = JSON.stringify(moverSegments(m, 9.87)), b = JSON.stringify(moverSegments(m, 9.87));
  ok(a === b, "moverSegments deterministic");
  ok(moverSegments(m, 9.87).length === 3, "rotor -> one segment per arm");
}

// 2) a spinning rotor arm actually whacks a RESTING ball (the core "gimmick")
{
  const world = buildWorld();
  const ball = makeBall(world, 2, 0.5);           // sits just off a horizontal arm
  ball.velocity.setZero(); ball.angularVelocity.setZero();
  const m = { type: "rotor", x: 0, z: 0, arms: 1, len: 3, r: 0.3, speed: 2, phase: 0, y: 0.7 };
  moverKick(ball, m, 0);                            // arm along +X, sweeping toward +Z
  ok(ball.velocity.z > 3, `rotor knocks resting ball (got vz=${ball.velocity.z.toFixed(2)})`);
  ok(Number.isFinite(ball.velocity.z), "knock stays finite");
}

// 3) a ball clear of the mover is untouched
{
  const world = buildWorld();
  const ball = makeBall(world, 8, 8); ball.velocity.setZero();
  moverKick(ball, { type: "rotor", x: 0, z: 0, arms: 3, len: 3, r: 0.3, speed: 2, y: 0.7 }, 0);
  ok(ball.velocity.length() === 0, "no phantom kick when far away");
}

// 4) every hole is well-formed and playable-on-paper
for (const c of COURSES) {
  const [W, L] = c.bounds, hw = W / 2, hl = L / 2;
  ok(Math.abs(c.tee[0]) <= hw && Math.abs(c.tee[1]) <= hl, `${c.id} tee in bounds`);
  ok(Math.abs(c.cup[0]) <= hw && Math.abs(c.cup[1]) <= hl, `${c.id} cup in bounds`);
  for (const w of c.water || []) ok(!inRect(c.cup[0], c.cup[1], w), `${c.id} cup not drowned in water`);
  for (const m of c.movers || []) {
    const cx = m.type === "orbiter" ? m.cx : m.x, cz = m.type === "orbiter" ? m.cz : m.z;
    ok(Math.abs(cx) <= hw && Math.abs(cz) <= hl, `${c.id} mover hub in bounds`);
    ok(Math.hypot(cx - c.tee[0], cz - c.tee[1]) > 1.2, `${c.id} mover not on the tee`);
  }
}

// 5) integration smoke: a full-power shot through a mover hole never NaNs / explodes
{
  const h12 = COURSES.find(c => c.id === "h12");
  const world = buildWorld();
  const meta = addCourse(world, h12);
  const ball = makeBall(world, h12.tee[0], h12.tee[1]);
  shoot(ball, h12.cup[0] - h12.tee[0], h12.cup[1] - h12.tee[1], 30);
  let finite = true;
  for (let i = 0; i < 400; i++) {
    stepWorld(world, ball, meta, 1 / 120);
    if (![ball.position.x, ball.position.y, ball.position.z].every(Number.isFinite)) { finite = false; break; }
  }
  ok(finite, "h12 sim stays finite through the rotor");
  ok(Math.abs(ball.position.x) < 40 && Math.abs(ball.position.z) < 60, "ball stays on the map");
}

console.log(`\nmovers: ${pass} passed, ${fail} failed  (holes=${HOLE_COUNT})`);
process.exit(fail ? 1 : 0);
