import type {
  ChatMessage,
  FileOffer,
  MediaState,
  Participant,
  ParticipantToken,
  PointerPosition,
  RoomSnapshot,
  RtcIceCandidate,
  RtcSessionDescription,
  WhiteboardElement,
} from '../types/index.js';

export type Ack<T> = (result: T) => void;

export type RoomError =
  | 'not_found'
  | 'full'
  | 'at_capacity'
  | 'rate_limited'
  | 'invalid_payload';

export interface JoinedRoom {
  ok: true;
  roomId: string;
  token: ParticipantToken;
  self: Participant;
  snapshot: RoomSnapshot;
}

export interface RoomFailure {
  ok: false;
  error: RoomError;
}

export type CreateRoomResult = JoinedRoom | RoomFailure;
export type JoinRoomResult = JoinedRoom | RoomFailure;

export interface JoinRoomPayload {
  roomId: string;
  /** Present on refresh/reconnect — restores the same participant. */
  token?: ParticipantToken | null;
}

export interface ClientToServerEvents {
  'room:create': (ack: Ack<CreateRoomResult>) => void;
  'room:join': (payload: JoinRoomPayload, ack: Ack<JoinRoomResult>) => void;
  'room:leave': () => void;

  'participant:rename': (name: string) => void;
  'participant:media': (state: MediaState) => void;

  'chat:send': (text: string) => void;
  'chat:typing': (isTyping: boolean) => void;

  'notes:update': (update: Uint8Array) => void;

  'whiteboard:update': (elements: WhiteboardElement[]) => void;
  'whiteboard:pointer': (pointer: PointerPosition | null) => void;

  'webrtc:offer': (to: string, description: RtcSessionDescription) => void;
  'webrtc:answer': (to: string, description: RtcSessionDescription) => void;
  'webrtc:ice': (to: string, candidate: RtcIceCandidate) => void;

  'file:offer': (offer: { fileId: string; name: string; size: number; mimeType: string }) => void;
  'file:accept': (fileId: string) => void;
  'file:reject': (fileId: string) => void;
  'file:cancel': (fileId: string) => void;
  'file:complete': (fileId: string) => void;

  heartbeat: () => void;
}

export interface ServerToClientEvents {
  /** Emitted to any sockets still attached when a room is torn down. */
  'room:destroy': () => void;

  'participant:joined': (participant: Participant) => void;
  'participant:left': (participantId: string, reason: 'left' | 'timeout') => void;
  'participant:updated': (participant: Participant) => void;

  'chat:message': (message: ChatMessage) => void;
  'chat:typing': (participantId: string, isTyping: boolean) => void;

  'notes:update': (update: Uint8Array) => void;

  'whiteboard:update': (from: string, elements: WhiteboardElement[]) => void;
  'whiteboard:pointer': (participantId: string, pointer: PointerPosition | null) => void;

  'webrtc:offer': (from: string, description: RtcSessionDescription) => void;
  'webrtc:answer': (from: string, description: RtcSessionDescription) => void;
  'webrtc:ice': (from: string, candidate: RtcIceCandidate) => void;

  'file:offer': (offer: FileOffer) => void;
  'file:accept': (fileId: string, receiverId: string) => void;
  'file:reject': (fileId: string, receiverId: string) => void;
  /** byId is the participant who cancelled; also used when an offer is withdrawn (sender left). */
  'file:cancel': (fileId: string, byId: string) => void;
  'file:complete': (fileId: string, receiverId: string) => void;

  'heartbeat:ack': () => void;
}
