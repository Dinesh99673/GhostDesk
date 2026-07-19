import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@ghostdesk/shared';

export type GhostSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GhostSocket | null = null;

/** Same-origin connection: Vite proxies /socket.io to the server in dev;
 * in production Express serves the client so the origin matches anyway. */
export function getSocket(): GhostSocket {
  if (!socket) {
    socket = io({ transports: ['websocket'] });
  }
  return socket;
}
