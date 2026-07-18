import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ghostdesk/shared';

export interface SocketData {
  roomId?: string;
  participantId?: string;
}

export type GhostServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type GhostSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
