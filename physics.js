// physics.js — cannon-es simulation for Cholf 3D.
// Node-importable (no DOM/three). The renderer builds matching meshes from the
// same course spec in courses.js; only the ball(s) sync from bodies each frame.
//
// Rigid bodies: floors + ramps (green, ramps tilted so they truly launch the
// ball) and walls/rails (bouncy). Bumpers, sand, water, out-of-bounds and the
// cup are handled as tuned zones in stepWorld/classify — deterministic, easy to
// feel-tune, and free of cannon's cylinder/coplanar edge cases.

import * as CANNON from "cannon-es";
import { moverSegments } from "./courses.js";

export const R = 0.36;              // ball radius
export const MAX_SHOT = 30;         // full-power launch speed (u/s) — faster ball for ramps
export const MIN_SHOT = 2.0;        // below this a drag is a cancel
const G = 24;                       // gravity (snappy arcade)
const BASE_DAMP = 0.02;             // near-zero; GREEN_DECEL does the real work (cannon needs <1!)
const GREEN_DECEL = 7;              // constant rolling friction on green (u/s^2) -> crisp finite stop
const SAND_DECEL = 30;              // sand grabs and stops the ball fast
const STOP_SPEED = 0.35;            // at/below this the ball parks
const ANG_DAMP = 0.5;
const CUP_R = 0.52;                 // capture radius
const CUP_SPEED = 3.6;              // must be slower than this to drop
const REST = 0.4;                   // below this the ball is "stopped"
const FALL_Y = -4;                  // fell off the world
const WATER_Y = 0.6;                // low enough to count as "in the drink"
const BUMP_REST = 0.92;             // bumper liveliness
const FT = 1.2;                     // floor thickness
const WH = 1.3;                     // wall height
const PT = 0.6;                     // perimeter rail thickness
const deg = d => (d * Math.PI) / 180;

export function buildWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.defaultContactMaterial.friction = 0.3;
  world.defaultContactMaterial.restitution = 0.2;

  const ball = new CANNON.Material("ball");
  const green = new CANNON.Material("green");
  const rail = new CANNON.Material("rail");
  world.addContactMaterial(new CANNON.ContactMaterial(ball, green, { friction: 0.05, restitution: 0.12 }));
  world.addContactMaterial(new CANNON.ContactMaterial(ball, rail, { friction: 0.04, restitution: 0.72 }));
  world.mats = { ball, green, rail };
  return world;
}

function boxBody(world, mat, x, y, z, hx, hy, hz, tilt) {
  const b = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
  b.position.set(x, y, z);
  if (tilt) b.quaternion.setFromEuler(tilt.x || 0, tilt.y || 0, tilt.z || 0);
  world.addBody(b);
  return b;
}

// Build all static bodies + hazard zones for a hole. Returns meta the game loop
// and renderer use. Ramp tilt convention: positive `deg` in the course data =
// surface rises toward +Z (so a ball travelling +Z is launched up and forward).
export function addCourse(world, c) {
  const [W, L] = c.bounds;
  const { green, rail } = world.mats;
  const bodies = [];
  const pieces = [];   // {cx,cz,w,l,y0,y1,axis} -> drives floorTopAt (elevation)

  // flat floor whose TOP surface sits at height h (default ground, h=0)
  const addFlat = (x, z, w, l, h = 0) => {
    bodies.push(boxBody(world, green, x, h - FT / 2, z, w / 2, FT / 2, l / 2));
    pieces.push({ cx: x, cz: z, w, l, y0: h, y1: h, axis: "z" });
  };
  // ramp: real tilted board, top rising from y0 (low edge) to y1 (high edge)
  // along `axis` ('z' rises toward +Z, 'x' rises toward +X). Ball climbs it for real.
  const addRamp = (x, z, w, l, y0, y1, axis = "z") => {
    const span = axis === "x" ? w : l;
    const th = Math.atan2(y1 - y0, span);
    const tilt = axis === "x" ? { z: th } : { x: -th };
    const bx = axis === "x" ? span / Math.cos(th) : w;
    const bz = axis === "x" ? l : span / Math.cos(th);
    // drop the center by (FT/2)cosθ so the TOP face interpolates y0..y1 exactly
    // (a thick tilted board otherwise leaves a lip at the seam with flat floors)
    const cy = (y0 + y1) / 2 - (FT / 2) * Math.cos(th);
    bodies.push(boxBody(world, green, x, cy, z, bx / 2, FT / 2, bz / 2, tilt));
    pieces.push({ cx: x, cz: z, w, l, y0, y1, axis });
  };
  if (c.floors) c.floors.forEach(f => addFlat(...f));
  else addFlat(0, 0, W, L);
  if (c.causeway) c.causeway.forEach(f => addFlat(...f));
  if (c.ramps) c.ramps.forEach(r => addRamp(...r));

  // internal walls (optional 5th arg = height)
  if (c.walls) c.walls.forEach(([x, z, w, l, h = WH]) => bodies.push(boxBody(world, rail, x, h / 2, z, w / 2, h / 2, l / 2)));
  // perimeter rails (sealed corners)
  if (c.perimeter !== false) {
    bodies.push(boxBody(world, rail, 0,  WH / 2,  L / 2, W / 2, WH / 2, PT / 2));
    bodies.push(boxBody(world, rail, 0,  WH / 2, -L / 2, W / 2, WH / 2, PT / 2));
    bodies.push(boxBody(world, rail,  W / 2, WH / 2, 0, PT / 2, WH / 2, L / 2));
    bodies.push(boxBody(world, rail, -W / 2, WH / 2, 0, PT / 2, WH / 2, L / 2));
  }

  // height of the highest floor surface under (x,z), or null over a gap
  const floorTopAt = (x, z) => {
    let top = null;
    for (const p of pieces) {
      if (Math.abs(x - p.cx) > p.w / 2 || Math.abs(z - p.cz) > p.l / 2) continue;
      let h;
      if (p.y0 === p.y1) h = p.y0;
      else {
        const span = p.axis === "x" ? p.w : p.l;
        const along = p.axis === "x" ? (x - (p.cx - p.w / 2)) : (z - (p.cz - p.l / 2));
        h = p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, along / span));
      }
      if (top === null || h > top) top = h;
    }
    return top;
  };

  return {
    bodies,
    floorTopAt,
    cup: { x: c.cup[0], z: c.cup[1], y: c.cup[2] || 0 },
    tee: { x: c.tee[0], z: c.tee[1] },
    bumpers: c.bumpers || [],
    sand: c.sand || [],
    water: c.water || [],
    boosters: c.boosters || [],
    launchers: c.launchers || [],
    movers: c.movers || [],
    causeways: c.causeway || [],
    wells: c.wells || [],
    bounds: [W, L],
  };
}

export function removeCourse(world, meta) {
  if (meta && meta.bodies) meta.bodies.forEach(b => world.removeBody(b));
}

export function makeBall(world, x, z) {
  const b = new CANNON.Body({
    mass: 1, material: world.mats.ball, shape: new CANNON.Sphere(R),
    linearDamping: BASE_DAMP, angularDamping: ANG_DAMP,
  });
  // ponytail: sleeping is redundant here — stepWorld hard-zeroes velocity to park the
  // ball, and cannon's wakeUp is unreliable on a cached static contact (shots got
  // silently ignored ~12% of the time). Never sleeping = the shot always lands.
  b.allowSleep = false;
  b.position.set(x, R + 0.02, z);
  world.addBody(b);
  return b;
}

export function placeBall(ball, x, z) {
  ball.position.set(x, R + 0.02, z);
  ball.velocity.setZero();
  ball.angularVelocity.setZero();
  ball.wakeUp();
}

export function shoot(ball, dirx, dirz, power) {
  const m = Math.hypot(dirx, dirz) || 1;
  const p = Math.max(0, Math.min(MAX_SHOT, power));
  ball.wakeUp();
  const vx = (dirx / m) * p, vz = (dirz / m) * p;
  ball.velocity.set(vx, 0, vz);
  // pre-spin to the rolling rate so cannon doesn't burn ~40% of the shot
  // converting slide->roll (that transient was the "speed feels wrong" loss).
  ball.angularVelocity.set(vz / R, 0, -vx / R);
}

export const speed = ball => ball.velocity.length();

export function inRect(x, z, [cx, cz, w, l]) {
  return Math.abs(x - cx) <= w / 2 && Math.abs(z - cz) <= l / 2;
}
const inAny = (x, z, rects) => rects.some(r => inRect(x, z, r));

function bumperKick(ball, [bx, bz, br]) {
  const dx = ball.position.x - bx, dz = ball.position.z - bz;
  const d = Math.hypot(dx, dz), rr = br + R;
  if (d >= rr || d < 1e-4) return false;
  const nx = dx / d, nz = dz / d;
  const vn = ball.velocity.x * nx + ball.velocity.z * nz;
  if (vn < 0) {
    ball.velocity.x -= (1 + BUMP_REST) * vn * nx;
    ball.velocity.z -= (1 + BUMP_REST) * vn * nz;
    ball.wakeUp();
  }
  const push = rr - d + 0.002;
  ball.position.x += nx * push;
  ball.position.z += nz * push;
  return true;
}

// Moving-obstacle collision. Each mover is one or more capsule segments (see
// moverSegments). We reflect the ball's velocity RELATIVE to the segment's own
// surface velocity, so a fast blade actually whacks a resting ball. Surface
// velocity comes from sampling the same material point a tiny step later.
const MOVER_EPS = 0.008;
function closestOnSeg(px, pz, s) {
  const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz;
  let u = L2 > 1e-9 ? ((px - s.ax) * dx + (pz - s.az) * dz) / L2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return { u, x: s.ax + dx * u, z: s.az + dz * u };
}
export function moverKick(ball, m, t) {
  const my = m.y == null ? 0.7 : m.y;
  if (ball.position.y > my + 1.4) return;              // ball flying over the top -> ignore
  const segs = moverSegments(m, t), next = moverSegments(m, t + MOVER_EPS);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i], n = next[i];
    const c = closestOnSeg(ball.position.x, ball.position.z, s);
    let nx = ball.position.x - c.x, nz = ball.position.z - c.z, d = Math.hypot(nx, nz);
    const rr = s.r + R;
    if (d >= rr) continue;
    if (d < 1e-4) { nx = 0; nz = 1; d = 1; }
    nx /= d; nz /= d;
    // material-point velocity at the same param u = the whack the ball receives
    const svx = (n.ax + (n.bx - n.ax) * c.u - c.x) / MOVER_EPS;
    const svz = (n.az + (n.bz - n.az) * c.u - c.z) / MOVER_EPS;
    const vn = (ball.velocity.x - svx) * nx + (ball.velocity.z - svz) * nz;
    if (vn < 0) {
      ball.velocity.x -= (1 + BUMP_REST) * vn * nx;
      ball.velocity.z -= (1 + BUMP_REST) * vn * nz;
      ball.wakeUp();
    }
    const push = rr - d + 0.002;
    ball.position.x += nx * push;
    ball.position.z += nz * push;
  }
}

// Advance one frame. dt is real seconds; sub-steps keep the fast little ball
// from tunnelling thin rails.
export function stepWorld(world, ball, meta, dt) {
  ball.linearDamping = BASE_DAMP;
  world.step(1 / 120, Math.min(dt, 1 / 30), 12);
  for (const b of meta.bumpers) bumperKick(ball, b);
  if (meta.movers && meta.movers.length) {
    const mt = Date.now() / 1000;                      // wall clock -> peers see ~same pose (NTP)
    for (const m of meta.movers) moverKick(ball, m, mt);
  }

  const ft = meta.floorTopAt ? meta.floorTopAt(ball.position.x, ball.position.z) : 0;
  const onSurface = ft !== null && ball.position.y <= ft + R + 0.08;

  // boosters: speed strips that fling a rolling ball along their arrow (climb fuel)
  let boosted = false;
  if (onSurface) for (const b of meta.boosters) {
    if (!inRect(ball.position.x, ball.position.z, b)) continue;
    const dx = b[4] || 0, dz = b[5] || 0, strength = b[6] || 26, cap = b[7] || 36;
    if (Math.hypot(ball.velocity.x, ball.velocity.z) < 0.5) continue; // only amplifies motion
    const m = Math.hypot(dx, dz) || 1;
    ball.velocity.x += (dx / m) * strength * dt;
    ball.velocity.z += (dz / m) * strength * dt;
    const sp = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (sp > cap) { const k = cap / sp; ball.velocity.x *= k; ball.velocity.z *= k; }
    ball.wakeUp(); boosted = true;
  }

  // gravity wells: radial pull F ∝ 1/d² (clamped) toward a point — bends a rolling
  // putt into a banana curve. Pure function of position => deterministic + online-safe.
  // Graze it and it curves; get too close and it swallows the ball (a hazard-shortcut).
  if (onSurface && meta.wells) for (const w of meta.wells) {
    const wx = w[0], wz = w[1], str = w[2] == null ? 16 : w[2], rad = w[3] == null ? 6.5 : w[3];
    let dx = wx - ball.position.x, dz = wz - ball.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.18 && d < rad) {
      const f = Math.min(str / (d * d), str);
      dx /= d; dz /= d;
      ball.velocity.x += dx * f * dt;
      ball.velocity.z += dz * f * dt;
      ball.wakeUp();
    }
  }

  // crisp settle: constant surface friction so the ball rolls out and stops in
  // FINITE time (cannon's linearDamping decays exponentially -> multi-second creep).
  // Skipped inside boosters (they own the ball) and off-surface (ramps/air: gravity rules).
  if (onSurface && !boosted) {
    const vx = ball.velocity.x, vz = ball.velocity.z;
    const sp = Math.hypot(vx, vz);
    if (sp > 0) {
      const decel = (inAny(ball.position.x, ball.position.z, meta.sand) ? SAND_DECEL : GREEN_DECEL) * dt;
      const ns = sp - decel;
      if (ns <= STOP_SPEED) {
        ball.velocity.x = 0; ball.velocity.z = 0; ball.angularVelocity.setZero();
      } else {
        const k = ns / sp; ball.velocity.x = vx * k; ball.velocity.z = vz * k;
      }
    }
  }
}

// Ballistic/helix flight for a launcher (cannon or spiral), starting from the
// ball's current spot. On-rails = deterministic, so cannons/loops never glitch.
// Returns { dur, at(u)->{x,y,z}, landVel:{x,z} } with u in [0,1].
export function makeFlight(launcher, meta, ball) {
  const topAt = meta.floorTopAt || (() => 0);
  const sx = ball.position.x, sz = ball.position.z;
  const g0 = topAt(sx, sz); const startY = (g0 == null ? 0 : g0) + R;
  const tx = launcher.tx, tz = launcher.tz;
  const gT = topAt(tx, tz); const endY = (gT == null ? 0 : gT) + R;
  if (launcher.type === "spiral") {
    const cx = launcher.cx == null ? launcher.x : launcher.cx;
    const cz = launcher.cz == null ? launcher.z : launcher.cz;
    const radius = launcher.radius == null ? 2.4 : launcher.radius;
    const turns = launcher.turns == null ? 1.5 : launcher.turns;
    const topY = launcher.topY == null ? 6 : launcher.topY;
    const dir = launcher.ccw ? 1 : -1;
    const a0 = Math.atan2(sz - cz, sx - cx);
    const climb = 0.72;                 // spiral up for the first 72%, arc down after
    const dur = launcher.dur == null ? (0.9 + turns * 0.55) : launcher.dur;
    const aTop = a0 + dir * turns * Math.PI * 2;
    const topX = cx + Math.cos(aTop) * radius * 0.86, topZ = cz + Math.sin(aTop) * radius * 0.86;
    return {
      dur,
      at(u) {
        if (u <= climb) {
          const t = u / climb, ang = a0 + dir * turns * Math.PI * 2 * t, rr = radius * (1 - 0.14 * t);
          return { x: cx + Math.cos(ang) * rr, y: startY + (topY - startY) * t, z: cz + Math.sin(ang) * rr };
        }
        const t = (u - climb) / (1 - climb), apex = 2.4;
        return { x: topX + (tx - topX) * t, y: topY + (endY - topY) * t + apex * Math.sin(Math.PI * t), z: topZ + (tz - topZ) * t };
      },
      landVel: (() => { const dx = tx - topX, dz = tz - topZ, m = Math.hypot(dx, dz) || 1; const s = launcher.exit == null ? 5 : launcher.exit; return { x: dx / m * s, z: dz / m * s }; })(),
    };
  }
  // cannon: ballistic arc pad -> target
  const apex = launcher.apex == null ? 4 : launcher.apex;
  const dist = Math.hypot(tx - sx, tz - sz);
  const dur = launcher.dur == null ? Math.max(0.5, Math.min(1.5, dist / 13)) : launcher.dur;
  return {
    dur,
    at(u) { return { x: sx + (tx - sx) * u, y: startY + (endY - startY) * u + apex * Math.sin(Math.PI * u), z: sz + (tz - sz) * u }; },
    landVel: (() => { const dx = tx - sx, dz = tz - sz, m = Math.hypot(dx, dz) || 1; const s = launcher.exit == null ? 6 : launcher.exit; return { x: dx / m * s, z: dz / m * s }; })(),
  };
}

// Is the ball sitting on a launcher pad (and eligible to fire)? Returns index or -1.
export function launcherAt(ball, meta) {
  for (let i = 0; i < meta.launchers.length; i++) {
    const L = meta.launchers[i];
    const r = L.r == null ? 1.0 : L.r;
    if (Math.hypot(ball.position.x - L.x, ball.position.z - L.z) <= r) return i;
  }
  return -1;
}

// Read the ball's situation. Order matters: a sunk ball wins over everything.
export function classify(ball, meta) {
  const x = ball.position.x, y = ball.position.y, z = ball.position.z;
  const sp = speed(ball);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(sp))
    return { sunk: false, hazard: "oob", resting: false, speed: 0 };  // NaN guard -> reset to tee
  const cupY = meta.cup.y || 0;
  const dcup = Math.hypot(x - meta.cup.x, z - meta.cup.z);
  const sunk = dcup < CUP_R && sp < CUP_SPEED && y < cupY + 0.66 && y > cupY - 0.6;
  let hazard = null;
  if (!sunk) {
    if (y < FALL_Y) hazard = "oob";
    else if (y < WATER_Y && inAny(x, z, meta.water) && !inAny(x, z, meta.causeways)) hazard = "water";
  }
  // elevation-aware rest: the ball is settled on WHATEVER surface it's on
  // (ground or a raised green), so raised holes still hand back the shot.
  const ft = meta.floorTopAt ? meta.floorTopAt(x, z) : 0;
  const resting = !sunk && !hazard && sp < REST && ft !== null && Math.abs(y - (ft + R)) < 0.2;
  return { sunk, hazard, resting, speed: sp };
}
