import { nanoid } from 'nanoid';
import {
  GRACE_PERIOD_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_PARTICIPANTS,
  type MediaState,
  type Participant,
  type ParticipantToken,
} from '@ghostdesk/shared';
import { createAnonymousIdentity } from '../identity.js';

export interface ParticipantRecord {
  info: Participant;
  secret: string;
  /** null while disconnected (kept dormant for reconnect within grace). */
  socketId: string | null;
  lastHeartbeat: number;
  disconnectedAt: number | null;
}

export class PresenceManager {
  private records = new Map<string, ParticipantRecord>();

  /** Creates a brand-new participant; returns null when the room is full. */
  join(socketId: string): { record: ParticipantRecord; token: ParticipantToken } | null {
    if (this.connectedCount() >= MAX_PARTICIPANTS) return null;

    const participantId = nanoid(12);
    const taken = new Set([...this.records.values()].map((r) => r.info.name));
    const identity = createAnonymousIdentity(participantId, taken);
    const record: ParticipantRecord = {
      info: {
        participantId,
        name: identity.name,
        color: identity.color,
        joinedAt: Date.now(),
        micOn: false,
        camOn: false,
      },
      secret: nanoid(24),
      socketId,
      lastHeartbeat: Date.now(),
      disconnectedAt: null,
    };
    this.records.set(participantId, record);
    return { record, token: { participantId, secret: record.secret } };
  }

  /**
   * Restores a participant from a reconnect token. Returns the record with the
   * previous socket id (so the caller can evict a stale connection), or null if
   * the token doesn't match — the caller should fall back to a fresh join.
   */
  restore(
    token: ParticipantToken,
    socketId: string
  ): { record: ParticipantRecord; previousSocketId: string | null } | null {
    const record = this.records.get(token.participantId);
    if (!record || record.secret !== token.secret) return null;
    const previousSocketId = record.socketId;
    record.socketId = socketId;
    record.lastHeartbeat = Date.now();
    record.disconnectedAt = null;
    return { record, previousSocketId };
  }

  markDisconnected(participantId: string): ParticipantRecord | null {
    const record = this.records.get(participantId);
    if (!record || record.socketId === null) return null;
    record.socketId = null;
    record.disconnectedAt = Date.now();
    return record;
  }

  heartbeat(participantId: string): void {
    const record = this.records.get(participantId);
    if (record) record.lastHeartbeat = Date.now();
  }

  rename(participantId: string, name: string): Participant | null {
    const record = this.records.get(participantId);
    if (!record) return null;
    record.info.name = name;
    return record.info;
  }

  setMedia(participantId: string, state: MediaState): Participant | null {
    const record = this.records.get(participantId);
    if (!record) return null;
    record.info.micOn = state.micOn;
    record.info.camOn = state.camOn;
    return record.info;
  }

  get(participantId: string): ParticipantRecord | undefined {
    return this.records.get(participantId);
  }

  socketIdOf(participantId: string): string | null {
    return this.records.get(participantId)?.socketId ?? null;
  }

  connectedCount(): number {
    let n = 0;
    for (const r of this.records.values()) if (r.socketId !== null) n++;
    return n;
  }

  connectedParticipants(): Participant[] {
    return [...this.records.values()].filter((r) => r.socketId !== null).map((r) => r.info);
  }

  /** Connected participants whose heartbeat has gone silent past the timeout. */
  staleParticipants(now: number): ParticipantRecord[] {
    return [...this.records.values()].filter(
      (r) => r.socketId !== null && now - r.lastHeartbeat > HEARTBEAT_TIMEOUT_MS
    );
  }

  /** Drop dormant records whose reconnect window has passed. */
  pruneDormant(now: number): void {
    for (const [id, r] of this.records) {
      if (r.socketId === null && r.disconnectedAt !== null && now - r.disconnectedAt > GRACE_PERIOD_MS) {
        this.records.delete(id);
      }
    }
  }

  destroy(): void {
    this.records.clear();
  }
}
