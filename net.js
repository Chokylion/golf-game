// net.js — Supabase Realtime wrapper for Cholf.
// Presence = lobby/player list. Broadcast = live ball state + game-flow events.
// No DB tables; anon key only. Each client owns its own ball.

const cfg = window.CHOLF_CONFIG || {};
const HAS_SUPA = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON);
const client = HAS_SUPA
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 40 } } })
  : null;

export const online = HAS_SUPA;
export function genId() { return Math.random().toString(36).slice(2, 10); }
export function genCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

// connect to a room. handlers: { onPlayers(list), onState(payload), onFlow(payload), onStatus(str) }
export function connect(code, me, handlers) {
  if (!client) throw new Error("Supabase not configured");
  const topic = "cholf:" + code.toUpperCase();
  let presence = { id: me.id, name: me.name, skin: me.skin, ready: false, sunk: false, strokes: 0, total: 0, hole: 0, joinedAt: Date.now() };
  let players = [];

  const ch = client.channel(topic, { config: { presence: { key: me.id }, broadcast: { self: false, ack: false } } });

  function rebuild() {
    const st = ch.presenceState();
    players = Object.keys(st).map(k => ({ ...(st[k][0] || {}), id: (st[k][0] && st[k][0].id) || k }))
      .sort((a, b) => (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : 1));
    handlers.onPlayers && handlers.onPlayers(players);
  }
  ch.on("presence", { event: "sync" }, rebuild);
  ch.on("presence", { event: "join" }, rebuild);
  ch.on("presence", { event: "leave" }, rebuild);
  ch.on("broadcast", { event: "state" }, ({ payload }) => handlers.onState && handlers.onState(payload));
  ch.on("broadcast", { event: "flow" }, ({ payload }) => handlers.onFlow && handlers.onFlow(payload));
  ch.on("broadcast", { event: "taunt" }, ({ payload }) => handlers.onTaunt && handlers.onTaunt(payload));

  ch.subscribe(async (status) => {
    handlers.onStatus && handlers.onStatus(status);
    if (status === "SUBSCRIBED") { await ch.track(presence); rebuild(); }
  });

  const api = {
    topic,
    players: () => players,
    // the deterministic referee = earliest joiner still present
    referee: () => (players[0] && players[0].id) || me.id,
    amReferee: () => api.referee() === me.id,
    async setPresence(patch) { presence = { ...presence, ...patch }; if (ch.state === "joined") await ch.track(presence); },
    sendState(payload) { ch.send({ type: "broadcast", event: "state", payload }); },
    sendFlow(payload) { ch.send({ type: "broadcast", event: "flow", payload }); },
    sendTaunt(payload) { ch.send({ type: "broadcast", event: "taunt", payload }); },
    async leave() { try { await ch.untrack(); } catch (e) {} client.removeChannel(ch); },
  };
  return api;
}
