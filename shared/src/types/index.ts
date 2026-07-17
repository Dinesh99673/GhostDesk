export enum RoomState {
  ACTIVE = 'ACTIVE',
  DESTROYING = 'DESTROYING',
  DESTROYED = 'DESTROYED',
}

export interface Participant {
  participantId: string;
  name: string;
  color: string;
  joinedAt: number;
  micOn: boolean;
  camOn: boolean;
}

/** Proof of identity for reconnection; kept in sessionStorage, dies with the tab. */
export interface ParticipantToken {
  participantId: string;
  secret: string;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  /** Denormalized so messages stay attributed after the sender leaves. */
  name: string;
  color: string;
  text: string;
  sentAt: number;
}

/** Loose shape of an Excalidraw element — synced opaquely, reconciled by id/version. */
export interface WhiteboardElement {
  id: string;
  version: number;
  versionNonce?: number;
  isDeleted?: boolean;
  [key: string]: unknown;
}

export interface PointerPosition {
  x: number;
  y: number;
}

export interface FileOffer {
  fileId: string;
  senderId: string;
  name: string;
  size: number;
  mimeType: string;
  offeredAt: number;
}

export interface MediaState {
  micOn: boolean;
  camOn: boolean;
}

/** JSON-serializable mirrors of the DOM RTC types (shared code can't use DOM libs). */
export interface RtcSessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface RtcIceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** One-time state dump sent to a participant when they join (late-joiner sync). */
export interface RoomSnapshot {
  roomId: string;
  createdAt: number;
  participants: Participant[];
  chat: ChatMessage[];
  /** Yjs document state as an encoded update, null when the doc is empty. */
  notes: Uint8Array | null;
  whiteboard: WhiteboardElement[];
  files: FileOffer[];
}
