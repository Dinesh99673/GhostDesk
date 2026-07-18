import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { RateLimiter } from './rateLimiter.js';
import { RoomStore } from './roomStore.js';
import { registerSocketHandlers } from './socket.js';
import type { GhostServer } from './types.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);

const io: GhostServer = new Server(httpServer, {
  // In production the client is served same-origin; CORS only matters in dev.
  cors: isProduction ? undefined : { origin: CLIENT_ORIGIN },
  maxHttpBufferSize: 2 * 1024 * 1024,
});

const store = new RoomStore(io);
const limiters = {
  create: new RateLimiter(10, 60_000),
  join: new RateLimiter(30, 60_000),
};
registerSocketHandlers(io, store, limiters);
store.startBackgroundTasks(() => {
  limiters.create.prune();
  limiters.join.prune();
});

// The only REST surface: a health check (used by Render) — everything else is Socket.IO.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: store.size });
});

// In production, serve the built client from this same process.
const dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`GhostDesk server listening on :${PORT}`);
});
