import { create } from 'zustand';
import type * as Y from 'yjs';
import type {
  ChatMessage,
  FileOffer,
  Participant,
  PointerPosition,
  RoomError,
  WhiteboardElement,
} from '@ghostdesk/shared';

export type RoomPhase = 'joining' | 'joined' | 'destroyed' | 'left' | 'error';

export type TransferStatus = 'waiting' | 'active' | 'done' | 'cancelled' | 'error';

export interface Transfer {
  key: string;
  fileId: string;
  /** The other side of this transfer. */
  peerId: string;
  direction: 'send' | 'receive';
  name: string;
  size: number;
  mimeType: string;
  bytes: number;
  status: TransferStatus;
  /** Object URL of the received blob, present when a receive completes. */
  url?: string;
  note?: string;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

interface GhostState {
  phase: RoomPhase;
  errorCode: RoomError | null;
  roomId: string | null;
  createdAt: number | null;
  selfId: string | null;

  participants: Record<string, Participant>;
  chat: ChatMessage[];
  typingIds: string[];

  fileOffers: Record<string, FileOffer>;
  transfers: Record<string, Transfer>;

  localStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  mediaError: string | null;
  remoteStreams: Record<string, MediaStream>;

  notesDoc: Y.Doc | null;

  whiteboardElements: Record<string, WhiteboardElement>;
  /** Bumped on every remote whiteboard change so the mounted canvas can pull. */
  whiteboardRemoteTick: number;
  pointers: Record<string, PointerPosition>;

  toasts: Toast[];
}

export const useGhostStore = create<GhostState>(() => ({
  phase: 'joining',
  errorCode: null,
  roomId: null,
  createdAt: null,
  selfId: null,
  participants: {},
  chat: [],
  typingIds: [],
  fileOffers: {},
  transfers: {},
  localStream: null,
  micOn: true,
  camOn: true,
  mediaError: null,
  remoteStreams: {},
  notesDoc: null,
  whiteboardElements: {},
  whiteboardRemoteTick: 0,
  pointers: {},
  toasts: [],
}));

let toastSeq = 1;
export function addToast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = toastSeq++;
  useGhostStore.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => {
    useGhostStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, 4000);
}

export function updateTransfer(key: string, patch: Partial<Transfer>): void {
  useGhostStore.setState((s) => {
    const existing = s.transfers[key];
    if (!existing) return s;
    return { transfers: { ...s.transfers, [key]: { ...existing, ...patch } } };
  });
}

export function upsertParticipant(participant: Participant): void {
  useGhostStore.setState((s) => ({
    participants: { ...s.participants, [participant.participantId]: participant },
  }));
}

/** Applies remote whiteboard elements, keeping the winner per element id. */
export function applyWhiteboardRemote(elements: WhiteboardElement[]): void {
  useGhostStore.setState((s) => {
    const next = { ...s.whiteboardElements };
    for (const el of elements) {
      const existing = next[el.id];
      if (!existing || wins(el, existing)) next[el.id] = el;
    }
    return { whiteboardElements: next, whiteboardRemoteTick: s.whiteboardRemoteTick + 1 };
  });
}

/** Records locally-authored elements without bumping the remote tick (no echo). */
export function recordWhiteboardLocal(elements: WhiteboardElement[]): void {
  useGhostStore.setState((s) => {
    const next = { ...s.whiteboardElements };
    for (const el of elements) next[el.id] = el;
    return { whiteboardElements: next };
  });
}

export function wins(incoming: WhiteboardElement, existing: WhiteboardElement): boolean {
  if (incoming.version !== existing.version) return incoming.version > existing.version;
  return (incoming.versionNonce ?? 0) < (existing.versionNonce ?? 0);
}

/** Full reset used when leaving a room or joining a new one. */
export function resetRoomState(phase: RoomPhase): void {
  const { transfers, localStream } = useGhostStore.getState();
  for (const t of Object.values(transfers)) {
    if (t.url) URL.revokeObjectURL(t.url);
  }
  localStream?.getTracks().forEach((track) => track.stop());
  useGhostStore.setState({
    phase,
    errorCode: null,
    roomId: null,
    createdAt: null,
    selfId: null,
    participants: {},
    chat: [],
    typingIds: [],
    fileOffers: {},
    transfers: {},
    localStream: null,
    micOn: true,
    camOn: true,
    mediaError: null,
    remoteStreams: {},
    notesDoc: null,
    whiteboardElements: {},
    whiteboardRemoteTick: 0,
    pointers: {},
  });
}
