import * as Y from 'yjs';
import {
  HEARTBEAT_INTERVAL_MS,
  type JoinedRoom,
  type WhiteboardElement,
  type PointerPosition,
} from '@ghostdesk/shared';
import {
  handleAccept,
  handleCancel,
  handleComplete,
  handleIncomingChannel,
  handlePeerGone,
  resetFileTransfers,
} from './fileTransfer.js';
import { clearToken, loadToken, saveToken } from './session.js';
import { getSocket, type GhostSocket } from './socket.js';
import {
  addToast,
  applyWhiteboardRemote,
  resetRoomState,
  upsertParticipant,
  useGhostStore,
} from './store.js';
import { Mesh } from './webrtc.js';

let mesh: Mesh | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentRoomId: string | null = null;
let listenersBound = false;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const REMOTE_ORIGIN = 'ghostdesk-remote';

export function getMesh(): Mesh | null {
  return mesh;
}

/** Landing page action: create a room, store the creator token, hand back the id. */
export function createRoom(
  callback: (roomId: string | null, error?: import('@ghostdesk/shared').RoomError) => void
): void {
  const socket = getSocket();
  bindListeners(socket);
  const doCreate = () =>
    socket.emit('room:create', (result) => {
      if (result.ok) {
        saveToken(result.roomId, result.token);
        callback(result.roomId);
      } else {
        callback(null, result.error);
      }
    });
  if (socket.connected) doCreate();
  else {
    socket.once('connect', doCreate);
    socket.connect();
  }
}

/** Entry point from the room page. Safe to call again for the same room. */
export function joinRoom(roomId: string): void {
  const socket = getSocket();
  bindListeners(socket);

  if (currentRoomId && currentRoomId !== roomId) {
    teardown(socket, true);
  }
  currentRoomId = roomId;
  useGhostStore.setState({ phase: 'joining', roomId });

  if (socket.connected) {
    emitJoin(socket, roomId);
  } else {
    // The permanent 'connect' listener performs the join (phase is 'joining').
    // Registering a second handler here would emit room:join twice and mint a
    // duplicate "ghost" participant.
    socket.connect();
  }
}

function emitJoin(socket: GhostSocket, roomId: string): void {
  socket.emit('room:join', { roomId, token: loadToken(roomId) }, (result) => {
    if (currentRoomId !== roomId) return; // user navigated away meanwhile
    if (!result.ok) {
      const phase = result.error === 'not_found' ? 'destroyed' : 'error';
      useGhostStore.setState({ phase, errorCode: result.error });
      return;
    }
    try {
      onJoined(socket, result);
    } catch (err) {
      // Never strand the user on the joining screen: surface a retryable error.
      console.error('Failed to process room snapshot', err);
      useGhostStore.setState({ phase: 'error', errorCode: null });
    }
  });
}

function onJoined(socket: GhostSocket, joined: JoinedRoom): void {
  saveToken(joined.roomId, joined.token);

  // A rejoin after a transport drop rebuilds everything from the snapshot.
  const rebuilding = mesh !== null;
  if (rebuilding) {
    mesh?.destroy();
    resetFileTransfers();
  }

  const doc = new Y.Doc();
  // Socket.IO delivers binary as ArrayBuffer; Yjs requires Uint8Array.
  if (joined.snapshot.notes) {
    Y.applyUpdate(doc, new Uint8Array(joined.snapshot.notes), REMOTE_ORIGIN);
  }
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE_ORIGIN) socket.emit('notes:update', update);
  });

  const participants: Record<string, (typeof joined.snapshot.participants)[number]> = {};
  for (const p of joined.snapshot.participants) participants[p.participantId] = p;

  const whiteboardElements: Record<string, WhiteboardElement> = {};
  for (const el of joined.snapshot.whiteboard) whiteboardElements[el.id] = el;

  const fileOffers: Record<string, (typeof joined.snapshot.files)[number]> = {};
  for (const o of joined.snapshot.files) fileOffers[o.fileId] = o;

  const previousStream = useGhostStore.getState().localStream;

  useGhostStore.setState((s) => ({
    phase: 'joined',
    errorCode: null,
    roomId: joined.roomId,
    createdAt: joined.snapshot.createdAt,
    selfId: joined.self.participantId,
    participants,
    chat: joined.snapshot.chat,
    typingIds: [],
    fileOffers,
    remoteStreams: {},
    notesDoc: doc,
    whiteboardElements,
    whiteboardRemoteTick: s.whiteboardRemoteTick + 1,
    pointers: {},
  }));

  mesh = new Mesh(socket, joined.self.participantId, {
    onStream: (id, stream) => {
      useGhostStore.setState((s) => ({ remoteStreams: { ...s.remoteStreams, [id]: stream } }));
    },
    onStreamGone: (id) => {
      useGhostStore.setState((s) => {
        const streams = { ...s.remoteStreams };
        delete streams[id];
        return { remoteStreams: streams };
      });
    },
    onDataChannel: handleIncomingChannel,
  });

  // Newest joiner initiates the mesh connection to everyone already present.
  for (const p of joined.snapshot.participants) {
    if (p.participantId !== joined.self.participantId) mesh.initiateTo(p.participantId);
  }

  if (previousStream) {
    mesh.setLocalStream(previousStream);
  } else {
    void requestMedia(socket);
  }

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => socket.emit('heartbeat'), HEARTBEAT_INTERVAL_MS);

  if (rebuilding) addToast('Reconnected.', 'success');
}

async function requestMedia(socket: GhostSocket): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const { micOn, camOn, phase } = useGhostStore.getState();
    // The user may have left (or the page unmounted) while the permission
    // prompt was open — release the hardware immediately in that case.
    if (phase !== 'joined' || currentRoomId === null) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    for (const track of stream.getAudioTracks()) track.enabled = micOn;
    for (const track of stream.getVideoTracks()) track.enabled = camOn;
    useGhostStore.setState({ localStream: stream, mediaError: null });
    mesh?.setLocalStream(stream);
    socket.emit('participant:media', { micOn, camOn });
  } catch {
    useGhostStore.setState({
      mediaError: 'Camera/microphone unavailable or denied — you can still chat, draw and share files.',
      micOn: false,
      camOn: false,
    });
    socket.emit('participant:media', { micOn: false, camOn: false });
  }
}

function bindListeners(socket: GhostSocket): void {
  if (listenersBound) return;
  listenersBound = true;

  socket.on('connect', () => {
    // Transport came back after a drop mid-session: rejoin with our token.
    const { phase } = useGhostStore.getState();
    if (currentRoomId && (phase === 'joined' || phase === 'joining')) {
      emitJoin(socket, currentRoomId);
    }
  });

  socket.on('disconnect', () => {
    const { phase } = useGhostStore.getState();
    if (phase === 'joined') addToast('Connection lost — reconnecting…', 'error');
  });

  socket.on('room:destroy', () => {
    if (currentRoomId) clearToken(currentRoomId);
    fullCleanup();
    resetRoomState('destroyed');
  });

  socket.on('participant:joined', (participant) => {
    upsertParticipant(participant);
    addToast(`${participant.name} joined`, 'info');
  });

  socket.on('participant:left', (participantId, reason) => {
    const { participants } = useGhostStore.getState();
    const gone = participants[participantId];
    mesh?.removePeer(participantId);
    handlePeerGone(participantId);
    clearTypingTimer(participantId);
    useGhostStore.setState((s) => {
      const next = { ...s.participants };
      delete next[participantId];
      const pointers = { ...s.pointers };
      delete pointers[participantId];
      return {
        participants: next,
        pointers,
        typingIds: s.typingIds.filter((id) => id !== participantId),
      };
    });
    if (gone) addToast(`${gone.name} ${reason === 'timeout' ? 'lost connection' : 'left'}`, 'info');
  });

  socket.on('participant:updated', (participant) => {
    upsertParticipant(participant);
  });

  socket.on('chat:message', (message) => {
    useGhostStore.setState((s) => ({ chat: [...s.chat, message] }));
  });

  socket.on('chat:typing', (participantId, isTyping) => {
    clearTypingTimer(participantId);
    if (isTyping) {
      useGhostStore.setState((s) => ({
        typingIds: s.typingIds.includes(participantId) ? s.typingIds : [...s.typingIds, participantId],
      }));
      typingTimers.set(
        participantId,
        setTimeout(() => {
          typingTimers.delete(participantId);
          useGhostStore.setState((s) => ({ typingIds: s.typingIds.filter((id) => id !== participantId) }));
        }, 4000)
      );
    } else {
      useGhostStore.setState((s) => ({ typingIds: s.typingIds.filter((id) => id !== participantId) }));
    }
  });

  socket.on('notes:update', (update) => {
    const { notesDoc } = useGhostStore.getState();
    if (notesDoc) Y.applyUpdate(notesDoc, new Uint8Array(update), REMOTE_ORIGIN);
  });

  socket.on('whiteboard:update', (_from, elements) => {
    applyWhiteboardRemote(elements);
  });

  socket.on('whiteboard:pointer', (participantId, pointer) => {
    useGhostStore.setState((s) => {
      const pointers = { ...s.pointers };
      if (pointer === null) delete pointers[participantId];
      else pointers[participantId] = pointer;
      return { pointers };
    });
  });

  socket.on('webrtc:offer', (from, description) => void mesh?.handleDescription(from, description));
  socket.on('webrtc:answer', (from, description) => void mesh?.handleDescription(from, description));
  socket.on('webrtc:ice', (from, candidate) => void mesh?.handleIce(from, candidate));

  socket.on('file:offer', (offer) => {
    useGhostStore.setState((s) => ({ fileOffers: { ...s.fileOffers, [offer.fileId]: offer } }));
    const sender = useGhostStore.getState().participants[offer.senderId];
    addToast(`${sender?.name ?? 'Someone'} is sharing "${offer.name}"`, 'info');
  });

  socket.on('file:accept', (fileId, receiverId) => {
    if (mesh) handleAccept(mesh, fileId, receiverId);
  });

  socket.on('file:reject', () => {
    // Receiver dismissed the offer; nothing to do on the sender side.
  });

  socket.on('file:cancel', handleCancel);
  socket.on('file:complete', handleComplete);
}

function clearTypingTimer(participantId: string): void {
  const timer = typingTimers.get(participantId);
  if (timer) clearTimeout(timer);
  typingTimers.delete(participantId);
}

function fullCleanup(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  mesh?.destroy();
  mesh = null;
  resetFileTransfers();
  for (const timer of typingTimers.values()) clearTimeout(timer);
  typingTimers.clear();
  const { notesDoc } = useGhostStore.getState();
  notesDoc?.destroy();
}

/** Releases camera/microphone hardware; the light must go off the moment the
 * user is no longer in any workspace. */
function stopLocalMedia(): void {
  const { localStream } = useGhostStore.getState();
  localStream?.getTracks().forEach((track) => track.stop());
  useGhostStore.setState({ localStream: null });
}

function teardown(socket: GhostSocket, silent: boolean): void {
  socket.emit('room:leave');
  fullCleanup();
  stopLocalMedia();
  if (!silent) resetRoomState('left');
  currentRoomId = null;
}

/** User clicked "Leave workspace". */
export function leaveRoom(): void {
  const socket = getSocket();
  if (currentRoomId) clearToken(currentRoomId);
  teardown(socket, false);
}

/** Component unmounted (navigation) — leave without touching phase. */
export function unmountRoom(): void {
  teardown(getSocket(), true);
}

// ---- UI actions ------------------------------------------------------------

export function sendChat(text: string): void {
  getSocket().emit('chat:send', text);
}

export function sendTyping(isTyping: boolean): void {
  getSocket().emit('chat:typing', isTyping);
}

export function renameSelf(name: string): void {
  getSocket().emit('participant:rename', name);
}

export function toggleMic(): void {
  const { localStream, micOn, camOn } = useGhostStore.getState();
  const next = !micOn;
  for (const track of localStream?.getAudioTracks() ?? []) track.enabled = next;
  useGhostStore.setState({ micOn: next });
  getSocket().emit('participant:media', { micOn: next, camOn });
}

export function toggleCam(): void {
  const { localStream, micOn, camOn } = useGhostStore.getState();
  const next = !camOn;
  for (const track of localStream?.getVideoTracks() ?? []) track.enabled = next;
  useGhostStore.setState({ camOn: next });
  getSocket().emit('participant:media', { micOn, camOn: next });
}

export function sendWhiteboardDiff(elements: WhiteboardElement[]): void {
  if (elements.length > 0) getSocket().emit('whiteboard:update', elements);
}

export function sendPointer(pointer: PointerPosition | null): void {
  getSocket().emit('whiteboard:pointer', pointer);
}
