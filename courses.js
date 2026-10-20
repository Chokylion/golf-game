// courses.js — pure data: ball skins, theme palettes, and hole layouts.
// Node-importable (no DOM/three). Physics + renderer both read these specs.
//
// Coordinate system: XZ is the ground plane, +Y is up. Each arena is centred at
// the origin; the ball is putted from -Z (tee) toward +Z (cup) by default.
// Units are ~"metres"; the ball radius is 0.36 (see physics.js R).
//
// Rect helpers are [centerX, centerZ, sizeX, sizeZ]. Tilted pieces add
// [..., tiltDegrees, axis] where axis 'x' pivots around the X axis (a slope you
// climb moving along Z) and 'z' pivots around Z (a slope banking left/right).

export const SKINS = [
  { id: "classic", name: "Classic", color: "#f4f6f5", accent: "#cfe8dc", rough: 0.35, metal: 0.0 },
  { id: "volt",    name: "Volt",    color: "#c6ff3d", accent: "#eaffb0", rough: 0.3,  metal: 0.0, glow: 0.25 },
  { id: "sunset",  name: "Sunset",  color: "#ff8a3d", accent: "#ffd27a", rough: 0.3,  metal: 0.05 },
  { id: "ocean",   name: "Ocean",   color: "#37b6ff", accent: "#b9ecff", rough: 0.25, metal: 0.1 },
  { id: "magma",   name: "Magma",   color: "#ff5252", accent: "#ffb199", rough: 0.3,  metal: 0.0, glow: 0.2 },
  { id: "galaxy",  name: "Galaxy",  color: "#a86bff", accent: "#e3c7ff", rough: 0.2,  metal: 0.3, glow: 0.15 },
];
export const SKIN_IDS = SKINS.map(s => s.id);
export const skinById = id => SKINS.find(s => s.id === id) || SKINS[0];

// Theme palettes drive the whole look of a hole.
export const THEMES = {
  beach: {
    fair: "#63c85a", fairEdge: "#4fb148", rough: "#e9d19a", sand: "#f3dea3",
    water: "#2bc3e8", waterDeep: "#149ac9", rail: "#c98b4a", railTop: "#e0a866",
    skyTop: "#8fe3ff", skyBot: "#e9fbff", fog: "#cdeffb", sun: "#fff4d6", amb: "#bfe8ff",
  },
  forest: {
    fair: "#4fae52", fairEdge: "#3d9142", rough: "#6b5a3a", sand: "#d8c48f",
    water: "#2f9fd6", waterDeep: "#1c6fa8", rail: "#7a5230", railTop: "#966a44",
    skyTop: "#a7d8ef", skyBot: "#eaf6e6", fog: "#c9e4d6", sun: "#fff1cf", amb: "#cfe6d9",
  },
  desert: {
    fair: "#cdae6a", fairEdge: "#b8964f", rough: "#e8cf94", sand: "#f0dca0",
    water: "#38b6d8", waterDeep: "#1f8fb0", rail: "#a9713e", railTop: "#c98f57",
    skyTop: "#ffd79a", skyBot: "#fff2d6", fog: "#f0dcb4", sun: "#fff0cf", amb: "#e8c9a0",
  },
  jungle: {
    fair: "#3f9d4a", fairEdge: "#2f7d3a", rough: "#4a3a24", sand: "#c9b070",
    water: "#1f8fb0", waterDeep: "#12657f", rail: "#5c3a1e", railTop: "#7a5230",
    skyTop: "#bfe6c8", skyBot: "#eaf7ea", fog: "#bfe0c8", sun: "#f5f0cf", amb: "#cfe6d0",
  },
  cave: {
    fair: "#4a7a5e", fairEdge: "#3a624a", rough: "#2a2f36", sand: "#8a8f96",
    water: "#2f6fa0", waterDeep: "#1c4f78", rail: "#4a4f57", railTop: "#6a707a",
    skyTop: "#3a4450", skyBot: "#6a7580", fog: "#48535f", sun: "#cfd6e0", amb: "#3a4450",
  },
  ice: {
    fair: "#cfeaf2", fairEdge: "#aad6e4", rough: "#eaf6fb", sand: "#dfeef2",
    water: "#5ac8e8", waterDeep: "#2f9fd0", rail: "#8fbccf", railTop: "#c6e6f0",
    skyTop: "#bfe6ff", skyBot: "#eefaff", fog: "#dbeef7", sun: "#ffffff", amb: "#d6ecf5",
  },
  snow: {
    fair: "#e8f2f8", fairEdge: "#cfe2ee", rough: "#f2f9fc", sand: "#dbe8ef",
    water: "#63c6e8", waterDeep: "#2f9fd0", rail: "#8a9aa8", railTop: "#c6d6e2",
    skyTop: "#bfe0f5", skyBot: "#eef7fc", fog: "#dcecf6", sun: "#ffffff", amb: "#dbe8f0",
  },
  moon: {
    fair: "#6d7580", fairEdge: "#565d67", rough: "#3e444c", sand: "#9aa1a9",
    water: "#3a6ea5", waterDeep: "#254a72", rail: "#7a828c", railTop: "#aab2bc",
    skyTop: "#05070f", skyBot: "#141a2a", fog: "#1a2233", sun: "#ffffff", amb: "#2a3346", space: true,
  },
  space: {
    fair: "#22345c", fairEdge: "#182849", rough: "#0c1226", sand: "#3a4a72",
    water: "#7a3cff", waterDeep: "#4a1fb0", rail: "#3a5cff", railTop: "#7ef0ff",
    skyTop: "#04030f", skyBot: "#0d0a24", fog: "#0d0a24", sun: "#cfe0ff", amb: "#1a2247", space: true,
  },
  ship: {
    fair: "#39424d", fairEdge: "#2b323b", rough: "#20262d", sand: "#525b66",
    water: "#2fd0c0", waterDeep: "#1c8f88", rail: "#5a636e", railTop: "#8fe6ff",
    skyTop: "#0a0f16", skyBot: "#161e28", fog: "#141b24", sun: "#dfe8f0", amb: "#232c36", space: true,
  },
};

// Each hole: bounds [w,l] frames the arena + default floor + perimeter rails.
export const COURSES = [
  {
    id: "h1", name: "Sunny Fairway", theme: "beach", par: 2,
    hint: "Weave past the bumper — mind the sand.",
    bounds: [11, 24], tee: [0, -9.5], cup: [0, 10],
    bumpers: [[-1.7, 0, 0.62], [1.7, 3.4, 0.62]],
    sand: [[3.1, -3.2, 3.6, 4], [-3.1, 6.2, 3.4, 3.4]],
    decor: [
      ["palm", -4.4, -7, 1.1], ["palm", 4.4, -6, 1], ["palm", -4.6, 7, 1.15], ["palm", 4.6, 8.5, 1],
      ["umbrella", 4.2, 1, 1], ["umbrella", -4.2, 3.5, 0.9],
      ["lighthouse", 0, 13.4, 1.2], ["rock", -4.2, 0.5, 0.7], ["rock", 4.4, -2, 0.6],
    ],
  },
  {
    id: "h2", name: "Palm Lagoon", theme: "beach", par: 3,
    hint: "Thread the channel between the lagoons.",
    bounds: [13, 27], tee: [-3.4, -11], cup: [3.6, 11.5],
    water: [[-5.1, -0.5, 3.4, 8.5], [5.1, 1.5, 3.4, 8.5]],
    bumpers: [[0, 1.5, 0.72], [0, -4.5, 0.6]],
    sand: [[0, 6.5, 3, 3]],
    decor: [
      ["palm", -5.4, -8.5, 1.1], ["palm", 5.4, -7, 1], ["palm", -5.6, 8.5, 1.1], ["palm", 5.6, 9.5, 1.2],
      ["umbrella", -5, 5, 0.9], ["boat", 5.2, -1, 1], ["lighthouse", 0, 14.6, 1.15],
      ["rock", 0, 8.6, 0.6],
    ],
  },
  {
    id: "h3", name: "Pine Pond", theme: "forest", par: 3,
    hint: "Curl around the pond to the pin.",
    bounds: [14, 26], tee: [-4.6, -10.5], cup: [4.6, 10.5],
    water: [[-2.6, 1, 5.2, 9]],
    bumpers: [[3.6, -4, 0.6], [1.8, 7.6, 0.6]],
    sand: [[5, 0.5, 3, 4]],
    decor: [
      ["pine", -6.2, -8, 1.2], ["pine", 6.2, -7, 1.4], ["pine", -6.4, 8, 1.3], ["pine", 6.4, 9, 1.5],
      ["pine", 6, 1, 1.1], ["pine", -6, 3.5, 1.2], ["log", 5.5, -8, 1], ["rock", 0, -6, 0.9],
      ["rock", 3, 3.5, 0.8], ["mushroom", 5.5, 6, 0.8], ["mushroom", -5, -3, 0.7],
    ],
  },
  {
    id: "h4", name: "Forest Bends", theme: "forest", par: 3,
    hint: "Bank off the rails around the pond.",
    bounds: [15, 25], tee: [-4.6, -9.5], cup: [5, 9.6],
    walls: [[-2, 1, 0.5, 9], [3, -1.5, 0.5, 9]],
    water: [[-4.4, 5.2, 3.4, 3.4]],
    bumpers: [[0.5, -5.5, 0.6], [1.2, 6.5, 0.6]],
    sand: [[5.2, -3, 3, 3.4]],
    decor: [
      ["pine", -6.2, -8, 1.2], ["pine", 6.2, -7, 1.3], ["pine", -6.4, 8, 1.4], ["pine", 6.4, 9, 1.2],
      ["pine", 6, 1, 1.1], ["log", -5, -2, 1], ["rock", 3, 4, 0.8], ["mushroom", 2, 2, 0.7],
      ["mushroom", -3, -6, 0.8], ["rock", -6, 3, 0.7],
    ],
  },
  {
    id: "h5", name: "Island Green", theme: "beach", par: 3,
    hint: "Thread the narrow causeway to the island.",
    bounds: [16, 24], tee: [0, -7], cup: [0, 8.2],
    floors: [[0, -3.5, 16, 11], [0, 7.5, 8, 8]],
    causeway: [[0, 3, 2.6, 6]],
    water: [[-5.5, 4, 5, 9], [5.5, 4, 5, 9], [0, 3, 8, 3.2]],
    bumpers: [[0, 10.6, 0.6]],
    decor: [
      ["palm", -3, 9.5, 1.1], ["palm", 3, 9.5, 1.1], ["palm", 0, 10.8, 1.3],
      ["palm", -6.6, -6, 1], ["palm", 6.6, -6, 1], ["umbrella", -5, -3, 0.9],
      ["lighthouse", -6.5, 8.5, 1], ["boat", 6, 4, 1],
    ],
  },
  {
    id: "h6", name: "Grand Leap", theme: "forest", par: 3,
    hint: "Charge the ramp and fly the gap to the high green!",
    bounds: [13, 36], tee: [0, -15.5], cup: [0, 13, 1.2],
    floors: [[0, -10.5, 13, 11, 0], [0, 10, 13, 14, 1.2]],
    ramps: [[0, -2.5, 13, 5, 0, 3, "z"]],
    water: [[0, 1.5, 13, 3]],
    bumpers: [[-2.6, 11, 0.6], [2.6, 11, 0.6]],
    decor: [
      ["pine", -5.4, -12, 1.2], ["pine", 5.4, -11, 1.3], ["pine", -5.6, 12, 1.4], ["pine", 5.6, 14, 1.2],
      ["rock", -5, 1.5, 0.9], ["rock", 5, 1.5, 0.9], ["log", 4.6, -3, 1], ["mushroom", -4.4, 8, 0.8],
    ],
  },
  {
    id: "h7", name: "Desert Cannon", theme: "desert", par: 3,
    hint: "Roll onto the cannon — it blasts you across the canyon.",
    bounds: [14, 34], tee: [0, -13.5], cup: [0, 12],
    floors: [[0, -9, 14, 13, 0], [0, 9.5, 14, 13, 0]],
    launchers: [{ type: "cannon", x: 0, z: -4, r: 1.4, tx: 0, tz: 9, apex: 5, exit: 7, dur: 1.1 }],
    water: [[0, 0, 14, 4]],
    bumpers: [[-3, 11, 0.6], [3, 11, 0.6]],
    sand: [[4.6, 8, 3, 4]],
    decor: [
      ["rock", -5.4, -6, 1.1], ["rock", 5.4, -5, 1.3], ["rock", -5.6, 10, 1.2], ["rock", 5.6, 12, 1],
      ["palm", -5, 8, 1], ["palm", 5, 4, 0.9], ["umbrella", -4.4, -9, 0.9], ["lighthouse", 0, 15.4, 1.1],
    ],
  },
  {
    id: "h8", name: "Jungle Corkscrew", theme: "jungle", par: 4,
    hint: "Ride the spiral tower up, then soar to the green.",
    bounds: [16, 32], tee: [0, -12.5], cup: [0, 11],
    floors: [[0, -7, 16, 14, 0], [0, 10.5, 14, 12, 0]],
    launchers: [{ type: "spiral", x: 0, z: -2, r: 1.4, cx: 0, cz: 0, radius: 2.6, turns: 1.75, topY: 6.5, tx: 0, tz: 10, ccw: false, exit: 6, dur: 2.0 }],
    water: [[0, 2.5, 16, 5]],
    bumpers: [[-3, 11.5, 0.6], [3, 11.5, 0.6]],
    decor: [
      ["pine", -6.4, -9, 1.3], ["pine", 6.4, -8, 1.5], ["pine", -6.6, 11, 1.4], ["pine", 6.6, 13, 1.2],
      ["log", -5.4, -4, 1], ["mushroom", 5, -5, 0.9], ["mushroom", -4.6, 9, 0.8], ["rock", 5.4, 8, 1],
    ],
  },
  {
    id: "h9", name: "Temple Tunnels", theme: "cave", par: 4,
    hint: "Weave the chicane and duck through the tunnels.",
    bounds: [22, 26], tee: [-8, -10], cup: [8, 10],
    walls: [[-3, 2, 0.6, 14], [3, -2, 0.6, 14]],
    tunnels: [[-6.5, -1, 4, 15, 0], [3, 9.5, 4, 13, 90]],
    bumpers: [[0, 0, 0.72]],
    sand: [[0, -8, 4, 3], [0, 8, 4, 3]],
    decor: [
      ["rock", -10, -10, 1.1], ["rock", 10, 10, 1.2], ["rock", -10, 10, 1], ["rock", 10, -10, 1.1],
      ["mushroom", -6, 4, 0.9], ["mushroom", 6, -4, 0.9], ["rock", 0, 11.4, 1], ["rock", 0, -11.4, 1],
    ],
  },
  {
    id: "h10", name: "Cliffside Gauntlet", theme: "forest", par: 4,
    hint: "Climb, catch the speed strip, launch off the cliff to the green.",
    bounds: [14, 44], tee: [0, -19], cup: [0, 17],
    floors: [[0, -14, 14, 12, 0], [0, 2, 14, 12, 3], [0, 17, 14, 10, 0]],
    ramps: [[0, -6, 14, 4, 0, 3, "z"], [0, 10, 14, 4, 3, 0, "z"]],
    boosters: [[0, 2, 5, 9, 0, 1, 24, 28]],
    bumpers: [[-3.4, 5, 0.6], [3.4, -1, 0.6]],
    decor: [
      ["pine", -5.6, -16, 1.3], ["pine", 5.6, -15, 1.4], ["pine", -5.8, 18, 1.5], ["pine", 5.8, 19, 1.3],
      ["rock", -5.2, 2, 1], ["rock", 5.2, 2, 1], ["log", 4.6, -10, 1], ["mushroom", -4.6, 14, 0.8],
    ],
  },
  {
    id: "h11", name: "Ice Loop Blast", theme: "ice", par: 4,
    hint: "Hit the boost, ride the cannon, stick the big-air landing.",
    bounds: [16, 42], tee: [0, -18], cup: [0, 15],
    floors: [[0, -12, 16, 14, 0], [0, 13, 16, 16, 0]],
    boosters: [[0, -11, 5, 8, 0, 1, 30, 34]],
    launchers: [{ type: "cannon", x: 0, z: -6, r: 1.6, tx: 0, tz: 13, apex: 6, exit: 7, dur: 1.4 }],
    water: [[0, 0, 16, 10]],
    bumpers: [[-3.6, 14, 0.6], [3.6, 14, 0.6], [0, 18, 0.6]],
    decor: [
      ["rock", -6.6, -8, 1.2], ["rock", 6.6, -7, 1.4], ["pine", -6.8, 14, 1.4], ["pine", 6.8, 16, 1.2],
      ["rock", -6, 13, 1], ["rock", 6, 13, 1], ["lighthouse", 0, 20.4, 1.1], ["mushroom", -5, 10, 0.8],
    ],
  },
  {
      id: "h12", name: "Snowmill Pass", theme: "snow", par: 3,
      hint: "Time the spinning blades — or sneak around the side.",
      bounds: [13, 26], tee: [0, -11], cup: [0, 11],
      movers: [{ type: "rotor", x: 0, z: 0, arms: 3, len: 3.2, r: 0.32, speed: 1.3, y: 0.8 }],
      sand: [[-3.6, 5, 3, 3], [3.6, -5, 3, 3]],
      bumpers: [[-3, -4, 0.6], [3, 4, 0.6]],
      decor: [
        ["pine", -5.6, -8, 1.2], ["pine", 5.6, -7, 1.3], ["pine", -5.8, 9, 1.4], ["pine", 5.8, 10, 1.2],
        ["crystal", -5, -2, 1], ["crystal", 5, 2, 1.1], ["rock", -5.4, 6, 0.8], ["crystal", 4.6, 7.5, 0.9],
      ],
  },
  {
      id: "h13", name: "Glacier Gates", theme: "snow", par: 3,
      hint: "Two sliding gates — the openings alternate. Read the rhythm.",
      bounds: [15, 32], tee: [0, -14], cup: [0, 14],
      movers: [
        { type: "slider", x: 0, z: -3, len: 7, r: 0.45, axis: "x", span: "x", range: 3.6, speed: 1.15, phase: 0, y: 0.7 },
        { type: "slider", x: 0, z: 4, len: 7, r: 0.45, axis: "x", span: "x", range: 3.6, speed: 1.15, phase: 3.14159, y: 0.7 },
      ],
      sand: [[4.8, 9, 3, 3.4], [-4.8, -9, 3, 3.4]],
      bumpers: [[-3.4, 0.5, 0.6], [3.4, 0.5, 0.6]],
      decor: [
        ["pine", -6.6, -10, 1.3], ["pine", 6.6, -9, 1.4], ["pine", -6.8, 11, 1.5], ["pine", 6.8, 12, 1.3],
        ["crystal", -6, -3, 1.1], ["crystal", 6, 4, 1.1], ["crystal", -5.6, 8, 0.9], ["rock", 5.6, -4, 0.9],
      ],
  },
  {
      id: "h14", name: "Pendulum Bridge", theme: "snow", par: 3,
      hint: "A wrecking ball sweeps the ice bridge — putt through the gap.",
      bounds: [14, 32], tee: [0, -14], cup: [0, 14],
      floors: [[0, -9, 14, 12, 0], [0, 0, 4, 8, 0], [0, 10, 14, 12, 0]],
      water: [[-4.6, 0, 5, 8.4], [4.6, 0, 5, 8.4]],
      movers: [{ type: "pendulum", x: 0, z: -3, len: 4, r: 0.7, dir: 90, amp: 74, speed: 1.6, y: 1.0 }],
      bumpers: [[0, 11.6, 0.6]],
      decor: [
        ["crystal", -5.6, -10, 1.2], ["crystal", 5.6, -9, 1.3], ["pine", -5.8, 11, 1.4], ["pine", 5.8, 12, 1.2],
        ["crystal", -6, 0, 1], ["crystal", 6, 0, 1], ["rock", 0, -12, 0.9],
      ],
  },
  {
      id: "h15", name: "Lunar Craters", theme: "moon", par: 4,
      hint: "Blast the cannon across the rift — then dodge the orbiting moonlet.",
      bounds: [15, 34], tee: [0, -14], cup: [0, 12.5],
      floors: [[0, -9, 15, 13, 0], [0, 9.5, 15, 13, 0]],
      launchers: [{ type: "cannon", x: 0, z: -4, r: 1.4, tx: 0, tz: 6, apex: 5, exit: 6.5, dur: 1.1 }],
      movers: [{ type: "orbiter", cx: 0, cz: 9.5, radius: 3, r: 0.7, speed: 1.4, y: 0.7 }],
      water: [[0, 0, 15, 4]],
      sand: [[4.6, 10, 3, 3], [-4.4, -9, 3, 3]],
      bumpers: [[-3.4, 13, 0.6], [3.4, 13, 0.6]],
      decor: [
        ["planet", -7.2, -6, 1], ["rock", 5.6, -5, 1.3], ["rock", -5.6, 11, 1.1], ["rock", 5.8, 12, 1],
        ["beacon", 6.2, 6, 1], ["beacon", -6.2, 6, 1], ["rock", -5, 2, 0.9], ["rock", 5, 2, 0.9],
      ],
  },
  {
      id: "h16", name: "Moonbase Turbine", theme: "moon", par: 4,
      hint: "Ride the boost up the ramp, then slip past the spinning turbine.",
      bounds: [15, 40], tee: [0, -17], cup: [0, 15.5],
      floors: [[0, -12, 15, 13, 0], [0, 3.5, 15, 12, 2.4], [0, 15, 15, 10, 0]],
      ramps: [[0, -4, 15, 4, 0, 2.4, "z"], [0, 10.5, 15, 4, 2.4, 0, "z"]],
      boosters: [[0, 3.5, 5, 10, 0, 1, 30, 34]],
      movers: [{ type: "rotor", x: 0, z: 12, arms: 4, len: 3.2, r: 0.34, speed: 1.15, y: 0.8 }],
      bumpers: [[-3.4, 14.5, 0.6], [3.4, 14.5, 0.6]],
      decor: [
        ["planet", 7.4, -8, 1], ["rock", -6, -13, 1.2], ["rock", 6, -12, 1.3], ["beacon", -6.4, 12, 1],
        ["beacon", 6.4, 12, 1], ["rock", -5.4, 3.5, 1], ["rock", 5.4, 3.5, 1], ["rock", 0, 16.4, 1],
      ],
  },
  {
      id: "h17", name: "Asteroid Belt", theme: "space", par: 4,
      hint: "Three asteroids spin on their own rhythm. Find the seam.",
      bounds: [16, 34], tee: [0, -14], cup: [0, 14],
      movers: [
        { type: "orbiter", cx: -2, cz: -3, radius: 2.6, r: 0.6, speed: 1.3, y: 0.7 },
        { type: "orbiter", cx: 2, cz: 3, radius: 2.8, r: 0.6, speed: -1.1, y: 0.7 },
        { type: "orbiter", cx: 0, cz: 9, radius: 3, r: 0.6, speed: 1.5, y: 0.7 },
      ],
      bumpers: [[-3.4, 0, 0.6], [3.4, 6, 0.6]],
      sand: [[5, -6, 3, 3], [-5, 11, 3, 3]],
      decor: [
        ["planet", -7.4, -7, 1.1], ["beacon", 6.6, -9, 1], ["beacon", -6.6, 12, 1], ["crystal", 6, 13, 1.1],
        ["rock", -6, 4, 1], ["rock", 6, -3, 1], ["crystal", -5.6, -3, 0.9], ["crystal", 5.6, 9, 0.9],
      ],
  },
  {
      id: "h18", name: "Wormhole Sprint", theme: "space", par: 4,
      hint: "Spiral through the wormhole, then dodge the spinner to the pin.",
      bounds: [16, 34], tee: [0, -13], cup: [0, 13],
      floors: [[0, -8, 16, 14, 0], [0, 10, 14, 14, 0]],
      launchers: [{ type: "spiral", x: 0, z: -2, r: 1.4, cx: 0, cz: 0, radius: 2.6, turns: 1.75, topY: 6.5, tx: 0, tz: 5, ccw: false, exit: 6, dur: 2.0 }],
      movers: [{ type: "rotor", x: 0, z: 8.5, arms: 2, len: 3.6, r: 0.34, speed: 1.7, y: 0.7 }],
      water: [[0, 1.5, 16, 5]],
      bumpers: [[-3.4, 12, 0.6], [3.4, 12, 0.6]],
      decor: [
        ["planet", 7.4, -6, 1.1], ["beacon", -6.6, -9, 1], ["beacon", 6.6, 11, 1], ["crystal", -6, 12, 1],
        ["rock", -6, 6, 1], ["rock", 6, 6, 1], ["crystal", 5.6, 3, 0.9],
      ],
  },
  {
      id: "h19", name: "Starship Airlock", theme: "ship", par: 4,
      hint: "Blast doors seal the center — shoot the gap, then beat the fan.",
      bounds: [14, 32], tee: [0, -14], cup: [0, 13],
      movers: [
        { type: "slider", x: -3.4, z: -2, len: 3.8, r: 0.45, axis: "x", span: "x", range: 3.4, speed: 1.0, phase: 0, y: 0.7 },
        { type: "slider", x: 3.4, z: -2, len: 3.8, r: 0.45, axis: "x", span: "x", range: 3.4, speed: 1.0, phase: 3.14159, y: 0.7 },
        { type: "rotor", x: 0, z: 6, arms: 3, len: 2.8, r: 0.3, speed: 2.0, y: 0.7 },
      ],
      sand: [[4.8, 10, 3, 3], [-4.8, -9, 3, 3]],
      bumpers: [[-3, 11.5, 0.6], [3, 11.5, 0.6]],
      decor: [
        ["beacon", -6, -10, 1], ["beacon", 6, -9, 1], ["beacon", -6.2, 11, 1], ["beacon", 6.2, 12, 1],
        ["rock", -5.6, -2, 1], ["rock", 5.6, 6, 1], ["planet", 7, 3, 1],
      ],
  },
  {
      id: "h20", name: "Event Horizon", theme: "space", par: 5,
      hint: "Ramp, boost, big-air the void — then run the turbine and moonlet to finish.",
      bounds: [16, 46], tee: [0, -20], cup: [0, 18],
      floors: [[0, -15, 16, 13, 0], [0, -2, 16, 7, 3], [0, 14.5, 16, 17, 0]],
      ramps: [[0, -9, 16, 8, 0, 3, "z"]],
      boosters: [[0, -2, 5, 7, 0, 1, 32, 36]],
      water: [[0, 4, 16, 4]],
      movers: [
        { type: "rotor", x: 0, z: 13, arms: 3, len: 3, r: 0.32, speed: 1.4, y: 0.8 },
        { type: "orbiter", cx: 0, cz: 18, radius: 3.2, r: 0.7, speed: 1.5, y: 0.7 },
      ],
      bumpers: [[-3.6, 21, 0.6], [3.6, 21, 0.6]],
      decor: [
        ["planet", -7.6, -10, 1.2], ["beacon", 6.8, -14, 1], ["beacon", -6.8, 20, 1], ["beacon", 6.8, 20, 1],
        ["crystal", -6, -2, 1], ["crystal", 6, -2, 1], ["rock", -6, 16, 1], ["rock", 6, 16, 1],
      ],
  },

  // ---- research pack (MAP-DESIGN-RESEARCH.md §5 recipes + §12 gravity well) ----
  {
    id: "h21", name: "Dogleg Cove", theme: "beach", par: 3,
    hint: "Bend it around the cove \u2014 bank off the rail to the pin.",
    bounds: [26, 26], tee: [-8, -10], cup: [9, 9],
    floors: [[-8, -2, 8, 18, 0], [1, 8, 24, 8, 0]],
    water: [[4.5, -4, 17, 14]],
    bumpers: [[-2.2, 2.4, 0.7], [9, 11.6, 0.6]],
    decor: [
      ["palm", -11, -8, 1.1], ["palm", -11, 5, 1.2], ["palm", 11, 11, 1.2], ["palm", 5, 11.4, 1],
      ["lighthouse", -11.4, 11, 1], ["boat", 5, -3, 1], ["umbrella", -8, -11, 0.9], ["rock", -2, 8, 0.8],
    ],
  },
  {
    id: "h22", name: "Mushroom Pinball", theme: "forest", par: 3,
    hint: "Thread the mushroom field \u2014 or carom off the caps to the cup.",
    bounds: [18, 26], tee: [0, -11], cup: [0, 11],
    bumpers: [[-2.7, -3, 0.72], [2.7, 0, 0.72], [-2.7, 3, 0.72], [2.7, 6, 0.72]],
    sand: [[-6, 0, 3, 5], [6, 3, 3, 5]],
    decor: [
      ["mushroom", -2.7, -3, 1.05], ["mushroom", 2.7, 0, 1.05], ["mushroom", -2.7, 3, 1.05], ["mushroom", 2.7, 6, 1.05],
      ["pine", -7.6, -9, 1.3], ["pine", 7.6, -8, 1.2], ["pine", -7.6, 10, 1.4], ["pine", 7.6, 11, 1.2], ["log", 6, -6, 1],
    ],
  },
  {
    id: "h23", name: "Island Ace", theme: "beach", par: 3,
    hint: "Fire straight down the causeway for the ace, or ease across safe.",
    bounds: [18, 28], tee: [0, -11], cup: [0, 10],
    floors: [[0, -8, 14, 8, 0], [0, 9, 10, 9, 0]],
    causeway: [[0, 0, 2.6, 10]],
    water: [[-5.8, 1, 6, 15], [5.8, 1, 6, 15], [0, -1.5, 9, 3]],
    bumpers: [[0, 12.4, 0.6]],
    decor: [
      ["palm", -3, 11, 1.1], ["palm", 3, 11, 1.1], ["palm", 0, 12.6, 1.3], ["palm", -6.8, -6, 1], ["palm", 6.8, -6, 1],
      ["lighthouse", -6.6, 10, 1], ["boat", 5.6, 4, 1], ["umbrella", -5, -8, 0.9],
    ],
  },
  {
    id: "h24", name: "Dune Crest", theme: "desert", par: 3,
    hint: "Crest the dune \u2014 enough pace to roll over, not fly off.",
    bounds: [14, 32], tee: [0, -13], cup: [0, 12],
    floors: [[0, -9, 14, 10, 0], [0, 1.5, 14, 5, 1.8], [0, 10, 14, 12, 0]],
    ramps: [[0, -3.5, 14, 5, 0, 1.8, "z"], [0, 6, 14, 4, 1.8, 0, "z"]],
    bumpers: [[-3, 14, 0.6], [3, 14, 0.6]],
    sand: [[-5, -6, 3, 4], [5, 8, 3, 4]],
    decor: [
      ["rock", -5.4, -7, 1.2], ["rock", 5.4, -6, 1.1], ["rock", -5.6, 11, 1.2], ["rock", 5.6, 13, 1],
      ["palm", -5, 1, 0.9], ["palm", 5, 1, 0.9], ["lighthouse", 0, 15.4, 1.1], ["umbrella", -5.2, -10, 0.9],
    ],
  },
  {
    id: "h25", name: "Flume Leap", theme: "jungle", par: 4,
    hint: "Ramp, boost, and leap the flume \u2014 stick the landing green.",
    bounds: [16, 44], tee: [0, -18], cup: [0, 17],
    floors: [[0, -12.5, 16, 13, 0], [0, -1, 16, 8, 2.8], [0, 15, 16, 16, 0]],
    ramps: [[0, -8.5, 16, 7, 0, 2.8, "z"]],
    boosters: [[0, -1.5, 5, 9, 0, 1, 33, 37]],
    water: [[0, 5, 16, 4]],
    bumpers: [[-3.6, 21, 0.6], [3.6, 21, 0.6]],
    decor: [
      ["pine", -6.4, -13, 1.3], ["pine", 6.4, -12, 1.2], ["pine", -6.6, 17, 1.4], ["pine", 6.6, 18, 1.2],
      ["rock", -6, 6, 1], ["rock", 6, 6, 1], ["log", 5.4, -3, 1], ["mushroom", -4.6, 13, 0.8],
    ],
  },
  {
    id: "h26", name: "Singularity", theme: "space", par: 4,
    hint: "A black hole bends every putt \u2014 aim wide and let it curve home.",
    bounds: [24, 30], tee: [0, -12.5], cup: [-4.5, 12],
    wells: [[4.5, 3, 17, 6.5]],
    bumpers: [[-4.5, 14.4, 0.6], [-8, 6, 0.6]],
    decor: [
      ["planet", 8, 3, 1.3], ["beacon", -9, -10, 1], ["beacon", -9, 11, 1], ["beacon", 9, 12, 1],
      ["crystal", -7, -4, 0.9], ["crystal", 7, 10, 0.9], ["rock", -8, 1, 1],
    ],
  },
];

export const HOLE_COUNT = COURSES.length;
export const PAR_TOTAL = COURSES.reduce((s, c) => s + c.par, 0);

// Moving obstacles ("movers") — deterministic from time t (seconds). Returns the
// mover's colliding parts as world-space capsule segments {ax,az,bx,bz,r,y} in the
// XZ plane. Physics reads this for collision; the renderer reads the SAME thing to
// place meshes, so what you see is exactly what you hit. Types:
//   rotor    {x,z, arms=3, len=3, r=0.3, speed=1.4, phase=0, y=0.7}  windmill / spinner / star
//   slider   {x,z, len=4, r=0.4, axis:"x"|"z", span?, range=3, speed=1.2, phase=0, y=0.65}  sweeping wall / gate
//   pendulum {x,z, len=3, r=0.6, dir=0, amp=60, speed=1.6, phase=0, y=0.9}  wrecking ball (dir/amp in deg)
//   orbiter  {cx,cz, radius=3, r=0.6, speed=1.0, phase=0, y=0.7}  moon / asteroid
const D2R = Math.PI / 180;
export function moverSegments(m, t) {
  const y = m.y == null ? 0.7 : m.y, ph = m.phase || 0;
  if (m.type === "rotor") {
    const arms = m.arms || 3, len = m.len == null ? 3 : m.len, r = m.r == null ? 0.3 : m.r;
    const a0 = t * (m.speed == null ? 1.4 : m.speed) + ph, out = [];
    for (let k = 0; k < arms; k++) {
      const a = a0 + (k * Math.PI * 2) / arms;
      out.push({ ax: m.x, az: m.z, bx: m.x + Math.cos(a) * len, bz: m.z + Math.sin(a) * len, r, y });
    }
    return out;
  }
  if (m.type === "slider") {
    const len = m.len == null ? 4 : m.len, r = m.r == null ? 0.4 : m.r, range = m.range == null ? 3 : m.range;
    const su = m.axis === "z" ? [0, 1] : [1, 0];                     // slide direction
    const bu = m.span ? (m.span === "z" ? [0, 1] : [1, 0]) : [su[1], su[0]]; // bar orientation (default ⟂)
    const off = Math.sin(t * (m.speed == null ? 1.2 : m.speed) + ph) * range;
    const cx = m.x + su[0] * off, cz = m.z + su[1] * off;
    return [{ ax: cx - bu[0] * len / 2, az: cz - bu[1] * len / 2, bx: cx + bu[0] * len / 2, bz: cz + bu[1] * len / 2, r, y }];
  }
  if (m.type === "pendulum") {
    const len = m.len == null ? 3 : m.len, r = m.r == null ? 0.6 : m.r;
    const a = (m.dir || 0) * D2R + Math.sin(t * (m.speed == null ? 1.6 : m.speed) + ph) * (m.amp == null ? 60 : m.amp) * D2R;
    const bx = m.x + Math.cos(a) * len, bz = m.z + Math.sin(a) * len;
    return [{ ax: bx, az: bz, bx, bz, r, y }];                       // bob = point capsule
  }
  if (m.type === "orbiter") {
    const radius = m.radius == null ? 3 : m.radius, r = m.r == null ? 0.6 : m.r;
    const a = t * (m.speed == null ? 1.0 : m.speed) + ph;
    const bx = m.cx + Math.cos(a) * radius, bz = m.cz + Math.sin(a) * radius;
    return [{ ax: bx, az: bz, bx, bz, r, y }];
  }
  return [];
}

export function scoreName(strokes, par) {
  const d = strokes - par;
  if (strokes === 1) return "Hole in one!";
  if (d <= -3) return "Albatross";
  if (d === -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double bogey";
  return `+${d}`;
}
export function fmtTotal(n) { return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`; }
