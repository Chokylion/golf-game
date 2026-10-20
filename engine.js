// engine.js — Cholf shared engine: physics, collisions, skins, trails, render.
// Fixed-timestep sim in a 1280x800 logical field, letterboxed to the viewport.

export const W = 1280, H = 800, RAIL = 46;
export const BALL_R = 10, CUP_R = 19;
export const MAX_PULL = 190, MAX_SPEED = 21;
export const FRICT_GRASS = 0.985, FRICT_SAND = 0.905;
export const REST = 0.72, BUMP_REST = 0.92;
export const STOP = 0.055, CAPTURE = 8.0;
export const DT_MS = 1000 / 60;

// ---------- pure helpers (unit-tested) ----------
export function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  let d = Math.sqrt(d2), ux, uy;
  if (d > 1e-6) { ux = dx / d; uy = dy / d; }
  else { const l = cx - rx, rr = rx + rw - cx, t = cy - ry, b = ry + rh - cy, m = Math.min(l, rr, t, b);
    ux = m === l ? -1 : m === rr ? 1 : 0; uy = m === t ? -1 : m === b ? 1 : 0; d = 0; }
  return { nx: ux, ny: uy, pen: r - d };
}
export function reflect(vx, vy, nx, ny, e) {
  const dot = vx * nx + vy * ny;
  return [vx - (1 + e) * dot * nx, vy - (1 + e) * dot * ny];
}
export function pointInRect(px, py, r) { return px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]; }
export function scoreName(d) {
  return d <= -3 ? "Albatross" : d === -2 ? "Eagle" : d === -1 ? "Birdie" : d === 0 ? "Par" :
    d === 1 ? "Bogey" : d === 2 ? "Double bogey" : (d + " over");
}
export function fmtTotal(n) { return n === 0 ? "E" : (n > 0 ? "+" + n : "" + n); }

// Resolve a bump on ball `me` from `other` (equal mass). Mutates me only, so
// each client keeps authority over its own ball. Returns true if it collided.
export function bumpBall(me, other, R = BALL_R, e = BUMP_REST) {
  const dx = me.x - other.x, dy = me.y - other.y;
  const d = Math.hypot(dx, dy);
  if (d >= R * 2 || d < 1e-6) return false;
  const nx = dx / d, ny = dy / d;
  me.x += nx * (R * 2 - d); me.y += ny * (R * 2 - d);      // separate (I move only myself)
  const myN = me.vx * nx + me.vy * ny;
  const otN = (other.vx || 0) * nx + (other.vy || 0) * ny;
  if (myN - otN < 0) {                                     // only when closing
    const j = (otN - myN) * e;                             // equal-mass normal swap
    me.vx += j * nx; me.vy += j * ny;
  }
  return true;
}

// ---------- course ----------
export const HOLES = [
  { par: 2, tee: [210, 400], cup: [1050, 400], walls: [], sand: [], water: [] },
  { par: 3, tee: [190, 620], cup: [1070, 200], walls: [[600, 300, 46, 454]], sand: [], water: [] },
  { par: 3, tee: [180, 400], cup: [1080, 400], walls: [[486, 46, 46, 360], [760, 394, 46, 360]], sand: [], water: [] },
  { par: 4, tee: [180, 650], cup: [1080, 190], walls: [[430, 300, 46, 454], [820, 46, 46, 454]], sand: [[560, 540, 190, 150]], water: [] },
  { par: 3, tee: [210, 400], cup: [1050, 400], walls: [], sand: [], water: [[560, 300, 190, 200]] },
  { par: 4, tee: [180, 180], cup: [1080, 640], walls: [[430, 180, 46, 420], [820, 360, 46, 394]], sand: [[600, 600, 230, 120]], water: [[540, 120, 210, 150]] },
  { par: 4, tee: [170, 400], cup: [1090, 400], walls: [[402, 268, 46, 288], [620, 268, 46, 288], [838, 268, 46, 288]], sand: [], water: [] },
  { par: 5, tee: [170, 650], cup: [1090, 160], walls: [[380, 320, 46, 434], [700, 46, 46, 434], [980, 320, 46, 300]], sand: [[520, 540, 180, 150]], water: [[760, 520, 180, 150]] },
  { par: 3, tee: [210, 400], cup: [1040, 400], walls: [[560, 214, 180, 46], [560, 540, 180, 46]], sand: [], water: [[600, 300, 120, 200]] },
];
export const PAR_TOTAL = HOLES.reduce((s, h) => s + h.par, 0);

// ---------- skins ----------
export const SKINS = {
  classic: { name: "Classic", trail: "#ffffff", c0: "#ffffff", c1: "#c7d4cd", dimple: true },
  volt:    { name: "Volt",    trail: "#c6ff3d", c0: "#eaffc0", c1: "#8fe000", glow: "#c6ff3d" },
  sunset:  { name: "Sunset",  trail: "#ff9e6b", c0: "#ffd9a8", c1: "#ff6f61" },
  ocean:   { name: "Ocean",   trail: "#7fd4ff", c0: "#c7f0ff", c1: "#2f8fd6", glow: "#7fd4ff" },
  magma:   { name: "Magma",   trail: "#ff6a4d", c0: "#ffcaa8", c1: "#c0341a", glow: "#ff6a4d" },
  eight:   { name: "8-Ball",  trail: "#d0d0d0", c0: "#2a2a2a", c1: "#050505", eight: true },
};
export const SKIN_IDS = Object.keys(SKINS);

export function paintBall(ctx, skinId, x, y, r) {
  const s = SKINS[skinId] || SKINS.classic;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x + 3, y + 5, r, r * 0.7, 0, 0, 7); ctx.fill();
  if (s.glow) { ctx.shadowColor = s.glow; ctx.shadowBlur = 16; }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
  g.addColorStop(0, s.c0); g.addColorStop(1, s.c1);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  if (s.eight) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#111"; ctx.font = `700 ${r * 0.7}px 'Space Grotesk',sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("8", x, y + 1); }
  else if (s.dimple) { ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.34, r * 0.26, 0, 7); ctx.fill(); }
  else { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.34, r * 0.24, 0, 7); ctx.fill(); }
  ctx.restore();
}

// ---------- ball factory + physics ----------
export function makeBall(id, name, skin, local) {
  return { id, name: name || "Player", skin: skin || "classic", local: !!local,
    x: 0, y: 0, vx: 0, vy: 0, moving: false, sunk: 0, holed: false,
    strokes: 0, total: 0, origin: [0, 0], trail: [] };
}
export function placeAtTee(ball, hole) {
  ball.x = hole.tee[0]; ball.y = hole.tee[1]; ball.vx = ball.vy = 0;
  ball.moving = false; ball.sunk = 0; ball.holed = false; ball.strokes = 0;
  ball.origin = [ball.x, ball.y]; ball.trail.length = 0;
}

// Advance one fixed step for a moving local ball. `hooks`: {wall(v),splash(),sink()}.
export function advance(ball, hole, hooks = {}) {
  if (!ball.moving) return;
  let inSand = false;
  for (const s of hole.sand) if (pointInRect(ball.x, ball.y, s)) inSand = true;
  const f = inSand ? FRICT_SAND : FRICT_GRASS;
  ball.x += ball.vx; ball.y += ball.vy; ball.vx *= f; ball.vy *= f;

  const rails = [
    [ball.x < RAIL + BALL_R, () => { ball.x = RAIL + BALL_R; ball.vx = -ball.vx * REST; }],
    [ball.x > W - RAIL - BALL_R, () => { ball.x = W - RAIL - BALL_R; ball.vx = -ball.vx * REST; }],
    [ball.y < RAIL + BALL_R, () => { ball.y = RAIL + BALL_R; ball.vy = -ball.vy * REST; }],
    [ball.y > H - RAIL - BALL_R, () => { ball.y = H - RAIL - BALL_R; ball.vy = -ball.vy * REST; }],
  ];
  for (const [hit, fix] of rails) if (hit) { const v = Math.hypot(ball.vx, ball.vy); fix(); hooks.wall && hooks.wall(v); }

  for (const wl of hole.walls) {
    const hit = circleRectHit(ball.x, ball.y, BALL_R, wl[0], wl[1], wl[2], wl[3]);
    if (hit) {
      ball.x += hit.nx * hit.pen; ball.y += hit.ny * hit.pen;
      const v = Math.hypot(ball.vx, ball.vy);
      [ball.vx, ball.vy] = reflect(ball.vx, ball.vy, hit.nx, hit.ny, REST);
      hooks.wall && hooks.wall(v);
    }
  }
  for (const wt of hole.water) if (pointInRect(ball.x, ball.y, wt)) {
    ball.strokes++; ball.x = ball.origin[0]; ball.y = ball.origin[1];
    ball.vx = ball.vy = 0; ball.moving = false; hooks.splash && hooks.splash(); return;
  }

  const dx = hole.cup[0] - ball.x, dy = hole.cup[1] - ball.y, dc = Math.hypot(dx, dy);
  const sp = Math.hypot(ball.vx, ball.vy);
  if (dc < CUP_R) {
    if (sp <= CAPTURE) { ball.moving = false; ball.sunk = 0.0001; hooks.sink && hooks.sink(); return; }
    ball.vx += dx / dc * 0.9; ball.vy += dy / dc * 0.9;    // lip-out tug
  }
  if (Math.hypot(ball.vx, ball.vy) < STOP) { ball.vx = ball.vy = 0; ball.moving = false; ball.origin = [ball.x, ball.y]; }
}

// ---------- rendering ----------
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

export function computeView(winW, winH, dpr) {
  const s = Math.min(winW / W, winH / H);
  return { s, ox: (winW - W * s) / 2, oy: (winH - H * s) / 2, dpr };
}

export function renderScene(ctx, o) {
  const { view, hole, balls, localId, aim, t } = o;
  const dpr = view.dpr, sh = o.shake || 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const sx = sh > 0.3 ? (Math.random() - .5) * sh : 0, sy = sh > 0.3 ? (Math.random() - .5) * sh : 0;
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, view.ox * dpr + sx, view.oy * dpr + sy);

  const g = ctx.createRadialGradient(W * .5, H * .42, 120, W * .5, H * .5, W * .75);
  g.addColorStop(0, "#1f4d3a"); g.addColorStop(1, "#0e2b20");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = .05; ctx.fillStyle = "#fff";
  for (let x = 0; x < W; x += 84) ctx.fillRect(x, 0, 42, H);
  ctx.globalAlpha = 1;

  ctx.lineWidth = RAIL * 2; ctx.strokeStyle = "#0a1a13"; ctx.strokeRect(0, 0, W, H);
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.strokeRect(RAIL, RAIL, W - RAIL * 2, H - RAIL * 2);

  for (const sd of hole.sand) { ctx.fillStyle = "#d9c48c"; roundRect(ctx, sd[0], sd[1], sd[2], sd[3], 26); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.06)"; roundRect(ctx, sd[0] + 6, sd[1] + 8, sd[2] - 12, sd[3] - 12, 20); ctx.fill(); }
  for (const wt of hole.water) {
    const wg = ctx.createLinearGradient(wt[0], wt[1], wt[0], wt[1] + wt[3]);
    wg.addColorStop(0, "#2f7fb8"); wg.addColorStop(1, "#1d5f92");
    ctx.fillStyle = wg; roundRect(ctx, wt[0], wt[1], wt[2], wt[3], 22); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const yy = wt[1] + 14 + i * 22 + Math.sin(t / 430 + i) * 4;
      ctx.beginPath(); ctx.moveTo(wt[0] + 16, yy); ctx.lineTo(wt[0] + wt[2] - 16, yy); ctx.stroke(); }
  }
  for (const wl of hole.walls) {
    ctx.fillStyle = "#12261d"; roundRect(ctx, wl[0], wl[1], wl[2], wl[3], 10); ctx.fill();
    const lg = ctx.createLinearGradient(wl[0], wl[1], wl[0], wl[1] + Math.min(wl[3], 30));
    lg.addColorStop(0, "rgba(255,255,255,.18)"); lg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lg; roundRect(ctx, wl[0], wl[1], wl[2], Math.min(wl[3], 30), 10); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; roundRect(ctx, wl[0], wl[1], wl[2], wl[3], 10); ctx.stroke();
  }

  const cx = hole.cup[0], cy = hole.cup[1];
  ctx.fillStyle = "#05100b"; ctx.beginPath(); ctx.arc(cx, cy, CUP_R, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, CUP_R, 0, 7); ctx.stroke();
  const pulse = (Math.sin(t / 500) + 1) / 2;
  ctx.strokeStyle = "rgba(126,240,176," + (0.15 + pulse * 0.3) + ")"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, CUP_R + 7 + pulse * 4, 0, 7); ctx.stroke();
  ctx.strokeStyle = "#e9f3ee"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 56); ctx.stroke();
  ctx.fillStyle = "#7ef0b0"; ctx.beginPath(); ctx.moveTo(cx, cy - 56); ctx.lineTo(cx + 26, cy - 48); ctx.lineTo(cx, cy - 40); ctx.fill();

  // aim guide for the local ball
  const me = balls.find(b => b.id === localId);
  if (aim && aim.active && me && !me.moving && !me.holed) {
    const dx = me.origin[0] - aim.x, dy = me.origin[1] - aim.y, d = Math.hypot(dx, dy);
    const p = Math.min(d, MAX_PULL) / MAX_PULL;
    const col = p < .5 ? "#7ef0b0" : p < .8 ? "#ffcf6b" : "#ff7a7a";
    const ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : 0;
    ctx.setLineDash([2, 12]); ctx.lineCap = "round"; ctx.lineWidth = 4; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(me.x + ux * p * 300, me.y + uy * p * 300); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(aim.x, aim.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(me.x, me.y, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
  }

  // trails then balls
  for (const b of balls) {
    if (b.holed && b.sunk >= 1) continue;
    const tc = (SKINS[b.skin] || SKINS.classic).trail;
    for (let i = 0; i < b.trail.length; i++) {
      const pt = b.trail[i], a = (i / b.trail.length) * 0.5;
      ctx.globalAlpha = a; ctx.fillStyle = tc;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, BALL_R * (0.3 + i / b.trail.length * 0.6), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  for (const b of balls) {
    if (b.holed && b.sunk >= 1) continue;
    const r = BALL_R * (1 - (b.sunk || 0) * 0.85);
    paintBall(ctx, b.skin, b.x, b.y, r);
    if (b.id === localId) { ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, r + 4, 0, 7); ctx.stroke(); }
    if (o.showLabels && b.name) {
      ctx.font = "600 17px 'Space Grotesk',sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const w = ctx.measureText(b.name).width;
      ctx.fillStyle = "rgba(5,12,9,.6)"; roundRect(ctx, b.x - w / 2 - 8, b.y - r - 30, w + 16, 22, 8); ctx.fill();
      ctx.fillStyle = b.id === localId ? "#c6ff3d" : "#eef4f1"; ctx.fillText(b.name, b.x, b.y - r - 12);
    }
  }

  if (o.particles) { for (const p of o.particles) { ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life + 1, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
  ctx.restore && ctx.restore();
}

// keep trail buffer for a ball (call each frame)
export function pushTrail(ball) {
  if (ball.moving && !ball.holed) { ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 16) ball.trail.shift(); }
  else if (ball.trail.length) ball.trail.shift();
}
