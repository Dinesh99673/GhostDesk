# 👻 GhostDesk — Disposable Workspace

> *Collaborate freely. Leave nothing behind.*

GhostDesk is a privacy-first, disposable collaborative workspace. Create a room, share the
link, collaborate — video calls, chat, shared notes, a whiteboard, and peer-to-peer file
sharing. When the last participant leaves, the entire workspace is **permanently destroyed**
after a 30-second grace period.

- **No signup** — you're in a room two clicks after landing.
- **Anonymous** — everyone gets an auto-generated identity (*Anonymous Fox*, *Anonymous Owl*…),
  optionally renameable.
- **Nothing persists** — all room state lives in server RAM; destruction is deletion.
  Video/audio and files travel peer-to-peer over encrypted WebRTC and never touch the server.

## Architecture

```
GhostDesk/
├── client/   React 19 + Vite + Tailwind 4 + Excalidraw + Yjs + socket.io-client
├── server/   Node + Express + Socket.IO (in-memory state, modular managers)
├── shared/   Single source of truth: event contract, types, constants, validation
└── scripts/  smoke.mjs — end-to-end Socket.IO contract test
```

- **Transport:** everything (room lifecycle, presence, chat, notes, whiteboard, WebRTC
  signaling, file coordination) rides one Socket.IO connection. The only REST endpoint is
  `/healthz`.
- **Server managers:** each `Room` composes `PresenceManager`, `ChatManager`, `NotesManager`,
  `WhiteboardManager`, `FileTransferManager`, and `LifecycleManager`
  (`ACTIVE → DESTROYING → DESTROYED`), plus a 60 s safety-net cleanup sweep.
- **Calls:** full-mesh WebRTC with perfect negotiation. Hard cap 6 people per room.
- **Notes:** Yjs CRDT — conflict-free simultaneous editing.
- **Whiteboard:** Excalidraw with incremental element-diff sync (~100 ms throttle),
  reconciled by element version.
- **Files:** offered via socket, transferred in 64 KB chunks over WebRTC data channels with
  backpressure. Per-file cap 10 MB. Never stored server-side.
- **Reconnection:** a participant token in `sessionStorage` restores your identity on
  refresh — no duplicate participants, and rejoining within the grace period rescues a room.

### Memory caps (fits a 512 MB instance)

Max 50 rooms · 6 participants/room · chat 500 msgs or 1 MB · notes 1 MB ·
whiteboard 5 MB / 5000 elements. Oldest chat messages are trimmed automatically.

## Development

```bash
npm install
npm run dev          # server on :3001, client on :5173 (Vite proxies /socket.io)
```

Open http://localhost:5173, create a workspace, then open the room link in a second
(incognito) window to simulate a second participant.

```bash
npm run typecheck    # typecheck all three workspaces
npm run build        # production client build → client/dist
```

### Smoke test

Exercises the full server contract (join/rejoin, chat, Yjs notes, whiteboard, signaling
relay, file offers, heartbeats, grace-period destruction — takes ~40 s):

```bash
PORT=3101 npm run start &      # PowerShell: $env:PORT='3101'; npm run start
node scripts/smoke.mjs
```

## Deployment (Render)

One web service runs everything: Express serves the built client and hosts Socket.IO.

- **Build command:** `npm install --include=dev && npm run build`
  (the `--include=dev` matters: `NODE_ENV=production` makes npm skip the dev
  dependencies that Vite's build needs)
- **Start command:** `npm run start`
- **Env vars:** `NODE_ENV=production` (Render sets `PORT` automatically)
- Optional TURN relay for restrictive networks, set at **build** time for the client:
  `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`

Or use the included [render.yaml](render.yaml) blueprint.

> **Free-tier note:** the instance spins down after ~15 min without traffic, wiping RAM.
> Active rooms generate constant socket traffic so they stay alive; idle rooms are destined
> for destruction anyway. A restart/deploy also wipes active rooms — an accepted trade-off
> of the "nothing ever touches a disk" design.

## Demo flow

1. Create a workspace → copy the invite link.
2. A friend opens the link → video call connects, anonymous identities appear.
3. Chat, draw on the whiteboard, and type notes simultaneously.
4. Share a file — watch it stream peer-to-peer.
5. Check the 🛡️ Privacy tab: workspace age, live trust signals.
6. Both leave → 30 seconds later the room is gone.
7. Reopen the link: *"Workspace permanently destroyed"* — with the staged deletion replay.

## Security notes

- Room IDs: 14 chars of `nanoid` (~83 bits of entropy) — unguessable.
- Rate limiting on room creation and joins (per-IP, in-memory).
- Media & file transfer encrypted end-to-end between peers (DTLS-SRTP).
- Server validates every payload against the shared validation module.
- No accounts, no content logs, no persistence layer at all.
