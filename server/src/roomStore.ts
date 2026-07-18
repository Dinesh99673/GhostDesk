import { customAlphabet } from 'nanoid';
import { CLEANUP_INTERVAL_MS, MAX_ROOMS, ROOM_ID_LENGTH, RoomState } from '@ghostdesk/shared';
import { Room } from './room.js';
import type { GhostServer } from './types.js';

const roomIdAlphabet = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_',
  ROOM_ID_LENGTH
);

/** Heartbeat staleness is checked more often than the deep sweep so a zombie
 * participant drops out close to the 25 s timeout, not up to a minute later. */
const STALE_CHECK_INTERVAL_MS = 10_000;

export class RoomStore {
  private rooms = new Map<string, Room>();
  private staleInterval: NodeJS.Timeout | null = null;
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor(private readonly io: GhostServer) {}

  create(): Room | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const roomId = roomIdAlphabet();
    const room = new Room(this.io, roomId, (r) => this.destroyRoom(r));
    this.rooms.set(roomId, room);
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Destruction is deletion: once the Map entry is gone, nothing remains. */
  destroyRoom(room: Room): void {
    if (room.state === RoomState.DESTROYED) return;
    room.destroy();
    this.rooms.delete(room.roomId);
  }

  startBackgroundTasks(onSweep?: () => void): void {
    this.staleInterval = setInterval(() => this.checkStaleParticipants(), STALE_CHECK_INTERVAL_MS);
    this.sweepInterval = setInterval(() => {
      this.sweep();
      onSweep?.();
    }, CLEANUP_INTERVAL_MS);
  }

  stopBackgroundTasks(): void {
    if (this.staleInterval) clearInterval(this.staleInterval);
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  /** Drops participants whose heartbeat went silent (zombie connections). */
  private checkStaleParticipants(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      for (const stale of room.presence.staleParticipants(now)) {
        const socketId = stale.socketId;
        room.handleDeparture(stale.info.participantId, 'timeout');
        if (socketId) this.io.in(socketId).disconnectSockets(true);
      }
    }
  }

  /**
   * Safety-net sweep (every 60 s): removes rooms stuck in DESTROYING (lost
   * timer), empty ACTIVE rooms that slipped past the event-driven path, and
   * dormant participant records past their reconnect window.
   */
  private sweep(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      room.presence.pruneDormant(now);

      if (room.lifecycle.isStuckDestroying(now)) {
        this.destroyRoom(room);
        continue;
      }
      if (room.state === RoomState.ACTIVE && room.presence.connectedCount() === 0) {
        room.lifecycle.scheduleDestroy();
      }
    }
  }
}
