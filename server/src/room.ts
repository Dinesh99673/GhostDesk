import { RoomState, type FileOffer, type RoomSnapshot } from '@ghostdesk/shared';
import { ChatManager } from './managers/chatManager.js';
import { FileTransferManager } from './managers/fileTransferManager.js';
import { LifecycleManager } from './managers/lifecycleManager.js';
import { NotesManager } from './managers/notesManager.js';
import { PresenceManager } from './managers/presenceManager.js';
import { WhiteboardManager } from './managers/whiteboardManager.js';
import type { GhostServer } from './types.js';

export class Room {
  readonly createdAt = Date.now();

  readonly presence = new PresenceManager();
  readonly chat = new ChatManager();
  readonly notes = new NotesManager();
  readonly whiteboard = new WhiteboardManager();
  readonly files = new FileTransferManager();
  readonly lifecycle: LifecycleManager;

  constructor(
    private readonly io: GhostServer,
    readonly roomId: string,
    onGraceExpired: (room: Room) => void
  ) {
    this.lifecycle = new LifecycleManager(() => onGraceExpired(this));
  }

  get state(): RoomState {
    return this.lifecycle.state;
  }

  snapshot(): RoomSnapshot {
    return {
      roomId: this.roomId,
      createdAt: this.createdAt,
      participants: this.presence.connectedParticipants(),
      chat: this.chat.snapshot(),
      notes: this.notes.snapshot(),
      whiteboard: this.whiteboard.snapshot(),
      files: this.files.snapshot(),
    };
  }

  /**
   * A participant's connection is gone (explicit leave, disconnect, or heartbeat
   * timeout). Broadcasts their departure, withdraws their file offers, and starts
   * the grace countdown if the room just became empty.
   */
  handleDeparture(participantId: string, reason: 'left' | 'timeout'): void {
    const record = this.presence.markDisconnected(participantId);
    if (!record) return;

    this.io.to(this.roomId).emit('participant:left', participantId, reason);
    this.io.to(this.roomId).emit('whiteboard:pointer', participantId, null);
    for (const fileId of this.files.removeOffersFrom(participantId)) {
      this.io.to(this.roomId).emit('file:cancel', fileId, participantId);
    }

    if (this.presence.connectedCount() === 0) {
      this.lifecycle.scheduleDestroy();
    }
  }

  broadcastFileOffer(offer: FileOffer): void {
    this.io.to(this.roomId).emit('file:offer', offer);
  }

  /** Full teardown — after this the room object is dropped and GC'd. */
  destroy(): void {
    this.io.to(this.roomId).emit('room:destroy');
    this.io.in(this.roomId).socketsLeave(this.roomId);
    this.lifecycle.destroy();
    this.presence.destroy();
    this.chat.destroy();
    this.notes.destroy();
    this.whiteboard.destroy();
    this.files.destroy();
  }
}
