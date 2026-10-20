// engine3d.js — Three.js renderer for Cholf 3D. Builds a themed course, the
// ball(s), a glowing ground-trail and a chase camera from the same course specs
// physics.js simulates. Browser-only (needs WebGL); imported via the page's
// import map ("three").

import * as THREE from "three";
import { THEMES, skinById, moverSegments } from "./courses.js";

const col = h => new THREE.Color(h);
const R = 0.36;

// ---------- stage ----------
export function initStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
  camera.position.set(0, 10, -14);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-14, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.near = 1; sc.far = 80; sc.left = -22; sc.right = 22; sc.top = 26; sc.bottom = -26;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();

  return { scene, camera, renderer, sun, hemi, resize, render: () => renderer.render(scene, camera) };
}

// vertical gradient sky as the scene background
function skyTexture(top, bot) {
  const c = document.createElement("canvas"); c.width = 4; c.height = 256;
  const g = c.getContext("2d").createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// gradient + sprinkled stars for moon/space/ship themes
function starSkyTexture(top, bot) {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 240; i++) {
    ctx.globalAlpha = 0.35 + Math.random() * 0.6; ctx.fillStyle = Math.random() < 0.12 ? "#bfe0ff" : "#ffffff";
    ctx.beginPath(); ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 1.4 + 0.2, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// mown-grass stripes for the fairway
function grassTexture(a, b) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const ctx = c.getContext("2d");
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(0, i * 16, 128, 16); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function applyTheme(stage, themeName) {
  const T = THEMES[themeName] || THEMES.beach;
  stage.scene.background = T.space ? starSkyTexture(T.skyTop, T.skyBot) : skyTexture(T.skyTop, T.skyBot);
  stage.scene.fog = new THREE.Fog(col(T.fog), 34, 120);
  stage.hemi.color = col(T.skyTop); stage.hemi.groundColor = col(T.amb);
  stage.sun.color = col(T.sun);
  return T;
}

// ---------- materials ----------
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: col(c), roughness: 0.85, metalness: 0, ...o });

// helix path for spiral-loop launchers — mirrors physics makeFlight climb
// (radius shrinks by 1-0.14t as the ball winds up the tower).
class Helix extends THREE.Curve {
  constructor(cx, cz, r, y0, y1, a0, turns, dir) { super(); Object.assign(this, { cx, cz, r, y0, y1, a0, turns, dir }); }
  getPoint(t, target = new THREE.Vector3()) {
    const ang = this.a0 + this.dir * this.turns * Math.PI * 2 * t, rr = this.r * (1 - 0.14 * t);
    return target.set(this.cx + Math.cos(ang) * rr, this.y0 + (this.y1 - this.y0) * t, this.cz + Math.sin(ang) * rr);
  }
}
// scrolling chevrons for booster speed-strips
function chevronTexture(color) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const ctx = c.getContext("2d"); ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = color; ctx.lineWidth = 11; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const oy of [8, 40]) { ctx.beginPath(); ctx.moveTo(10, oy + 18); ctx.lineTo(32, oy); ctx.lineTo(54, oy + 18); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
// glowing entry-pad ring for a launcher
function padRing(g, x, y, z, T) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 10, 30),
    std(T.railTop, { emissive: col(T.railTop), emissiveIntensity: 0.28, roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(x, y + 0.08, z); g.add(ring);
}

// ---------- course ----------
export function buildCourse(course) {
  const T = THEMES[course.theme] || THEMES.beach;
  const g = new THREE.Group();
  const [W, L] = course.bounds;

  // surrounding ground so the arena doesn't float in the void
  const groundMat = std(course.theme === "beach" ? T.rough : T.rough, { roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.35; ground.receiveShadow = true;
  g.add(ground);

  // fairway floor(s)
  const grass = grassTexture(T.fair, T.fairEdge);
  const floors = course.floors || [[0, 0, W, L]];
  const causeways = course.causeway || [];
  for (const [x, z, w, l, h = 0] of [...floors, ...causeways]) {
    const tex = grass.clone(); tex.needsUpdate = true; tex.repeat.set(w / 3, l / 3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, l), std("#ffffff", { map: tex, roughness: 0.9 }));
    m.position.set(x, h - 0.6, z); m.receiveShadow = true;
    g.add(m);
    // soft bevel ring so edges read as raised turf
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 1.18, l + 0.12), std(T.fairEdge, { roughness: 1 }));
    edge.position.set(x, h - 0.62, z); g.add(edge);
    // support skirt so a raised green doesn't float in the air
    if (h > 0.3) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, h + 0.6, l - 0.2), std(T.fairEdge, { roughness: 1 }));
      skirt.position.set(x, (h - 0.6) / 2, z); skirt.receiveShadow = true; g.add(skirt);
    }
  }

  // ---- ramps: real tilted boards (geometry MUST match physics addRamp) ----
  const FT = 1.2;
  for (const [x, z, w, l, y0, y1, axis = "z"] of course.ramps || []) {
    const span = axis === "x" ? w : l;
    const th = Math.atan2(y1 - y0, span);
    const bx = axis === "x" ? span / Math.cos(th) : w;
    const bz = axis === "x" ? l : span / Math.cos(th);
    const cy = (y0 + y1) / 2 - (FT / 2) * Math.cos(th);
    const tex = grass.clone(); tex.needsUpdate = true; tex.repeat.set(bx / 3, bz / 3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(bx, FT, bz), std("#ffffff", { map: tex, roughness: 0.9 }));
    m.position.set(x, cy, z);
    if (axis === "x") m.rotation.z = th; else m.rotation.x = -th;
    m.castShadow = true; m.receiveShadow = true; g.add(m);
    // bright kicker stripe at the crest so the ramp reads as a launch
    const kw = axis === "x" ? 0.32 : bx, kl = axis === "x" ? bz : 0.32;
    const kick = new THREE.Mesh(new THREE.BoxGeometry(kw, 0.14, kl),
      std(T.railTop, { emissive: col(T.railTop), emissiveIntensity: 0.3, roughness: 0.4 }));
    kick.position.set(axis === "x" ? bx / 2 - 0.16 : 0, FT / 2 + 0.02, axis === "x" ? 0 : bz / 2 - 0.16);
    m.add(kick);
  }

  // ---- boosters: glowing chevron speed-strips ----
  g.userData.boosters = [];
  for (const b of course.boosters || []) {
    const [cx, cz, w, l, dx = 0, dz = 1] = b;
    const ang = Math.atan2(dx, dz);
    const tex = chevronTexture(T.railTop); tex.repeat.set(1, Math.max(1, Math.round(l / 1.5)));
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, l),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    strip.rotation.x = -Math.PI / 2;
    const grp = new THREE.Group(); grp.add(strip); grp.position.set(cx, 0.06, cz); grp.rotation.y = ang + Math.PI;
    grp.renderOrder = 3; g.add(grp);
    g.userData.boosters.push({ tex, speed: 1.7 });
  }

  // ---- tunnels: cosmetic arch ribs (ball rolls through; walls do collision) ----
  for (const [x, z, w, l, rot = 0] of course.tunnels || []) {
    const ribs = Math.max(2, Math.round(l / 1.1));
    const ribMat = std(T.rail, { roughness: 0.55, metalness: 0.12 });
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = rot * Math.PI / 180;
    for (let s = 0; s <= ribs; s++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(w / 2, 0.16, 8, 22, Math.PI), ribMat);
      rib.position.z = -l / 2 + (l * s) / ribs; rib.castShadow = true; grp.add(rib);
    }
    g.add(grp);
  }

  // ---- launchers: cannons (ballistic) + spiral loops ----
  g.userData.launchers = [];
  for (const L of course.launchers || []) {
    const by = L.by || 0;
    if (L.type === "spiral") {
      const cx = L.cx == null ? L.x : L.cx, cz = L.cz == null ? L.z : L.cz;
      const radius = L.radius == null ? 2.4 : L.radius, turns = L.turns == null ? 1.5 : L.turns;
      const topY = L.topY == null ? 6 : L.topY, dir = L.ccw ? 1 : -1;
      const a0 = Math.atan2(L.z - cz, L.x - cx);
      const curve = new Helix(cx, cz, radius, by + R, topY, a0, turns, dir);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 110, 0.5, 10, false), std(T.rail, { roughness: 0.5, metalness: 0.15 })));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 110, 0.34, 8, false), std(T.fair, { roughness: 0.9 })));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, topY + 0.4, 12), std("#cfd6da", { roughness: 0.4, metalness: 0.3 }));
      pole.position.set(cx, (topY + 0.4) / 2 + by, cz); pole.castShadow = true; g.add(pole);
      const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1),
        std("#fff2b0", { emissive: col("#ffe27a"), emissiveIntensity: 0.7, roughness: 0.3 }));
      lamp.position.set(cx, topY + by + 0.72, cz); g.add(lamp);
      const halo = new THREE.PointLight(0xffe27a, 0.7, 11); halo.position.copy(lamp.position); g.add(halo);
      padRing(g, L.x, by, L.z, T);
      g.userData.launchers.push({ type: "spiral", lamp, flash: 0 });
    } else {
      const ang = Math.atan2(L.tz - L.z, L.tx - L.x), el = Math.PI / 4, Lb = 2.3;
      const pivot = new THREE.Group(); pivot.position.set(L.x, by + 0.5, L.z); g.add(pivot);
      const dvec = new THREE.Vector3(Math.cos(el) * Math.cos(ang), Math.sin(el), Math.cos(el) * Math.sin(ang)).normalize();
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dvec);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, Lb, 22), std("#3a4148", { roughness: 0.5, metalness: 0.4 }));
      barrel.position.y = Lb / 2; barrel.castShadow = true; pivot.add(barrel);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.16, 22), std(T.railTop, { roughness: 0.4 }));
      band.position.y = Lb * 0.72; pivot.add(band);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 10, 24), std("#ffd166", { emissive: col("#ffb703"), emissiveIntensity: 0.35, roughness: 0.4 }));
      muzzle.rotation.x = Math.PI / 2; muzzle.position.y = Lb; pivot.add(muzzle);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 1.0, 18), std("#2b3036", { roughness: 0.6, metalness: 0.3 }));
      drum.position.set(L.x, by + 0.5, L.z); drum.castShadow = true; g.add(drum);
      padRing(g, L.x, by, L.z, T);
      g.userData.launchers.push({ type: "cannon", barrel, muzzle, barrelY: Lb / 2, recoil: 0, flash: 0 });
    }
  }

  // sand
  for (const [x, z, w, l] of course.sand || []) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, l), std(T.sand, { roughness: 1 }));
    s.position.set(x, 0.03, z); s.receiveShadow = true; g.add(s);
  }

  // water (translucent) + foam edge
  for (const [x, z, w, l] of course.water || []) {
    const foam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.1, l + 0.5), std("#eaffff", { roughness: 0.6 }));
    foam.position.set(x, 0.02, z); g.add(foam);
    const wat = new THREE.Mesh(new THREE.PlaneGeometry(w, l),
      new THREE.MeshStandardMaterial({ color: col(T.water), roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.86 }));
    wat.rotation.x = -Math.PI / 2; wat.position.set(x, 0.10, z);
    wat.userData.wave = true; g.add(wat);
  }

  // rails: internal + perimeter
  const railMat = std(T.rail, { roughness: 0.8 }); const capMat = std(T.railTop, { roughness: 0.7 });
  const addRail = (x, z, w, l) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, l), railMat);
    body.position.set(x, 0.62, z); body.castShadow = true; body.receiveShadow = true; g.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.18, l + 0.08), capMat);
    cap.position.set(x, 1.32, z); cap.castShadow = true; g.add(cap);
  };
  for (const [x, z, w, l] of course.walls || []) addRail(x, z, w, l);
  if (course.perimeter !== false) {
    addRail(0, L / 2, W, 0.6); addRail(0, -L / 2, W, 0.6);
    addRail(W / 2, 0, 0.6, L); addRail(-W / 2, 0, 0.6, L);
  }

  // bumpers
  for (const [x, z, r] of course.bumpers || []) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 1.05, 20),
      std(T.railTop, { roughness: 0.35, metalness: 0.1, emissive: col("#ffffff"), emissiveIntensity: 0.05 }));
    post.position.set(x, 0.52, z); post.castShadow = true; g.add(post);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.08, 10, 24),
      std("#ff5d73", { roughness: 0.4, emissive: col("#ff5d73"), emissiveIntensity: 0.35 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.9, z); g.add(ring);
  }

  // ---- gravity wells: a swirling accretion vortex (physics pulls the ball; this shows why) ----
  g.userData.wells = [];
  for (const w of course.wells || []) {
    const [wx, wz, , rad = 6.5] = w;
    const grp = new THREE.Group(); grp.position.set(wx, 0, wz);
    // faint pull-field footprint on the ground so the danger radius reads
    const disc = new THREE.Mesh(new THREE.CircleGeometry(rad, 48),
      new THREE.MeshBasicMaterial({ color: col("#3a1d6e"), transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; disc.renderOrder = 2; grp.add(disc);
    // event horizon core
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 16),
      std("#05030c", { roughness: 0.35, metalness: 0.5, emissive: col("#1a0a3a"), emissiveIntensity: 0.5 }));
    core.position.y = 0.72; grp.add(core);
    // accretion rings (spun in tickCourse)
    const rings = [], ringCols = ["#c6a3ff", "#7a4bff", "#4bd6ff"];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.72, 0.09 - i * 0.016, 10, 42),
        std(ringCols[i], { emissive: col(ringCols[i]), emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.2 }));
      ring.rotation.x = Math.PI / 2 - 0.55 + i * 0.2; ring.position.y = 0.72; grp.add(ring);
      rings.push({ mesh: ring, spd: 1.5 - i * 0.35 });
    }
    const glow = new THREE.PointLight(0x8a5bff, 0.85, rad * 2.2); glow.position.set(0, 1.15, 0); grp.add(glow);
    g.add(grp);
    g.userData.wells.push({ rings });
  }

  // movers: moving obstacles (rotor / slider / pendulum / orbiter). Meshes are
  // placed every frame from moverSegments(), the SAME function physics collides
  // against — so the blade you see is the blade that hits you.
  g.userData.movers = [];
  for (const m of course.movers || []) {
    const built = buildMover(m, T);
    g.add(built.group);
    g.userData.movers.push(built);
  }

  // cup + flag
  const cup = new THREE.Group(); cup.position.set(course.cup[0], course.cup[2] || 0, course.cup[1]);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 24), std("#0b120e", { roughness: 1 }));
  hole.position.y = 0.02; cup.add(hole);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 28), std("#f2f6f2"));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.06; cup.add(rim);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), std("#f4f6f5"));
  pole.position.y = 1.3; pole.castShadow = true; cup.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), std("#ff5d5d", { side: THREE.DoubleSide, roughness: 0.6 }));
  flag.position.set(0.45, 2.35, 0); cup.add(flag);
  cup.userData.flag = flag;
  g.add(cup);

  // decor
  for (const d of course.decor || []) { const m = buildDecor(d, T); if (m) g.add(m); }

  g.userData.dispose = () => disposeTree(g);
  g.userData.waters = g.children.filter(c => c.userData.wave);
  g.userData.flag = flag;
  g.userData.fireLauncher = (i) => {
    const o = g.userData.launchers[i]; if (!o) return;
    if (o.type === "cannon") { o.recoil = 1; o.flash = 1; } else { o.flash = 1; }
  };
  return g;
}

// ---------- movers (moving obstacles) ----------
function segLen(s) { return Math.hypot(s.bx - s.ax, s.bz - s.az); }
function placeBar(mesh, s) {
  mesh.position.set((s.ax + s.bx) / 2, s.y, (s.az + s.bz) / 2);
  mesh.rotation.y = Math.atan2(-(s.bz - s.az), s.bx - s.ax);   // local +X aligns to the segment
}
// Build a mover's meshes + an update(t) closure that re-poses them from moverSegments.
function buildMover(m, T) {
  const group = new THREE.Group();
  const y = m.y == null ? 0.7 : m.y;
  const bars = [];
  const metalMat = std(T.rail, { roughness: 0.5, metalness: 0.35 });
  const glowMat = std(T.railTop, { emissive: col(T.railTop), emissiveIntensity: 0.5, roughness: 0.4 });

  if (m.type === "orbiter" || m.type === "pendulum") {
    const r = m.r == null ? (m.type === "pendulum" ? 0.7 : 0.6) : m.r;
    const bob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1),
      std("#c9ccd2", { roughness: 0.6, metalness: 0.35, emissive: col(T.railTop), emissiveIntensity: 0.12, flatShading: true }));
    bob.castShadow = true; group.add(bob); bars.push(bob);
    if (m.type === "pendulum") {
      const ph = y + 2.4;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, ph, 10), std("#cfd6da", { roughness: 0.4, metalness: 0.4 }));
      post.position.set(m.x, ph / 2, m.z); post.castShadow = true; group.add(post);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), metalMat);
      group.add(arm);
      group.userData.arm = arm; group.userData.pivot = new THREE.Vector3(m.x, ph - 0.2, m.z);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(m.radius == null ? 3 : m.radius, 0.05, 8, 64),
        new THREE.MeshBasicMaterial({ color: col(T.railTop), transparent: true, opacity: 0.22 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(m.cx, y, m.cz); group.add(ring);
    }
  } else {                                                     // rotor / slider -> a box per segment
    const segs0 = moverSegments(m, 0);
    const r = m.r == null ? (m.type === "rotor" ? 0.3 : 0.4) : m.r;
    for (const s of segs0) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.max(segLen(s), 0.4), r * 2, r * 2),
        m.type === "rotor" ? glowMat : metalMat);
      bar.castShadow = true; group.add(bar); bars.push(bar);
    }
    if (m.type === "rotor") {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.7, y + 0.4, 14), std("#cfd6da", { roughness: 0.4, metalness: 0.4 }));
      hub.position.set(m.x, (y + 0.4) / 2, m.z); hub.castShadow = true; group.add(hub);
    }
  }

  const _v = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
  const update = (t) => {
    const segs = moverSegments(m, t);
    for (let i = 0; i < bars.length && i < segs.length; i++) {
      const s = segs[i];
      if (m.type === "orbiter" || m.type === "pendulum") {
        bars[i].position.set(s.bx, s.y, s.bz);
        if (m.type === "pendulum" && group.userData.arm) {
          const pv = group.userData.pivot, arm = group.userData.arm;
          arm.position.set((pv.x + s.bx) / 2, (pv.y + s.y) / 2, (pv.z + s.bz) / 2);
          _v.set(s.bx - pv.x, s.y - pv.y, s.bz - pv.z);
          const len = _v.length() || 1; arm.scale.y = len;
          arm.quaternion.setFromUnitVectors(_u, _v.multiplyScalar(1 / len));
        }
      } else placeBar(bars[i], s);
    }
  };
  update(0);
  return { group, update };
}

// ---------- decor ----------
function buildDecor([type, x, z, s = 1, rot = 0], T) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.scale.setScalar(s); grp.rotation.y = rot * Math.PI / 180;
  const wood = std("#8a5a34", { roughness: 0.9 });
  const leaf = std("#3f9d54", { roughness: 0.9, flatShading: true });
  const cast = m => { m.castShadow = true; return m; };
  if (type === "palm") {
    const trunk = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.6, 8), std("#b8895a", { roughness: 0.9 })));
    trunk.position.y = 1.3; trunk.rotation.z = 0.12; grp.add(trunk);
    for (let i = 0; i < 6; i++) {
      const fr = cast(new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), std("#46b062", { roughness: 0.9, flatShading: true })));
      fr.scale.set(1.5, 0.18, 0.5); fr.position.set(Math.cos(i / 6 * 6.28) * 0.5, 2.6, Math.sin(i / 6 * 6.28) * 0.5);
      fr.rotation.y = i / 6 * 6.28; fr.rotation.z = -0.5; grp.add(fr);
    }
    for (let i = 0; i < 3; i++) { const co = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), wood); co.position.set(Math.cos(i) * 0.18, 2.42, Math.sin(i) * 0.18); grp.add(co); }
  } else if (type === "pine") {
    const tr = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.8, 7), wood)); tr.position.y = 0.4; grp.add(tr);
    const cols = ["#2f8f4a", "#37a054", "#42b061"];
    for (let i = 0; i < 3; i++) {
      const cone = cast(new THREE.Mesh(new THREE.ConeGeometry(1.05 - i * 0.28, 1.1, 8), std(cols[i], { roughness: 0.9, flatShading: true })));
      cone.position.y = 1.0 + i * 0.7; grp.add(cone);
    }
  } else if (type === "rock") {
    const r = cast(new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), std("#9aa2a6", { roughness: 1, flatShading: true })));
    r.position.y = 0.35; r.rotation.set(0.4, 0.7, 0.2); r.scale.set(1.2, 0.9, 1.1); grp.add(r);
  } else if (type === "log") {
    const lg = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.7, 12), wood)); lg.rotation.z = Math.PI / 2; lg.position.y = 0.32; grp.add(lg);
    for (const e of [-0.85, 0.85]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), std("#c99a6a")); cap.rotation.y = Math.PI / 2; cap.position.set(e, 0.32, 0); grp.add(cap); }
  } else if (type === "umbrella") {
    const p = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), std("#eeeeee"))); p.position.y = 1.1; grp.add(p);
    const top = cast(new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.7, 12), std("#ff6f61", { roughness: 0.6 }))); top.position.y = 2.25; grp.add(top);
  } else if (type === "lighthouse") {
    for (let i = 0; i < 4; i++) { const seg = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.5 - i * 0.06, 0.56 - i * 0.06, 0.9, 12), std(i % 2 ? "#ff5d5d" : "#f4f6f5", { roughness: 0.7 }))); seg.position.y = 0.45 + i * 0.9; grp.add(seg); }
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 12), std("#fff2b0", { emissive: col("#ffe27a"), emissiveIntensity: 0.7 })); light.position.y = 4.05; grp.add(light);
    const roof = cast(new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.5, 12), std("#3a3f45"))); roof.position.y = 4.5; grp.add(roof);
  } else if (type === "boat") {
    const hull = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.32, 1.9, 8, 1, false, 0, Math.PI), std("#c65b3a", { roughness: 0.8 })));
    hull.rotation.set(Math.PI / 2, 0, Math.PI / 2); hull.position.y = 0.35; grp.add(hull);
    const mast = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), std("#eeeeee"))); mast.position.y = 1.0; grp.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), std("#f4f6f5", { side: THREE.DoubleSide })); sail.position.set(0.3, 1.0, 0); grp.add(sail);
  } else if (type === "mushroom") {
    const st = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), std("#f0e8d8"))); st.position.y = 0.25; grp.add(st);
    const cap = cast(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8, 0, 6.3, 0, 1.57), std("#e0524f", { roughness: 0.6 }))); cap.position.y = 0.5; grp.add(cap);
  } else if (type === "crystal") {
    const spike = (h, w, dx, dz, rz) => { const c = cast(new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), std("#bfe9ff", { roughness: 0.15, metalness: 0.1, emissive: col("#8fd6ff"), emissiveIntensity: 0.28, flatShading: true }))); c.position.set(dx, h / 2, dz); c.rotation.z = rz; grp.add(c); };
    spike(1.5, 0.32, 0, 0, 0); spike(0.95, 0.2, 0.32, 0.1, 0.3); spike(0.7, 0.16, -0.28, -0.08, -0.28);
  } else if (type === "planet") {
    const p = cast(new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 16), std(T.water, { roughness: 0.55, metalness: 0.25, emissive: col(T.water), emissiveIntensity: 0.14 }))); p.position.y = 3.6; grp.add(p);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.11, 8, 44), std(T.railTop, { emissive: col(T.railTop), emissiveIntensity: 0.3, roughness: 0.5 }));
    ring.rotation.set(Math.PI / 2.3, 0, 0.4); ring.position.y = 3.6; grp.add(ring);
  } else if (type === "beacon") {
    const post = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 1.8, 10), std("#4a525c", { roughness: 0.5, metalness: 0.4 }))); post.position.y = 0.9; grp.add(post);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), std("#7ef0ff", { emissive: col("#7ef0ff"), emissiveIntensity: 0.9, roughness: 0.3 })); orb.position.y = 1.98; grp.add(orb);
    const halo = new THREE.PointLight(0x7ef0ff, 0.55, 8); halo.position.y = 1.98; grp.add(halo);
  } else return null;
  return grp;
}

// ---------- ball ----------
export function makeBall(skinId) {
  const s = skinById(skinId);
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: col(s.color), roughness: s.rough, metalness: s.metal,
    emissive: col(s.color), emissiveIntensity: s.glow || 0 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 18), mat);
  ball.castShadow = true; grp.add(ball);
  // fake soft contact shadow so it reads on any surface
  const sh = new THREE.Mesh(new THREE.CircleGeometry(R * 1.5, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.015; sh.renderOrder = 1; grp.userData.shadow = sh;
  grp.add(sh);
  grp.userData.mesh = ball; grp.userData.skin = s;
  return grp;
}

// ---------- glowing ground trail ----------
export class Trail {
  constructor(scene, accent) {
    this.scene = scene; this.color = col(accent); this.pool = []; this.i = 0; this.last = new THREE.Vector3();
    const geo = new THREE.CircleGeometry(0.3, 14);
    for (let k = 0; k < 26; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.visible = false; scene.add(m); this.pool.push(m);
    }
  }
  reset(p) { this.last.copy(p); for (const m of this.pool) { m.visible = false; m.material.opacity = 0; } }
  push(p, moving) {
    if (moving && p.distanceTo(this.last) > 0.28) {
      const m = this.pool[this.i % this.pool.length]; this.i++;
      m.position.set(p.x, 0.04, p.z); m.scale.setScalar(1); m.material.opacity = 0.5; m.visible = true;
      this.last.copy(p);
    }
  }
  update(dt) {
    for (const m of this.pool) if (m.visible) {
      m.material.opacity -= dt * 1.1; m.scale.multiplyScalar(1 - dt * 0.9);
      if (m.material.opacity <= 0.02) m.visible = false;
    }
  }
  dispose() { for (const m of this.pool) { this.scene.remove(m); m.material.dispose(); } this.pool = []; }
}

// ---------- aim indicator (dotted power line) ----------
export class Aim {
  constructor(scene) {
    this.scene = scene; this.dots = [];
    const geo = new THREE.CircleGeometry(0.13, 12);
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.visible = false; m.renderOrder = 5; scene.add(m); this.dots.push(m);
    }
  }
  set(px, pz, dx, dz, power01, show) {
    const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
    const c = new THREE.Color().setHSL((1 - power01) * 0.33, 0.9, 0.55); // green→red
    const reach = 1.2 + power01 * 3.2;
    for (let k = 0; k < this.dots.length; k++) {
      const d = this.dots[k]; d.visible = show;
      if (!show) continue;
      const t = (k + 1) / this.dots.length, dist = reach * (k + 1) * 0.42;
      d.position.set(px + dx * dist, 0.05, pz + dz * dist);
      d.scale.setScalar((0.7 + t * 0.9) * (0.8 + power01 * 0.6));
      d.material.color = c; d.material.opacity = 0.95 - t * 0.5;
    }
  }
  hide() { for (const d of this.dots) d.visible = false; }
  dispose() { for (const d of this.dots) { this.scene.remove(d); d.material.dispose(); } this.dots = []; }
}

// ---------- impact burst: expanding shock ring + sparks (the ball-vs-ball "boom") ----------
export class Burst {
  constructor(scene) {
    this.scene = scene; this.rings = []; this.sparks = []; this.ri = 0; this.si = 0;
    const rg = new THREE.RingGeometry(0.42, 0.6, 30);
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.07; m.visible = false; m.renderOrder = 8; scene.add(m);
      this.rings.push({ m, t: 0, life: 1 });
    }
    const sg = new THREE.SphereGeometry(0.1, 6, 5);
    for (let k = 0; k < 60; k++) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = false; m.renderOrder = 8; scene.add(m);
      this.sparks.push({ m, vx: 0, vy: 0, vz: 0, t: 0, life: 1 });
    }
  }
  pop(x, z, accent, power = 1) {
    const c = col(accent); power = Math.max(0.4, Math.min(power, 2));
    const r = this.rings[this.ri++ % this.rings.length];
    r.m.position.set(x, 0.07, z); r.m.material.color.set(c); r.m.material.opacity = 0.95;
    r.m.scale.setScalar(0.35 * power); r.m.visible = true; r.t = 0; r.life = 0.4;
    const n = Math.round(9 + power * 12);
    for (let k = 0; k < n; k++) {
      const s = this.sparks[this.si++ % this.sparks.length];
      const a = Math.random() * Math.PI * 2, sp = (2.4 + Math.random() * 5) * power;
      s.m.position.set(x, 0.22, z); s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; s.vy = 2.4 + Math.random() * 4.5 * power;
      s.m.material.color.set(Math.random() < 0.5 ? c : 0xffffff); s.m.material.opacity = 1;
      s.m.scale.setScalar(0.5 + Math.random() * 0.9); s.m.visible = true; s.t = 0; s.life = 0.32 + Math.random() * 0.3;
    }
  }
  update(dt) {
    for (const r of this.rings) if (r.m.visible) {
      r.t += dt; const p = r.t / r.life;
      r.m.scale.setScalar(0.35 + p * 2.8); r.m.material.opacity = Math.max(0, 0.95 * (1 - p));
      if (p >= 1) r.m.visible = false;
    }
    for (const s of this.sparks) if (s.m.visible) {
      s.t += dt; const p = s.t / s.life; s.vy -= 13 * dt;
      s.m.position.x += s.vx * dt; s.m.position.z += s.vz * dt;
      s.m.position.y = Math.max(0.06, s.m.position.y + s.vy * dt);
      s.m.material.opacity = Math.max(0, 1 - p); s.m.scale.multiplyScalar(1 - dt * 1.1);
      if (p >= 1) s.m.visible = false;
    }
  }
  dispose() {
    for (const r of this.rings) { this.scene.remove(r.m); r.m.material.dispose(); }
    for (const s of this.sparks) { this.scene.remove(s.m); s.m.material.dispose(); }
    this.rings = []; this.sparks = [];
  }
}

// ---------- chase camera ----------
const _v = new THREE.Vector3(), _l = new THREE.Vector3();
export function chaseCam(camera, tx, tz, ax, az, dist, height, lerp) {
  const m = Math.hypot(ax, az) || 1; ax /= m; az /= m;
  _v.set(tx - ax * dist, height, tz - az * dist);
  if (lerp >= 1) camera.position.copy(_v); else camera.position.lerp(_v, lerp);
  _l.set(tx + ax * 1.6, 0.4, tz + az * 1.6);
  camera.lookAt(_l);
}

// animate water ripple, boosters, spiral lamps + cannon recoil; call each frame
export function tickCourse(courseGroup, t) {
  if (!courseGroup) return;
  const ud = courseGroup.userData;
  const dt = ud._lt == null ? 0.016 : Math.min(0.05, t - ud._lt); ud._lt = t;
  const fl = ud.flag;
  if (fl) fl.rotation.y = Math.sin(t * 2) * 0.25;
  for (const w of ud.waters || []) w.position.y = 0.10 + Math.sin(t * 1.6 + w.position.x) * 0.02;
  for (const wl of ud.wells || []) for (const r of wl.rings) r.mesh.rotation.z = t * r.spd;
  for (const b of ud.boosters || []) b.tex.offset.y = (b.tex.offset.y - dt * b.speed + 1) % 1;
  for (const o of ud.launchers || []) {
    if (o.type === "cannon") {
      o.recoil = Math.max(0, o.recoil - dt * 4); o.flash = Math.max(0, o.flash - dt * 3);
      if (o.barrel) o.barrel.position.y = o.barrelY - o.recoil * 0.5;
      if (o.muzzle) o.muzzle.material.emissiveIntensity = 0.35 + o.flash * 2.4;
    } else {
      o.flash = Math.max(0, o.flash - dt * 2);
      if (o.lamp) { o.lamp.rotation.y = t * 1.6; o.lamp.rotation.x = t * 0.8; o.lamp.material.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.15 + o.flash * 1.6; }
    }
  }
  if (ud.movers && ud.movers.length) {
    const mt = Date.now() / 1000;               // same clock physics uses -> mesh matches collision
    for (const m of ud.movers) m.update(mt);
  }
}

function disposeTree(root) {
  root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); } });
}
