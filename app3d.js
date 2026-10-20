// app3d.js — Cholf 3D orchestration: stage boot, aim/shoot controls, game loop,
// solo + online play, and Supabase netcode glue. Reuses the transport-agnostic
// net.js and the polished DOM shell; drives the Three.js renderer (engine3d.js)
// off the cannon-es simulation (physics.js). Both build from courses.js specs.

import * as THREE from "three";
import * as V from "./engine3d.js";
import * as P from "./physics.js";
import * as C from "./courses.js";
import * as Net from "./net.js";

const $ = id => document.getElementById(id);
const R = P.R;
const INTERP = 110, STATE_HZ = 50, HOLE_TIMEOUT = 120000;
const MAX_PULL = 6;                 // world-units of drag = full power (100%)
const OVERDRIVE = 1.10;             // you can overcharge to 110% for extra distance
const ORBIT_SENS = 0.006;           // radians of camera yaw per pixel dragged
const GRAB = 2.2;                   // must press within this of the ball to start a putt

// ---------- stage / scene ----------
const canvas = $("game");
canvas.style.touchAction = "none";
const stage = V.initStage(canvas);
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ---------- physics ----------
const world = P.buildWorld();
const ball = P.makeBall(world, 0, 0);
let meta = null, courseGroup = null, localMesh = null, localTrail = null, aim = null, burst = null;

// ---------- identity ----------
const me = {
  id: Net.genId(),
  name: (localStorage.getItem("cholf:name") || "").slice(0, 14),
  skin: localStorage.getItem("cholf:skin") || "classic",
};

// ---------- state ----------
const G = {
  mode: "menu", phase: "menu", holeIdx: 0, order: [], showcase: true,
  room: null, roomCode: "", players: [], ghosts: new Map(),
  strokes: 0, total: 0, soloScores: [],
  moving: false, holed: false, sinkT: 0, origin: [0, 0],
  aiming: false, pull: { dx: 0, dz: 1, len: 0 },
  camYaw: 0, orbiting: false, orbitX: 0,
  holeStart: 0, advancing: false, muted: false, lastSend: 0, shake: 0,
  flight: null, launchCool: 0, slowT: 0,
};
window.__G = G; // debug/verify hook (peer party game — no server authority)

// ---------- audio ----------
let AC = null;
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return AC; }
function blip(f, dur, type = "sine", vol = .16, slide) {
  if (G.muted) return; const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
const sfx = {
  putt: p => { blip(200 + p * 260, .16, "triangle", .16, 120); blip(80, .09, "sine", .12); },
  wall: v => blip(300 + Math.min(v, 20) * 22, .05, "square", Math.min(.02 + v * .006, .12)),
  water: () => { blip(420, .22, "sine", .12, 90); blip(180, .3, "sawtooth", .05, 60); },
  sink: () => { blip(660, .12, "sine", .2, 880); setTimeout(() => blip(990, .28, "sine", .18, 1320), 90); },
  bump: () => blip(160, .07, "square", .1),
  woosh: () => { blip(680, .16, "sawtooth", .12, 90); blip(1200, .1, "sine", .05, 400); },
  boom: p => { blip(120, .2, "sine", Math.min(.14 + p * .12, .3), 40); blip(240, .09, "square", .08, 70); },
};
let lastWall = 0;
ball.addEventListener("collide", e => {
  const v = e.contact ? Math.abs(e.contact.getImpactVelocityAlongNormal()) : 0;
  const now = performance.now();
  if (v > 2.2 && now - lastWall > 55) { lastWall = now; sfx.wall(v); G.shake = Math.max(G.shake, Math.min(v * 0.03, 0.4)); }
});

// ---------- haptics + squash/stretch (juice) ----------
function buzz(pat) { try { if (navigator.vibrate && !G.muted) navigator.vibrate(pat); } catch (e) {} }
function squash(grp, amt) { if (grp && grp.userData) { grp.userData.sqT = 1; grp.userData.sqAmt = amt; } }
function tickSquash(grp, dt) {
  const u = grp && grp.userData; if (!u || !u.sqT || !u.mesh) return;
  u.sqT = Math.max(0, u.sqT - dt * 7);
  const a = (u.sqAmt || 0.3) * u.sqT; u.mesh.scale.set(1 + a, 1 - a, 1 + a);
  if (u.sqT <= 0) u.mesh.scale.set(1, 1, 1);
}

// ---------- skin swatches (2D preview for the picker) ----------
function lighten(hex, amt = 0.45) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = c => Math.round(c + (255 - c) * amt);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function drawSwatch(cx, id, x, y, r) {
  const s = C.skinById(id);
  const g = cx.createRadialGradient(x - r * .35, y - r * .4, r * .2, x, y, r);
  g.addColorStop(0, lighten(s.color)); g.addColorStop(1, s.color);
  cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
  cx.strokeStyle = s.accent; cx.lineWidth = 2; cx.beginPath(); cx.arc(x, y, r * .55, .6, 2.3); cx.stroke();
  cx.fillStyle = "rgba(255,255,255,.75)"; cx.beginPath(); cx.arc(x - r * .3, y - r * .35, r * .18, 0, 7); cx.fill();
}
function buildSkinPicker(el) {
  el.innerHTML = "";
  for (const id of C.SKIN_IDS) {
    const b = document.createElement("button"); b.className = "skin" + (id === me.skin ? " on" : ""); b.dataset.skin = id; b.title = C.skinById(id).name;
    const c = document.createElement("canvas"); c.width = c.height = 44; drawSwatch(c.getContext("2d"), id, 22, 22, 15); b.appendChild(c);
    b.onclick = () => {
      setLocalSkin(id);
      document.querySelectorAll(".skin").forEach(x => x.classList.toggle("on", x.dataset.skin === id));
      if (G.room) G.room.setPresence({ skin: id });
    };
    el.appendChild(b);
  }
}

// ---------- ball meshes ----------
function disposeGroup(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); } }); }
function setLocalSkin(id) {
  me.skin = id; localStorage.setItem("cholf:skin", id);
  const vis = localMesh ? localMesh.visible : true;
  if (localMesh) { stage.scene.remove(localMesh); disposeGroup(localMesh); }
  localMesh = V.makeBall(id); localMesh.visible = vis; stage.scene.add(localMesh);
}

// ---------- overlays / HUD ----------
const overlays = ["menu", "lobby", "holeScreen", "endScreen"];
function show(id) { overlays.forEach(o => $(o).hidden = (o !== id)); if (id) $(id).classList.add("open"); }
function hideOverlays() { overlays.forEach(o => $(o).hidden = true); }
function setHud(on) { document.body.classList.toggle("playing", on); }
function toast(msg, ms = 1800) { const t = $("toast"); t.hidden = false; t.textContent = msg; clearTimeout(toast._t); if (ms) toast._t = setTimeout(() => { t.hidden = true; }, ms); }

// ---------- emoji taunts (Golf-Battle style quick chat) ----------
const TAUNTS = ["\u{1F525}", "\u{1F602}", "\u{1F60E}", "\u{1F62D}", "\u{1F44F}", "\u{1F4A9}"];
const BUMP_TAUNTS = ["\u{1F4A5}", "\u{1F602}", "\u{1F60E}", "\u{1F44A}"]; // fired at whoever you smash
function buildTauntBar() {
  const bar = $("tauntBar"); if (!bar || bar.dataset.built) return; bar.dataset.built = "1";
  bar.innerHTML = TAUNTS.map(e => `<button class="temoji" type="button" aria-label="taunt">${e}</button>`).join("");
  [...bar.children].forEach((b, i) => b.addEventListener("click", () => sendTaunt(TAUNTS[i])));
}
let lastTaunt = 0;
let lastBumpTaunt = 0;
function autoBumpTaunt() {
  const now = performance.now(); if (now - lastBumpTaunt < 1600) return; lastBumpTaunt = now;
  sendTaunt(BUMP_TAUNTS[(Math.random() * BUMP_TAUNTS.length) | 0]);
}
function sendTaunt(emoji) {
  const now = performance.now(); if (now - lastTaunt < 450) return; lastTaunt = now; // rate-limit spam
  if (G.room) G.room.sendTaunt({ id: me.id, name: me.name, emoji });
  showTaunt(null, emoji, ball.position.x, ball.position.z); buzz(10);
}
function onTaunt(p) {
  if (!p || p.id === me.id) return;
  const g = G.ghosts.get(p.id);
  showTaunt(p.name, p.emoji, g ? g.x : null, g ? g.z : null);
}
const _tproj = new THREE.Vector3();
function showTaunt(name, emoji, wx, wz) {
  const layer = $("taunts"); if (!layer) return;
  const el = document.createElement("div"); el.className = "taunt-pop";
  el.innerHTML = `<span class="te">${emoji}</span>` + (name ? `<span class="tn">${esc(name)}</span>` : "");
  let left = innerWidth / 2, top = innerHeight * 0.68;
  if (wx != null) {
    _tproj.set(wx, R + 0.9, wz).project(stage.camera);
    left = Math.max(44, Math.min(innerWidth - 44, (_tproj.x * 0.5 + 0.5) * innerWidth));
    top = Math.max(64, Math.min(innerHeight - 90, (-_tproj.y * 0.5 + 0.5) * innerHeight));
  }
  el.style.left = left + "px"; el.style.top = top + "px";
  layer.appendChild(el); setTimeout(() => el.remove(), 1700);
}
function esc(s) { return (s || "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }
function fmtSigned(d) { return d === 0 ? "E" : C.fmtTotal(d); }
// ----- match hole ordering: each match plays a shuffled subset (random 9) -----
// G.order maps match-position (0..len-1) -> COURSES index. Solo shuffles locally;
// online the host broadcasts the SAME order so every client plays the same holes.
const MATCH_HOLES = 9;
const hIdx = pos => (G.order && G.order[pos] != null) ? G.order[pos] : pos;
const matchLen = () => (G.order && G.order.length) ? G.order.length : C.HOLE_COUNT;
const curCourse = () => C.COURSES[hIdx(G.holeIdx)];
function pickOrder() {
  const N = Math.min(MATCH_HOLES, C.COURSES.length);
  const idx = C.COURSES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const pick = idx.slice(0, N);
  // gentle difficulty arc (research §7): easiest hole opens, hardest closes,
  // middle stays shuffled so no two matches feel the same.
  pick.sort((a, b) => C.COURSES[a].par - C.COURSES[b].par);
  const opener = pick.shift(), finale = pick.pop();
  for (let i = pick.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pick[i], pick[j]] = [pick[j], pick[i]]; }
  return finale == null ? [opener] : [opener, ...pick, finale];
}
// par summed across the first n holes of THIS match (safe past the end)
function parThrough(n) { let s = 0; for (let k = 0; k < n && k < matchLen(); k++) s += C.COURSES[hIdx(k)].par; return s; }
// a player's score relative to par, counting only the holes they've completed
function relOf(p) {
  const self = p.id === me.id;
  const done = Math.min((self ? G.holeIdx : (p.hole || 0)) + ((self ? G.holed : p.sunk) ? 1 : 0), matchLen());
  const total = self ? G.total : (p.total || 0);
  return total - parThrough(done);
}

// ---------- hole lifecycle ----------
function loadHole(i) {
  G.holeIdx = i; const c = C.COURSES[hIdx(i)];
  if (meta) P.removeCourse(world, meta);
  if (courseGroup) { if (courseGroup.userData.dispose) courseGroup.userData.dispose(); stage.scene.remove(courseGroup); }
  meta = P.addCourse(world, c);
  courseGroup = V.buildCourse(c); stage.scene.add(courseGroup);
  V.applyTheme(stage, c.theme);
  P.placeBall(ball, c.tee[0], c.tee[1]);
  G.origin = [c.tee[0], c.tee[1]]; G.moving = false; G.holed = false; G.sinkT = 0; G.strokes = 0; G.aiming = false;
  G.flight = null; G.launchCool = 0; G.slowT = 0;
  G.camYaw = 0; G.orbiting = false; updatePowerMeter(0, false);
  if (localMesh) { localMesh.visible = true; localMesh.scale.setScalar(1); localMesh.userData.mesh.position.y = R; }
  localTrail.reset(new THREE.Vector3(c.tee[0], R, c.tee[1])); aim.hide();
  for (const g of G.ghosts.values()) { g.x = c.tee[0]; g.z = c.tee[1]; g.buf = []; g.holed = false; g.trail.reset(new THREE.Vector3(c.tee[0], R, c.tee[1])); }
  $("holeNo").textContent = i + 1; $("par").textContent = c.par; $("strokes").textContent = 0;
  const tl = document.querySelector(".hud.tl small"); if (tl) tl.textContent = " / " + matchLen();
  $("hint").style.opacity = 1; $("toast").hidden = true;
  updateTotalHud();
}
function updateTotalHud() {
  const diff = G.mode === "online"
    ? relOf({ id: me.id })
    : G.soloScores.reduce((s, v, k) => s + (v - C.COURSES[hIdx(k)].par), 0);
  const el = $("total"); el.textContent = fmtSigned(diff);
  el.className = "v" + (diff < 0 ? " u" : diff > 0 ? " o" : "");
}

// ---------- shooting ----------
const _hit = new THREE.Vector3();
function groundPoint(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const nx = ((clientX - r.left) / r.width) * 2 - 1, ny = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, stage.camera);
  return raycaster.ray.intersectPlane(groundPlane, _hit) ? _hit : null;
}
function canAim() { return G.phase === "playing" && !G.moving && !G.holed && G.sinkT === 0; }
function updatePull(e) {
  const g = groundPoint(e.clientX, e.clientY); if (!g) return;
  const dx = ball.position.x - g.x, dz = ball.position.z - g.z;
  G.pull = { dx, dz, len: Math.hypot(dx, dz) };
}
function pullPower() { return Math.min(G.pull.len / MAX_PULL, OVERDRIVE); } // 0..1.10
const _pm = { el: null, fill: null, pct: null, num: null };
function updatePowerMeter(p01, show) {
  if (!_pm.el) { _pm.el = $("powerMeter"); _pm.fill = $("pmFill"); _pm.pct = $("pmPct"); _pm.num = _pm.el.querySelector(".pm-num"); }
  if (!show) { if (!_pm.el.hidden) _pm.el.hidden = true; return; }
  if (_pm.el.hidden) _pm.el.hidden = false;
  const pct = Math.round(p01 * 100);
  _pm.fill.style.height = (p01 / OVERDRIVE * 100).toFixed(1) + "%";
  _pm.pct.textContent = pct;
  _pm.num.classList.toggle("over", pct > 100);
}
function doShoot() {
  const { dx, dz, len } = G.pull;
  const power01 = pullPower();
  aim.hide(); updatePowerMeter(0, false);
  if (len < 0.5 || power01 * P.MAX_SHOT < P.MIN_SHOT) return; // a tap = cancel
  G.origin = [ball.position.x, ball.position.z];
  P.shoot(ball, dx, dz, power01 * P.MAX_SHOT);
  G.moving = true; G.strokes++; $("strokes").textContent = G.strokes; $("hint").style.opacity = 0;
  sfx.putt(Math.min(power01, 1)); squash(localMesh, -0.24 - power01 * 0.14); buzz(power01 > 1 ? [8, 20, 14] : 8);
}
canvas.addEventListener("pointerdown", e => {
  if (G.phase !== "playing") return;
  const g = groundPoint(e.clientX, e.clientY);
  if (canAim() && g && Math.hypot(ball.position.x - g.x, ball.position.z - g.z) <= GRAB) {
    ac(); G.aiming = true; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} updatePull(e); e.preventDefault();
  } else {                                  // drag empty space to look left/right
    G.orbiting = true; G.orbitX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault();
  }
});
addEventListener("pointermove", e => {
  if (G.aiming) updatePull(e);
  else if (G.orbiting) { G.camYaw += (e.clientX - G.orbitX) * ORBIT_SENS; G.orbitX = e.clientX; }
});
addEventListener("pointerup", () => { if (G.aiming) { G.aiming = false; doShoot(); } G.orbiting = false; });
addEventListener("pointercancel", () => { G.aiming = false; G.orbiting = false; aim.hide(); updatePowerMeter(0, false); });
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === "m") toggleMute();
  if (k === "r" && G.mode === "solo" && G.phase === "playing") loadHole(G.holeIdx);
});

// ---------- ball / ghost bump ----------
function bumpMe(cb, g) {
  const dx = cb.position.x - g.x, dz = cb.position.z - g.z;
  const d = Math.hypot(dx, dz), rr = R * 2;
  if (d >= rr || d < 1e-4) return;
  const nx = dx / d, nz = dz / d;
  const rvx = cb.velocity.x - (g.svx || 0), rvz = cb.velocity.z - (g.svz || 0);
  const vn = rvx * nx + rvz * nz;
  if (vn < 0) {
    const hit = -vn;                       // approach speed along the contact normal
    const mySpeed = Math.hypot(cb.velocity.x, cb.velocity.z);   // pre-impulse: who's charging in
    const gSpeed = Math.hypot(g.svx || 0, g.svz || 0);
    const big = hit > 2.6;
    const j = 2.8 * hit + (big ? 4.5 : 0); // BIG knock: near-3x elastic + a flat kick on solid contact
    cb.velocity.x += j * nx; cb.velocity.z += j * nz;
    const sp = Math.hypot(cb.velocity.x, cb.velocity.z);        // ponytail: cap so a smash can't NaN/fly off-world
    if (sp > 30) { const k = 30 / sp; cb.velocity.x *= k; cb.velocity.z *= k; }
    cb.wakeUp();
    if (big) {                             // solid contact -> woosh/boom juice
      const mx = (cb.position.x + g.x) / 2, mz = (cb.position.z + g.z) / 2;
      const pw = Math.min(hit / 6, 2.1);
      if (burst) burst.pop(mx, mz, C.skinById(me.skin).accent, 0.9 + pw);
      sfx.woosh(); sfx.boom(pw);
      G.shake = Math.max(G.shake, Math.min(0.22 + hit * 0.06, 0.62));
      buzz(pw > 1 ? [12, 20, 30] : 22);
      squash(localMesh, 0.4); if (g.group) squash(g.group, 0.34);
      if (hit > 4 && mySpeed > gSpeed + 0.5) autoBumpTaunt(); // I charged in -> rub it in their face
    } else sfx.bump();
  }
  const push = rr - d + 0.002; cb.position.x += nx * push; cb.position.z += nz * push;
}

// ---------- sink / hazard ----------
function startSink() {
  if (G.sinkT > 0) return;
  G.sinkT = 0.0001; G.moving = false; ball.velocity.setZero(); ball.angularVelocity.setZero();
  sfx.sink(); G.shake = Math.max(G.shake, 0.45);
  if (burst) burst.pop(ball.position.x, ball.position.z, C.skinById(me.skin).accent, 1.5);
  buzz([18, 30, 40]);
}
function hazard(kind) {
  sfx.water(); G.shake = Math.max(G.shake, 0.6);
  P.placeBall(ball, G.origin[0], G.origin[1]); G.moving = false;
  $("toast").hidden = false; $("toast").textContent = kind === "water" ? "Splash! Replay the shot." : "Out of bounds!";
  setTimeout(() => { if (!G.holed && G.phase === "playing") $("toast").hidden = true; }, 1500);
}
function onHoled() {
  if (localMesh) localMesh.visible = false;
  if (G.mode === "solo") soloHoleComplete(); else onlineLocalHoled();
}

// ---------- SOLO ----------
function startSolo() {
  G.mode = "solo"; G.showcase = false; G.soloScores = []; G.ghosts.forEach(removeGhost); G.ghosts.clear();
  G.order = pickOrder();
  loadHole(0); G.phase = "playing"; setHud(true); hideOverlays(); updateMiniboard();
}
function soloHoleComplete() {
  const c = curCourse(); G.soloScores[G.holeIdx] = G.strokes; G.phase = "holeEnd";
  const diff = G.strokes - c.par;
  $("holeEyebrow").textContent = "Hole " + (G.holeIdx + 1) + " complete";
  $("holeStrokesBig").textContent = G.strokes;
  const v = $("verdict"); v.textContent = C.scoreName(G.strokes, c.par); v.className = "verdict" + (diff > 0 ? (diff >= 2 ? " bad" : " over") : "");
  $("holeSub").textContent = G.strokes + (G.strokes === 1 ? " stroke" : " strokes") + " \u00b7 Par " + c.par;
  $("nextBtn").firstChild.textContent = G.holeIdx >= matchLen() - 1 ? "See scorecard " : "Next hole ";
  show("holeScreen");
}
function soloNext() { if (G.holeIdx >= matchLen() - 1) return soloEnd(); hideOverlays(); loadHole(G.holeIdx + 1); G.phase = "playing"; }
function soloEnd() {
  G.phase = "matchEnd";
  const total = G.soloScores.reduce((s, v) => s + v, 0), parTot = parThrough(matchLen()), diff = total - parTot;
  $("endTitle").textContent = total + " strokes";
  const ev = $("endVerdict"); ev.textContent = diff === 0 ? "Even par" : C.fmtTotal(diff) + " to par"; ev.className = "verdict" + (diff > 0 ? " over" : "");
  let rows = "<tr><th>Hole</th>" + G.order.map((_, i) => "<th>" + (i + 1) + "</th>").join("") + "<th>Tot</th></tr>";
  rows += "<tr><td class='h'>Par</td>" + G.order.map(ci => "<td class='h'>" + C.COURSES[ci].par + "</td>").join("") + "<td class='h'>" + parTot + "</td></tr>";
  rows += "<tr><td class='h'>You</td>" + G.soloScores.map((s, i) => { const d = s - C.COURSES[hIdx(i)].par; return "<td class='" + (d < 0 ? "u" : d > 0 ? "o" : "e") + "'>" + s + "</td>"; }).join("") + "<td class='" + (diff < 0 ? "u" : diff > 0 ? "o" : "e") + "'>" + fmtSigned(diff) + "</td></tr>";
  $("scorecard").innerHTML = rows; show("endScreen"); $("againBtn").firstChild.textContent = "Play again ";
}

// ---------- ONLINE ----------
function makeGhost(p) {
  const group = V.makeBall(p.skin); group.userData.mesh.position.y = R; stage.scene.add(group);
  return {
    id: p.id, name: p.name, skin: p.skin, group, trail: new V.Trail(stage.scene, C.skinById(p.skin).accent),
    buf: [], x: meta ? meta.tee.x : 0, z: meta ? meta.tee.z : 0, vx: 0, vz: 0, svx: 0, svz: 0, pt: 0, moving: false, holed: false, sunkP: false,
  };
}
function removeGhost(g) { stage.scene.remove(g.group); disposeGroup(g.group); g.trail.dispose(); }

function joinRoom(code) {
  if (!Net.online) { $("netWarn").hidden = false; return; }
  me.name = ($("nameInput").value || "").trim().slice(0, 14) || "Player"; localStorage.setItem("cholf:name", me.name);
  G.mode = "online"; G.roomCode = code.toUpperCase();
  G.room = Net.connect(code, me, {
    onPlayers, onState, onFlow: applyFlow, onTaunt,
    onStatus: s => { $("netDot").className = "netdot " + (s === "SUBSCRIBED" ? "ok" : "bad"); },
  });
  openLobby();
}
function openLobby() {
  G.phase = "lobby"; G.showcase = true; setHud(false);
  if (!meta) { loadHole(0); }
  $("roomCodeBig").textContent = G.roomCode;
  buildSkinPicker($("skinLobby"));
  show("lobby");
}
function onPlayers(list) {
  G.players = list;
  const ids = new Set(list.map(p => p.id));
  for (const p of list) {
    if (p.id === me.id) continue;
    let g = G.ghosts.get(p.id);
    if (!g) { g = makeGhost(p); G.ghosts.set(p.id, g); }
    g.name = p.name; g.sunkP = p.sunk;
    if (p.skin && p.skin !== g.skin) { g.skin = p.skin; g.group.userData.mesh.material.color.set(C.skinById(p.skin).color); }
  }
  for (const id of [...G.ghosts.keys()]) if (!ids.has(id)) { removeGhost(G.ghosts.get(id)); G.ghosts.delete(id); }
  // N1/N19: still in the lobby but a match is already live -> jump in at the current
  // hole and credit par for the holes I missed, so totals stay comparable.
  if (G.phase === "lobby") {
    const live = list.filter(p => p.id !== me.id && p.playing);
    if (live.length) {
      // adopt the match's shuffled hole order from a peer so we play the same holes
      const src = live.find(p => Array.isArray(p.order) && p.order.length);
      if (src) G.order = src.order.slice();
      const hole = Math.min(Math.max(...live.map(p => p.hole || 0)), matchLen() - 1);
      G.total = parThrough(hole);
      startPlayingOnline(hole);
      G.room.setPresence({ total: G.total });
      toast(`Joined mid-match \u2014 hole ${hole + 1}. Earlier holes scored as par.`, 2600);
      return;
    }
  }
  if (G.phase === "lobby") renderLobby();
  updateMiniboard();
}
function renderLobby() {
  const ref = G.room.referee();
  $("lobbyList").innerHTML = G.players.map(p => {
    const c = document.createElement("canvas"); c.width = c.height = 34; drawSwatch(c.getContext("2d"), p.skin, 17, 17, 12);
    return `<div class="lrow"><img src="${c.toDataURL()}" width="26" height="26" alt="">
      <span class="lname">${esc(p.name)}${p.id === me.id ? " <b>(you)</b>" : ""}${p.id === ref ? " <em>host</em>" : ""}</span>
      <span class="lready ${p.ready ? "y" : ""}">${p.ready ? "ready" : "\u2026"}</span></div>`;
  }).join("");
  const amRef = G.room.amReferee();
  $("startBtn").hidden = !amRef; $("startBtn").disabled = false;
  $("readyHint").textContent = amRef ? "You're the host \u2014 start when everyone's in." : "Waiting for the host to start\u2026";
}
function onState(p) {
  if (!p || p.id === me.id) return;
  let g = G.ghosts.get(p.id);
  if (!g) { g = makeGhost({ id: p.id, name: p.name || "P", skin: p.skin || "classic" }); G.ghosts.set(p.id, g); }
  g.buf.push({ t: performance.now(), x: p.x, z: p.z }); if (g.buf.length > 12) g.buf.shift();
  g.vx = p.vx; g.vz = p.vz; g.moving = p.moving; g.holed = p.holed; g.hole = p.hole; if (p.skin) g.skin = p.skin;
}
function sampleGhost(g, now) {
  const target = now - INTERP, b = g.buf;
  if (!b.length) return;
  let nx = g.x, nz = g.z;
  if (b.length === 1) { nx = b[0].x; nz = b[0].z; }
  else {
    let done = false;
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].t <= target && b[i].t >= target) {
        const a = (target - b[i - 1].t) / (b[i].t - b[i - 1].t || 1);
        nx = b[i - 1].x + (b[i].x - b[i - 1].x) * a; nz = b[i - 1].z + (b[i].z - b[i - 1].z) * a; done = true; break;
      }
    }
    if (!done) { const last = b[b.length - 1]; nx = last.x; nz = last.z; }
  }
  // velocity derived from the SHOWN (delayed) path so pos+vel stay in sync — a fast
  // ghost sweeping through your ball then reliably registers as an approach (real bump).
  const dt = (now - (g.pt || now)) / 1000;
  if (dt > 0 && dt < 0.2) { g.svx = (nx - g.x) / dt; g.svz = (nz - g.z) / dt; }
  g.x = nx; g.z = nz; g.pt = now;
}
function applyFlow(f) {
  if (!f) return;
  if (Array.isArray(f.order) && f.order.length) G.order = f.order.slice();
  if (f.type === "start") { if (G.phase !== "playing") { G.total = 0; startPlayingOnline(f.hole || 0); } }
  else if (f.type === "hole") {
    const midJoin = G.phase !== "playing";
    if (f.hole > G.holeIdx || midJoin) {
      if (midJoin) G.total = parThrough(f.hole);        // credit missed holes as par (mirrors onPlayers mid-join)
      startPlayingOnline(f.hole);
      if (midJoin && G.room) G.room.setPresence({ total: G.total }); // so peers score you correctly too
    }
  }
  else if (f.type === "end") { onlineEnd(); }
}
function refSend(f) { G.room.sendFlow(f); applyFlow(f); }
function startPlayingOnline(i) {
  G.showcase = false; loadHole(i); G.phase = "playing"; G.advancing = false; G.holeStart = performance.now();
  G.room.setPresence({ ready: true, playing: true, sunk: false, strokes: 0, hole: i, order: G.order });
  setHud(true); hideOverlays(); updateMiniboard();
}
function onlineLocalHoled() {
  G.holed = true; G.total += G.strokes;
  G.room.setPresence({ sunk: true, strokes: G.strokes, total: G.total });
  $("toast").hidden = false; $("toast").textContent = "In the hole! Waiting for others\u2026";
  updateMiniboard();
}
function refereeTick(now) {
  if (G.mode !== "online" || G.phase !== "playing" || !G.room || !G.room.amReferee() || G.advancing) return;
  const ps = G.players;
  const allSunk = ps.length > 0 && ps.every(p => p.id === me.id ? G.holed : p.sunk);
  const timedOut = now - G.holeStart > HOLE_TIMEOUT;
  if (allSunk || timedOut) {
    G.advancing = true;
    setTimeout(() => {
      if (G.holeIdx >= matchLen() - 1) refSend({ type: "end", order: G.order });
      else refSend({ type: "hole", hole: G.holeIdx + 1, order: G.order });
    }, allSunk ? 1600 : 0);
  }
}
function onlineEnd() {
  G.phase = "matchEnd"; setHud(false);
  if (G.room) G.room.setPresence({ playing: false });
  const ranked = [...G.players].map(p => ({ name: p.name, total: p.total || 0, rel: relOf(p), me: p.id === me.id })).sort((a, b) => a.rel - b.rel);
  const winner = ranked[0];
  $("endTitle").textContent = winner ? (winner.me ? "You win! \u{1F3C6}" : esc(winner.name) + " wins") : "Round complete";
  $("endVerdict").textContent = winner ? winner.total + " strokes" : ""; $("endVerdict").className = "verdict";
  let rows = "<tr><th>#</th><th>Player</th><th>Total</th><th>to Par</th></tr>";
  rows += ranked.map((r, i) => { const d = r.rel; return `<tr class="${r.me ? "mine" : ""}"><td class="h">${i + 1}</td><td style="text-align:left">${esc(r.name)}${r.me ? " (you)" : ""}</td><td>${r.total}</td><td class="${d < 0 ? "u" : d > 0 ? "o" : "e"}">${fmtSigned(d)}</td></tr>`; }).join("");
  $("scorecard").innerHTML = rows; show("endScreen"); $("againBtn").firstChild.textContent = "Back to lobby ";
}
function updateMiniboard() {
  const tb = $("tauntBar"); if (tb) tb.hidden = !(G.mode === "online" && G.phase === "playing");
  if (G.mode === "online") updateTotalHud();
  const mb = $("miniboard");
  if (G.mode !== "online" || G.phase === "lobby" || G.phase === "menu") { mb.hidden = true; return; }
  mb.hidden = false;
  mb.innerHTML = G.players.slice().sort((a, b) => relOf(a) - relOf(b)).map(p => {
    const self = p.id === me.id;
    const sunk = self ? G.holed : p.sunk;
    const d = relOf(p), cls = d < 0 ? "u" : d > 0 ? "o" : "e";
    return `<div class="mrow ${self ? "mine" : ""}"><span class="dot ${sunk ? "in" : ""}"></span><span class="mn">${esc(p.name)}</span><b class="${cls}">${fmtSigned(d)}</b></div>`;
  }).join("");
}
function leaveOnline() {
  if (G.room) { G.room.leave(); G.room = null; }
  G.ghosts.forEach(removeGhost); G.ghosts.clear(); G.players = []; G.total = 0;
  backToMenu();
}

// ---------- camera ----------
function updateCamera(t) {
  if (G.showcase || !meta) {
    const midZ = meta ? (meta.cup.z + meta.tee.z) / 2 : 0;
    const rad = meta ? Math.max(meta.bounds[0], meta.bounds[1]) * 0.62 : 16;
    const a = t * 0.16;
    stage.camera.position.set(Math.sin(a) * rad, rad * 0.72, midZ - Math.cos(a) * rad);
    stage.camera.lookAt(0, 0.6, midZ);
    return;
  }
  const bx = ball.position.x, bz = ball.position.z;
  let ax, az;
  if (P.speed(ball) > 1.2) { ax = ball.velocity.x; az = ball.velocity.z; }
  else { ax = meta.cup.x - bx; az = meta.cup.z - bz; }
  if (G.camYaw) { const c = Math.cos(G.camYaw), s = Math.sin(G.camYaw), nx = ax * c - az * s, nz = ax * s + az * c; ax = nx; az = nz; }
  const portrait = innerHeight > innerWidth;
  V.chaseCam(stage.camera, bx, bz, ax, az, portrait ? 8.7 : 7.6, portrait ? 6.1 : 5.2, 0.09);
  if (G.shake > 0.02) { stage.camera.position.x += (Math.random() - .5) * G.shake; stage.camera.position.y += (Math.random() - .5) * G.shake * .6; }
}

// ---------- on-rails launchers (cannons / spiral loops) ----------
// Deterministic scripted flight — the ball leaves the sim, rides makeFlight's
// path, then re-enters dynamic with landVel. Guarantees bug-free traversal and
// still broadcasts ball.position each frame so peers see the arc.
function maybeLaunch() {
  if (G.launchCool > 0 || !G.moving || !meta.launchers.length) return;
  const i = P.launcherAt(ball, meta);
  if (i < 0) return;
  const f = P.makeFlight(meta.launchers[i], meta, ball);
  if (!f) return;
  G.flight = { f, t: 0 }; acc = 0;
  ball.velocity.setZero(); ball.angularVelocity.setZero();
  G.moving = true; G.slowT = 0;
  sfx.woosh(); sfx.boom(0.7); buzz([14, 24, 36]);
  G.shake = Math.max(G.shake, 0.6);
  if (burst) burst.pop(ball.position.x, ball.position.z, "#ffd166", 1.8);
  if (courseGroup && courseGroup.userData.fireLauncher) courseGroup.userData.fireLauncher(i);
}
function advanceFlight(dt) {
  const fl = G.flight; fl.t += dt; acc = 0;
  const u = Math.min(1, fl.t / fl.f.dur), p = fl.f.at(u);
  ball.position.set(p.x, p.y, p.z);
  ball.velocity.setZero(); ball.angularVelocity.setZero();
  if (localTrail && u < 0.98) localTrail.push(new THREE.Vector3(p.x, p.y, p.z), true);
  if (u >= 1) {
    const lv = fl.f.landVel;
    ball.velocity.set(lv.x, 0, lv.z);
    ball.angularVelocity.set(lv.z / R, 0, -lv.x / R);   // pre-spin like a real shot
    G.flight = null; G.launchCool = 0.5; G.slowT = 0;
    G.shake = Math.max(G.shake, 0.28); sfx.boom(0.4); buzz(20);
    if (burst) burst.pop(p.x, p.z, "#a0e8ff", 1.2);
  }
}

// ---------- main loop ----------
let last = performance.now(), acc = 0;
const FIXED = 1 / 120, MAX_CATCHUP = 0.25;
function frame(now) {
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(raw, 0.05);   // visual delta (trails, ripple, shake)
  const t = now / 1000;

  // local physics — fixed steps driven by REAL elapsed time, so the sim runs at
  // the same speed on a 144Hz desktop or a 30fps phone (frame-rate independent).
  if (G.phase === "playing" && !G.holed && G.sinkT === 0) {
    if (G.launchCool > 0) G.launchCool -= dt;
    if (G.flight) {
      advanceFlight(dt);                 // on-rails ride: skip normal sim this frame
    } else {
      acc = Math.min(acc + raw, MAX_CATCHUP);
      let n = 0;
      while (acc >= FIXED && n < 40 && !G.flight) {
        P.stepWorld(world, ball, meta, FIXED); acc -= FIXED; n++;
        if (G.launchCool <= 0 && G.moving && meta.launchers.length) maybeLaunch(); // per-substep: a fast (post-booster) ball can't tunnel the pad
      }
      for (const g of G.ghosts.values()) if (!g.holed && (g.hole == null || g.hole === G.holeIdx)) bumpMe(ball, g);
      if (!G.flight) {
        const cl = P.classify(ball, meta);
        if (cl.sunk) startSink();
        else if (cl.hazard) hazard(cl.hazard);
        else {
          G.slowT = cl.speed < 0.6 ? G.slowT + dt : 0;   // soft-lock safety net
          G.moving = !cl.resting && G.slowT < 1.4;
        }
      }
    }
  } else acc = 0;

  // sink animation
  if (G.sinkT > 0 && G.sinkT < 1) {
    G.sinkT = Math.min(1, G.sinkT + dt * 2.4);
    const p = G.sinkT, cup = meta.cup, bx = ball.position.x, bz = ball.position.z;
    if (localMesh) {
      localMesh.position.set(bx + (cup.x - bx) * p, 0, bz + (cup.z - bz) * p);
      localMesh.userData.mesh.position.y = R - p * (R + 0.35);
      localMesh.scale.setScalar(1 - p * 0.45);
    }
    if (G.sinkT >= 1) { onHoled(); }
  }

  // sync local ball mesh
  if (localMesh && !G.holed && G.sinkT === 0) {
    localMesh.position.set(ball.position.x, 0, ball.position.z);
    localMesh.userData.mesh.position.y = ball.position.y;
    localMesh.userData.mesh.quaternion.copy(ball.quaternion);
  }
  tickSquash(localMesh, dt);

  // ghosts
  for (const g of G.ghosts.values()) {
    sampleGhost(g, now);
    g.group.position.set(g.x, 0, g.z);
    g.group.visible = !g.holed && (g.hole == null || g.hole === G.holeIdx);
    g.trail.push(new THREE.Vector3(g.x, R, g.z), g.moving);
    g.trail.update(dt);
    tickSquash(g.group, dt);
  }

  // local trail + aim + water
  if (localMesh && G.phase === "playing" && !G.holed) localTrail.push(new THREE.Vector3(ball.position.x, R, ball.position.z), G.moving);
  localTrail.update(dt); if (burst) burst.update(dt);
  if (G.aiming) {
    const power01 = pullPower();
    aim.set(ball.position.x, ball.position.z, G.pull.dx, G.pull.dz, Math.min(power01, 1), true);
    updatePowerMeter(power01, true);
    if (power01 > 0.6) G.shake = Math.max(G.shake, (power01 - 0.6) * 0.14); // charge rumble
  } else updatePowerMeter(0, false);
  V.tickCourse(courseGroup, t);
  G.shake *= 0.9;

  updateCamera(t);

  // network
  if (G.mode === "online" && G.phase === "playing" && G.room && now - G.lastSend > STATE_HZ) {
    G.lastSend = now;
    G.room.sendState({ id: me.id, x: +ball.position.x.toFixed(2), z: +ball.position.z.toFixed(2), vx: +ball.velocity.x.toFixed(2), vz: +ball.velocity.z.toFixed(2), moving: G.moving, holed: G.holed, hole: G.holeIdx, skin: me.skin });
  }
  refereeTick(now);

  stage.render();
  requestAnimationFrame(frame);
}

// ---------- menu wiring ----------
function backToMenu() { G.mode = "menu"; G.phase = "menu"; G.showcase = true; setHud(false); $("nameInput").value = me.name; buildSkinPicker($("skinMenu")); $("netWarn").hidden = Net.online; updateMiniboard(); show("menu"); }
function toggleMute() { G.muted = !G.muted; $("mute").innerHTML = G.muted ? "&#128263;" : "&#128266;"; }

$("soloBtn").onclick = () => { ac(); startSolo(); };
$("createBtn").onclick = () => { ac(); joinRoom(Net.genCode()); };
$("joinBtn").onclick = () => { const c = ($("joinCode").value || "").trim().toUpperCase(); if (c.length >= 3) { ac(); joinRoom(c); } else $("joinCode").focus(); };
$("joinCode").addEventListener("keydown", e => { if (e.key === "Enter") $("joinBtn").click(); });
$("nameInput").addEventListener("input", e => { me.name = e.target.value.slice(0, 14); localStorage.setItem("cholf:name", me.name); });
$("readyBtn").onclick = () => { const r = !($("readyBtn").dataset.on === "1"); $("readyBtn").dataset.on = r ? "1" : "0"; $("readyBtn").classList.toggle("on", r); $("readyBtn").firstChild.textContent = r ? "Ready \u2713 " : "Ready up "; G.room.setPresence({ ready: r }); };
$("startBtn").onclick = () => { G.order = pickOrder(); refSend({ type: "start", hole: 0, order: G.order }); };
$("leaveBtn").onclick = leaveOnline;
$("copyCode").onclick = () => copy(G.roomCode, $("copyCode"));
$("shareBtn").onclick = () => copy(location.origin + location.pathname + "#" + G.roomCode, $("shareBtn"));
$("nextBtn").onclick = soloNext;
$("againBtn").onclick = () => { if (G.mode === "online") { G.total = 0; openLobby(); G.room.setPresence({ ready: false, playing: false, sunk: false, total: 0, strokes: 0 }); } else backToMenu(); };
$("mute").onclick = toggleMute;
$("backBtn").onclick = () => { if (G.mode === "online") leaveOnline(); else backToMenu(); };
function copy(text, btn) { if (navigator.clipboard) navigator.clipboard.writeText(text); const o = btn.textContent; btn.textContent = "Copied!"; setTimeout(() => btn.textContent = o, 1200); }

// ---------- boot ----------
setLocalSkin(me.skin);
localTrail = new V.Trail(stage.scene, C.skinById(me.skin).accent);
aim = new V.Aim(stage.scene);
burst = new V.Burst(stage.scene);
loadHole(0); G.phase = "menu"; G.showcase = true;
G.order = C.COURSES.map((_, i) => i);
document.querySelector(".hud.tl small").textContent = " / " + MATCH_HOLES;
const mEye = $("menu").querySelector(".eyebrow"); if (mEye) mEye.textContent = "Online & Solo \u00b7 random " + MATCH_HOLES + "-hole match";
buildSkinPicker($("skinMenu")); $("nameInput").value = me.name; $("netWarn").hidden = Net.online; show("menu"); buildTauntBar();
const hash = (location.hash || "").replace("#", "").toUpperCase();
if (hash && /^[A-Z0-9]{3,6}$/.test(hash)) $("joinCode").value = hash;

// verify/debug hook — deterministic shots for the headless test harness. Harmless
// in a peer party game with no server authority; not used by real input.
window.__cholf = {
  shoot: (dx, dz, power) => { G.origin = [ball.position.x, ball.position.z]; P.shoot(ball, dx, dz, power == null ? P.MAX_SHOT * 0.5 : power); G.moving = true; G.strokes++; $("strokes").textContent = G.strokes; },
  aimCup: power => { const dx = meta.cup.x - ball.position.x, dz = meta.cup.z - ball.position.z; window.__cholf.shoot(dx, dz, power); },
  place: (x, z) => P.placeBall(ball, x, z),
  cup: () => ({ x: meta.cup.x, z: meta.cup.z }),
  pos: () => ({ x: ball.position.x, y: ball.position.y, z: ball.position.z, sp: P.speed(ball) }),
  ballScreen: () => { const v = new THREE.Vector3(ball.position.x, ball.position.y, ball.position.z).project(stage.camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }; },
  taunt: e => sendTaunt(e || "\u{1F525}"),
  ghostCount: () => G.ghosts.size,
  // inject a synthetic ghost with a SET position + sampled velocity (empty buffer =>
  // sampleGhost leaves these intact) so bumpMe runs deterministically, no network/throttle.
  fakeGhost: (x, z, svx, svz) => {
    let g = G.ghosts.get("FAKE");
    if (!g) { g = makeGhost({ id: "FAKE", name: "Dummy", skin: me.skin }); G.ghosts.set("FAKE", g); }
    g.buf.length = 0; g.x = x; g.z = z; g.svx = svx || 0; g.svz = svz || 0;
    g.moving = Math.hypot(svx || 0, svz || 0) > 0.1; g.holed = false; g.hole = G.holeIdx;
    return true;
  },
  clearGhosts: () => { for (const g of G.ghosts.values()) removeGhost(g); G.ghosts.clear(); },
  bumpTauntAt: () => lastBumpTaunt,
  dbg: () => ({ st: ball.sleepState, sp: P.speed(ball), x: ball.position.x, z: ball.position.z, allow: ball.allowSleep }),
  // one-shot, synchronous exercise of the aggressor branch (no frame loop / sleep / tunneling):
  // park a resting ghost in contact range, charge my ball into it, run bumpMe once.
  aggroProbe: () => {
    P.placeBall(ball, 0, 0);
    let g = G.ghosts.get("FAKE"); if (!g) { g = makeGhost({ id: "FAKE", name: "Dummy", skin: me.skin }); G.ghosts.set("FAKE", g); }
    g.buf.length = 0; g.x = 0; g.z = -0.55; g.svx = 0; g.svz = 0; g.holed = false; g.hole = G.holeIdx;
    ball.wakeUp(); ball.velocity.set(0, 0, -14);
    const before = lastBumpTaunt;
    bumpMe(ball, g);
    return { vz: ball.velocity.z, sp: P.speed(ball), taunted: lastBumpTaunt > before };
  },
  hole: i => { G.mode = G.mode || "solo"; G.order = C.COURSES.map((_, k) => k); loadHole(i); G.phase = "playing"; setHud(true); hideOverlays(); return C.COURSES[i].name; },
  count: () => C.COURSES.length,
  order: () => (G.order || []).slice(),
  pars: () => C.COURSES.map(c => c.par),
  cur: () => ({ idx: G.holeIdx, courseI: hIdx(G.holeIdx), name: curCourse().name, par: curCourse().par, len: matchLen() }),
  parTotal: () => parThrough(matchLen()),
  startSolo: () => { startSolo(); return (G.order || []).slice(); },
  courseObjs: () => ({ meshes: courseGroup.children.length, launchers: (meta.launchers || []).length, movers: (meta.movers || []).length }),
  moverSample: () => { const mv = courseGroup && courseGroup.userData.movers; if (!mv || !mv.length) return null; const p = new THREE.Vector3(); mv[0].group.children[0].getWorldPosition(p); return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) }; },
};

requestAnimationFrame(frame);
