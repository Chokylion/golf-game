// app.js — Cholf orchestration: menu, lobby, solo + online loops, netcode glue.
import * as E from "./engine.js";
import * as Net from "./net.js";

const $ = id => document.getElementById(id);
const cv = $("game"), ctx = cv.getContext("2d");
const INTERP = 110, STATE_HZ = 50, HOLE_TIMEOUT = 120000;

let view = E.computeView(innerWidth, innerHeight, 1);
function resize() { const dpr = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; view = E.computeView(innerWidth, innerHeight, dpr); }
addEventListener("resize", resize); resize();

// ---------- persistent identity ----------
const me = {
  id: Net.genId(),
  name: (localStorage.getItem("cholf:name") || "").slice(0, 14),
  skin: localStorage.getItem("cholf:skin") || "classic",
};

// ---------- state ----------
const G = {
  mode: "menu", phase: "menu", holeIdx: 0,
  room: null, players: [], ghosts: new Map(),
  local: E.makeBall(me.id, me.name || "You", me.skin, true),
  soloScores: [], particles: [], shake: 0,
  aim: { active: false, x: 0, y: 0 },
  holeStart: 0, advancing: false, muted: false, lastSend: 0,
};
window.__G = G; // debug/verify hook (harmless; party game has no server authority)

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
};
const hooks = {
  wall: v => { sfx.wall(v); G.shake = Math.max(G.shake, v * .28); },
  splash: () => { sfx.water(); G.shake = Math.max(G.shake, 10); for (let i = 0; i < 16; i++) spawn(G.local.x, G.local.y, "#8fd4ff"); },
  sink: () => { sfx.sink(); G.shake = Math.max(G.shake, 6); const c = E.HOLES[G.holeIdx].cup; for (let i = 0; i < 26; i++) spawn(c[0], c[1], i % 2 ? "#7ef0b0" : "#fff"); },
};
function spawn(x, y, color) { const a = Math.random() * 7, s = 1 + Math.random() * 4; G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, color }); }

// ---------- skin pickers ----------
function buildSkinPicker(el) {
  el.innerHTML = "";
  for (const id of E.SKIN_IDS) {
    const b = document.createElement("button"); b.className = "skin" + (id === me.skin ? " on" : ""); b.dataset.skin = id; b.title = E.SKINS[id].name;
    const c = document.createElement("canvas"); c.width = c.height = 44; const cc = c.getContext("2d"); E.paintBall(cc, id, 22, 22, 13); b.appendChild(c);
    b.onclick = () => { me.skin = id; localStorage.setItem("cholf:skin", id); G.local.skin = id; document.querySelectorAll(".skin").forEach(x => x.classList.toggle("on", x.dataset.skin === id)); if (G.room) G.room.setPresence({ skin: id }); };
    el.appendChild(b);
  }
}

// ---------- overlays ----------
const overlays = ["menu", "lobby", "holeScreen", "endScreen"];
function show(id) { overlays.forEach(o => $(o).hidden = (o !== id)); if (id) $(id).classList.add("open"); }
function hideOverlays() { overlays.forEach(o => $(o).hidden = true); }
function setHud(on) { document.body.classList.toggle("playing", on); }

// ---------- SOLO ----------
function startSolo() {
  G.mode = "solo"; G.soloScores = []; G.ghosts.clear();
  loadHoleLocal(0); setHud(true); hideOverlays();
}
function loadHoleLocal(i) {
  G.holeIdx = i; G.phase = "playing"; G.particles.length = 0;
  E.placeAtTee(G.local, E.HOLES[i]);
  $("holeNo").textContent = i + 1; $("par").textContent = E.HOLES[i].par;
  $("strokes").textContent = 0;
  $("total").textContent = E.fmtTotal(G.soloScores.reduce((s, v, k) => s + v - E.HOLES[k].par, 0));
  $("hint").style.opacity = 1; $("toast").hidden = true;
}
function soloHoleComplete() {
  const h = E.HOLES[G.holeIdx]; G.soloScores[G.holeIdx] = G.local.strokes; G.phase = "holeEnd";
  const diff = G.local.strokes - h.par;
  $("holeEyebrow").textContent = "Hole " + (G.holeIdx + 1) + " complete";
  $("holeStrokesBig").textContent = G.local.strokes;
  const v = $("verdict"); v.textContent = E.scoreName(diff); v.className = "verdict" + (diff > 0 ? (diff >= 2 ? " bad" : " over") : "");
  $("holeSub").textContent = G.local.strokes + (G.local.strokes === 1 ? " stroke" : " strokes") + " \u00b7 Par " + h.par;
  $("nextBtn").firstChild.textContent = G.holeIdx >= E.HOLES.length - 1 ? "See scorecard " : "Next hole ";
  show("holeScreen");
}
function soloNext() { if (G.holeIdx >= E.HOLES.length - 1) return soloEnd(); hideOverlays(); loadHoleLocal(G.holeIdx + 1); }
function soloEnd() {
  G.phase = "matchEnd";
  const total = G.soloScores.reduce((s, v) => s + v, 0), diff = total - E.PAR_TOTAL;
  $("endTitle").textContent = total + " strokes";
  const ev = $("endVerdict"); ev.textContent = diff === 0 ? "Even par" : E.fmtTotal(diff) + " to par"; ev.className = "verdict" + (diff > 0 ? " over" : "");
  let rows = "<tr><th>Hole</th>" + E.HOLES.map((_, i) => "<th>" + (i + 1) + "</th>").join("") + "<th>Tot</th></tr>";
  rows += "<tr><td class='h'>Par</td>" + E.HOLES.map(h => "<td class='h'>" + h.par + "</td>").join("") + "<td class='h'>" + E.PAR_TOTAL + "</td></tr>";
  rows += "<tr><td class='h'>You</td>" + G.soloScores.map((s, i) => { const d = s - E.HOLES[i].par; return "<td class='" + (d < 0 ? "u" : d > 0 ? "o" : "e") + "'>" + s + "</td>"; }).join("") + "<td class='" + (diff < 0 ? "u" : diff > 0 ? "o" : "e") + "'>" + fmtSigned(diff) + "</td></tr>";
  $("scorecard").innerHTML = rows; show("endScreen");
}
function fmtSigned(d) { return d === 0 ? "E" : E.fmtTotal(d); }

// ---------- ONLINE ----------
function joinRoom(code) {
  if (!Net.online) { $("netWarn").hidden = false; return; }
  me.name = ($("nameInput").value || "").trim().slice(0, 14) || "Player"; localStorage.setItem("cholf:name", me.name);
  G.local.name = me.name; G.mode = "online"; G.roomCode = code.toUpperCase();
  G.room = Net.connect(code, me, {
    onPlayers: onPlayers, onState: onState, onFlow: applyFlow,
    onStatus: s => { $("netDot").className = "netdot " + (s === "SUBSCRIBED" ? "ok" : "bad"); },
  });
  openLobby();
}
function openLobby() {
  G.phase = "lobby"; setHud(false);
  $("roomCodeBig").textContent = G.roomCode;
  buildSkinPicker($("skinLobby"));
  show("lobby");
}
function onPlayers(list) {
  G.players = list;
  // sync ghosts to presence (create/remove; keep buffers)
  const ids = new Set(list.map(p => p.id));
  for (const p of list) {
    if (p.id === me.id) continue;
    let g = G.ghosts.get(p.id);
    if (!g) { g = E.makeBall(p.id, p.name, p.skin, false); g.buf = []; const h = E.HOLES[G.holeIdx]; g.x = h.tee[0]; g.y = h.tee[1]; G.ghosts.set(p.id, g); }
    g.name = p.name; g.skin = p.skin; g.sunkP = p.sunk;
  }
  for (const id of [...G.ghosts.keys()]) if (!ids.has(id)) G.ghosts.delete(id);
  if (G.phase === "lobby") renderLobby();
  updateMiniboard();
}
function renderLobby() {
  const ref = G.room.referee();
  $("lobbyList").innerHTML = G.players.map(p => {
    const c = document.createElement("canvas"); c.width = c.height = 34; E.paintBall(c.getContext("2d"), p.skin, 17, 17, 10);
    return `<div class="lrow"><img src="${c.toDataURL()}" width="26" height="26" alt="">
      <span class="lname">${esc(p.name)}${p.id === me.id ? " <b>(you)</b>" : ""}${p.id === ref ? " <em>host</em>" : ""}</span>
      <span class="lready ${p.ready ? "y" : ""}">${p.ready ? "ready" : "\u2026"}</span></div>`;
  }).join("");
  const amRef = G.room.amReferee();
  $("startBtn").hidden = !amRef; $("startBtn").disabled = false;
  $("readyHint").textContent = amRef ? "You're the host \u2014 start when everyone's in." : "Waiting for the host to start\u2026";
}
function esc(s) { return (s || "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }

function onState(p) {
  if (!p || p.id === me.id) return;
  let g = G.ghosts.get(p.id);
  if (!g) { g = E.makeBall(p.id, p.name || "P", p.skin || "classic", false); g.buf = []; G.ghosts.set(p.id, g); }
  g.buf.push({ t: performance.now(), x: p.x, y: p.y }); if (g.buf.length > 12) g.buf.shift();
  g.vx = p.vx; g.vy = p.vy; g.moving = p.moving; g.holed = p.holed; if (p.skin) g.skin = p.skin;
}
function sampleGhost(g, now) {
  const target = now - INTERP, b = g.buf;
  if (!b.length) return;
  if (b.length === 1) { g.x = b[0].x; g.y = b[0].y; return; }
  for (let i = b.length - 1; i > 0; i--) {
    if (b[i - 1].t <= target && b[i].t >= target) {
      const a = (target - b[i - 1].t) / (b[i].t - b[i - 1].t || 1);
      g.x = b[i - 1].x + (b[i].x - b[i - 1].x) * a; g.y = b[i - 1].y + (b[i].y - b[i - 1].y) * a; return;
    }
  }
  const last = b[b.length - 1]; g.x = last.x; g.y = last.y;   // fall back to newest
}

// game-flow (referee-authored, idempotent)
function applyFlow(f) {
  if (!f) return;
  if (f.type === "start") { if (G.phase !== "playing") startPlayingOnline(f.hole || 0); }
  else if (f.type === "hole") { if (f.hole > G.holeIdx || G.phase !== "playing") startPlayingOnline(f.hole); }
  else if (f.type === "end") { onlineEnd(); }
}
function refSend(f) { G.room.sendFlow(f); applyFlow(f); }
function startPlayingOnline(i) {
  G.holeIdx = i; G.phase = "playing"; G.advancing = false; G.holeStart = performance.now(); G.particles.length = 0;
  E.placeAtTee(G.local, E.HOLES[i]);
  for (const g of G.ghosts.values()) { const h = E.HOLES[i]; g.x = h.tee[0]; g.y = h.tee[1]; g.buf = []; g.holed = false; g.trail.length = 0; }
  G.room.setPresence({ ready: true, sunk: false, strokes: 0, hole: i });
  $("holeNo").textContent = i + 1; $("par").textContent = E.HOLES[i].par; $("strokes").textContent = 0;
  $("hint").style.opacity = 1; $("toast").hidden = true;
  setHud(true); hideOverlays(); updateMiniboard();
}
function onlineLocalHoled() {
  G.local.holed = true; G.local.total += G.local.strokes;
  G.room.setPresence({ sunk: true, strokes: G.local.strokes, total: G.local.total });
  $("toast").hidden = false; $("toast").textContent = "In the hole! Waiting for others\u2026";
  updateMiniboard();
}
function refereeTick(now) {
  if (G.mode !== "online" || G.phase !== "playing" || !G.room.amReferee() || G.advancing) return;
  const ps = G.players;
  const allSunk = ps.length > 0 && ps.every(p => p.id === me.id ? G.local.holed : p.sunk);
  const timedOut = now - G.holeStart > HOLE_TIMEOUT;
  if (allSunk || timedOut) {
    G.advancing = true;
    setTimeout(() => {
      if (G.holeIdx >= E.HOLES.length - 1) refSend({ type: "end" });
      else refSend({ type: "hole", hole: G.holeIdx + 1 });
    }, allSunk ? 1600 : 0);
  }
}
function onlineEnd() {
  G.phase = "matchEnd"; setHud(false);
  const ranked = [...G.players].map(p => ({ name: p.name, total: p.total || 0, skin: p.skin, me: p.id === me.id }))
    .sort((a, b) => a.total - b.total);
  const winner = ranked[0];
  $("endTitle").textContent = winner ? (winner.me ? "You win! \u{1F3C6}" : esc(winner.name) + " wins") : "Round complete";
  $("endVerdict").textContent = winner ? winner.total + " strokes" : ""; $("endVerdict").className = "verdict";
  let rows = "<tr><th>#</th><th>Player</th><th>Total</th><th>to Par</th></tr>";
  rows += ranked.map((r, i) => { const d = r.total - E.PAR_TOTAL; return `<tr class="${r.me ? "mine" : ""}"><td class="h">${i + 1}</td><td style="text-align:left">${esc(r.name)}${r.me ? " (you)" : ""}</td><td>${r.total}</td><td class="${d < 0 ? "u" : d > 0 ? "o" : "e"}">${fmtSigned(d)}</td></tr>`; }).join("");
  $("scorecard").innerHTML = rows; show("endScreen"); $("againBtn").firstChild.textContent = "Back to lobby ";
}
function updateMiniboard() {
  const mb = $("miniboard");
  if (G.mode !== "online" || G.phase === "lobby" || G.phase === "menu") { mb.hidden = true; return; }
  mb.hidden = false;
  mb.innerHTML = G.players.slice().sort((a, b) => (a.total || 0) - (b.total || 0)).map(p => {
    const sunk = p.id === me.id ? G.local.holed : p.sunk;
    return `<div class="mrow ${p.id === me.id ? "mine" : ""}"><span class="dot ${sunk ? "in" : ""}"></span>${esc(p.name)}<b>${p.total || 0}</b></div>`;
  }).join("");
}

function leaveOnline() {
  if (G.room) { G.room.leave(); G.room = null; }
  G.ghosts.clear(); G.players = []; G.mode = "menu"; G.phase = "menu"; setHud(false); backToMenu();
}

// ---------- shooting ----------
function toLogical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s }; }
function shoot() {
  const b = G.local; const dx = b.origin[0] - G.aim.x, dy = b.origin[1] - G.aim.y, d = Math.hypot(dx, dy);
  if (d < 6) return;
  const p = Math.min(d, E.MAX_PULL) / E.MAX_PULL;
  b.vx = dx / d * p * E.MAX_SPEED; b.vy = dy / d * p * E.MAX_SPEED; b.moving = true; b.strokes++;
  $("strokes").textContent = b.strokes; $("hint").style.opacity = 0; sfx.putt(p);
}
cv.addEventListener("pointerdown", e => { if (G.phase !== "playing" || G.local.moving || G.local.holed) return; ac(); G.aim.active = true; const p = toLogical(e); G.aim.x = p.x; G.aim.y = p.y; e.preventDefault(); });
addEventListener("pointermove", e => { if (G.aim.active) { const p = toLogical(e); G.aim.x = p.x; G.aim.y = p.y; } });
addEventListener("pointerup", () => { if (G.aim.active) { G.aim.active = false; shoot(); } });
addEventListener("pointercancel", () => { G.aim.active = false; });
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === "m") toggleMute();
  if (k === "r" && G.mode === "solo" && G.phase === "playing") loadHoleLocal(G.holeIdx);
});

// ---------- main loop ----------
let acc = 0, last = performance.now();
function frame(now) {
  const dt = now - last; last = now; acc += Math.min(dt, 100);
  const hole = E.HOLES[G.holeIdx];

  // interpolate ghosts (needed for both render + collision)
  for (const g of G.ghosts.values()) sampleGhost(g, now);

  while (acc >= E.DT_MS) {
    if (G.phase === "playing") {
      const b = G.local;
      if (!b.holed) {
        for (const g of G.ghosts.values()) if (!g.holed) { if (E.bumpBall(b, g)) { if (!b.moving && (Math.abs(b.vx) + Math.abs(b.vy)) > 0.2) b.moving = true; hooks && sfx.bump(); } }
        if (b.moving) E.advance(b, hole, hooks);
      }
    }
    acc -= E.DT_MS;
  }

  // sink animation
  if (G.local.sunk > 0 && G.local.sunk < 1) { G.local.sunk += 0.05; if (G.local.sunk >= 1) { G.local.holed = true; if (G.mode === "solo") soloHoleComplete(); else onlineLocalHoled(); } }
  for (const g of G.ghosts.values()) if (g.sunkP && g.sunk < 1) g.sunk = Math.min(1, g.sunk + 0.06);

  // trails + particles
  E.pushTrail(G.local); for (const g of G.ghosts.values()) E.pushTrail(g);
  for (let i = G.particles.length - 1; i >= 0; i--) { const p = G.particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.02; if (p.life <= 0) G.particles.splice(i, 1); }
  if (G.shake > 0.3) G.shake *= 0.86; else G.shake = 0;

  // network send
  if (G.mode === "online" && G.phase === "playing" && G.room && now - G.lastSend > STATE_HZ) {
    G.lastSend = now; const b = G.local;
    G.room.sendState({ id: me.id, x: Math.round(b.x), y: Math.round(b.y), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2), moving: b.moving, holed: b.holed, skin: b.skin });
  }
  refereeTick(now);

  // render
  const balls = [G.local, ...G.ghosts.values()];
  E.renderScene(ctx, { view, hole, balls, localId: me.id, aim: G.aim, t: now, shake: G.shake, particles: G.particles, showLabels: G.mode === "online" });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- menu wiring ----------
function backToMenu() { G.mode = "menu"; G.phase = "menu"; setHud(false); $("nameInput").value = me.name; buildSkinPicker($("skinMenu")); $("netWarn").hidden = Net.online; show("menu"); }
function toggleMute() { G.muted = !G.muted; $("mute").innerHTML = G.muted ? "&#128263;" : "&#128266;"; }

$("soloBtn").onclick = () => { ac(); startSolo(); };
$("createBtn").onclick = () => { ac(); joinRoom(Net.genCode()); };
$("joinBtn").onclick = () => { const c = ($("joinCode").value || "").trim().toUpperCase(); if (c.length >= 3) { ac(); joinRoom(c); } else $("joinCode").focus(); };
$("joinCode").addEventListener("keydown", e => { if (e.key === "Enter") $("joinBtn").click(); });
$("nameInput").addEventListener("input", e => { me.name = e.target.value.slice(0, 14); localStorage.setItem("cholf:name", me.name); G.local.name = me.name || "You"; });

$("readyBtn").onclick = () => { const r = !($("readyBtn").dataset.on === "1"); $("readyBtn").dataset.on = r ? "1" : "0"; $("readyBtn").classList.toggle("on", r); $("readyBtn").firstChild.textContent = r ? "Ready \u2713 " : "Ready up "; G.room.setPresence({ ready: r }); };
$("startBtn").onclick = () => { refSend({ type: "start", hole: 0 }); };
$("leaveBtn").onclick = leaveOnline;
$("copyCode").onclick = () => copy(G.roomCode, $("copyCode"));
$("shareBtn").onclick = () => copy(location.origin + location.pathname + "#" + G.roomCode, $("shareBtn"));
$("nextBtn").onclick = soloNext;
$("againBtn").onclick = () => { if (G.mode === "online") { G.local.total = 0; openLobby(); G.room.setPresence({ ready: false, sunk: false, total: 0, strokes: 0 }); } else backToMenu(); };
$("mute").onclick = toggleMute;
$("backBtn").onclick = () => { if (G.mode === "online") leaveOnline(); else backToMenu(); };

function copy(text, btn) { navigator.clipboard && navigator.clipboard.writeText(text); const o = btn.textContent; btn.textContent = "Copied!"; setTimeout(() => btn.textContent = o, 1200); }

// deep-link: #ROOMCODE auto-joins after name is set
buildSkinPicker($("skinMenu")); $("nameInput").value = me.name; $("netWarn").hidden = Net.online; show("menu");
const hash = (location.hash || "").replace("#", "").toUpperCase();
if (hash && /^[A-Z0-9]{3,6}$/.test(hash)) { $("joinCode").value = hash; }
