# Cholf — online party mini-golf

Real-time multiplayer mini-golf. Share a room code, share the green, and knock
your friends' balls around. Works on phone and desktop. Also has an offline
**Solo** mode (9-hole stroke play).

**Play:** https://cholf.vercel.app

## How to play
- **Solo:** menu → *Play solo*. Drag back from your ball and release to putt.
- **With friends:** enter a name, pick a ball, *Create room*, then share the
  4-letter code (or the invite link). Friends *Join* with the code. The host
  starts the match. Everyone plays the same hole at once — bump into someone
  else's ball to knock it off line. Lowest total strokes after 9 holes wins.

Controls are pointer/touch (drag to aim). Keys: `M` mute, `R` replay hole (solo).

## Tech
- Single static site — no build step. Pure HTML/CSS/Canvas, zero framework.
- **Supabase Realtime** for netcode (anon key only, no database tables):
  - **Presence** → lobby / player list.
  - **Broadcast** → live ball positions (~20 Hz) + game-flow events.
- **Peer model:** each client owns its own ball and resolves collisions locally
  against interpolated "ghosts" of everyone else. No game server, no host
  authority. A deterministic *referee* (earliest joiner) only sequences holes.

## Files
| file | role |
|------|------|
| `index.html` | markup + script/style loading |
| `styles.css` | premium dark UI, responsive, HUD |
| `engine.js`  | physics, rendering, ball skins, trails (shared solo/online) |
| `net.js`     | Supabase Realtime wrapper (presence + broadcast) |
| `app.js`     | menu / lobby / game loops + netcode glue |
| `config.js`  | Supabase URL + anon key (public by design) |
| `serve.mjs`  | local dev server only (`node serve.mjs` → http://localhost:5178) |

## Local dev
```
node serve.mjs
```
Then open http://localhost:5178 . Open a second browser/device on the same room
code to test multiplayer.

## Deploy
Static deploy on Vercel (project `cholf`):
```
vercel deploy --prod --yes
```
