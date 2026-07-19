import { nanoid } from 'nanoid';
import {
  FILE_BUFFER_HIGH_WATER,
  FILE_BUFFER_LOW_WATER,
  FILE_CHUNK_BYTES,
  MAX_FILE_BYTES,
  type FileOffer,
} from '@ghostdesk/shared';
import { formatBytes } from './format.js';
import { getSocket } from './socket.js';
import { addToast, updateTransfer, useGhostStore } from './store.js';
import type { Mesh } from './webrtc.js';

/** Files being offered by this client, kept locally until sent — never uploaded. */
const sendingFiles = new Map<string, File>();
/** Offers this client accepted and is waiting to receive. */
const expectedReceives = new Map<string, FileOffer>();
const sendAborts = new Map<string, () => void>();
const receiveChannels = new Map<string, RTCDataChannel>();

const PROGRESS_STEP = 512 * 1024;

export const sendKey = (fileId: string, receiverId: string) => `${fileId}:${receiverId}`;

export function offerFile(file: File): void {
  const socket = getSocket();
  const { selfId } = useGhostStore.getState();
  if (!selfId) return;
  if (file.size > MAX_FILE_BYTES) {
    addToast(`"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_FILE_BYTES)}.`, 'error');
    return;
  }
  if (file.size === 0) {
    addToast('Cannot share an empty file.', 'error');
    return;
  }
  const fileId = nanoid(10);
  sendingFiles.set(fileId, file);
  socket.emit('file:offer', {
    fileId,
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
  });
  const offer: FileOffer = {
    fileId,
    senderId: selfId,
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    offeredAt: Date.now(),
  };
  useGhostStore.setState((s) => ({ fileOffers: { ...s.fileOffers, [fileId]: offer } }));
}

/** Sender withdraws an offer: aborts all in-flight sends of it, tells everyone. */
export function withdrawOffer(fileId: string): void {
  getSocket().emit('file:cancel', fileId);
  sendingFiles.delete(fileId);
  for (const [key, abort] of sendAborts) {
    if (key.startsWith(`${fileId}:`)) abort();
  }
  useGhostStore.setState((s) => {
    const offers = { ...s.fileOffers };
    delete offers[fileId];
    return { fileOffers: offers };
  });
}

export function acceptOffer(offer: FileOffer): void {
  expectedReceives.set(offer.fileId, offer);
  useGhostStore.setState((s) => ({
    transfers: {
      ...s.transfers,
      [offer.fileId]: {
        key: offer.fileId,
        fileId: offer.fileId,
        peerId: offer.senderId,
        direction: 'receive',
        name: offer.name,
        size: offer.size,
        mimeType: offer.mimeType,
        bytes: 0,
        status: 'waiting',
      },
    },
  }));
  getSocket().emit('file:accept', offer.fileId);
}

/** Receiver dismisses an offer without downloading. */
export function rejectOffer(offer: FileOffer): void {
  getSocket().emit('file:reject', offer.fileId);
  useGhostStore.setState((s) => {
    const offers = { ...s.fileOffers };
    delete offers[offer.fileId];
    return { fileOffers: offers };
  });
}

export function cancelReceive(fileId: string): void {
  getSocket().emit('file:cancel', fileId);
  expectedReceives.delete(fileId);
  receiveChannels.get(fileId)?.close();
  receiveChannels.delete(fileId);
  updateTransfer(fileId, { status: 'cancelled', note: 'Cancelled by you' });
}

export function cancelSend(fileId: string, receiverId: string): void {
  sendAborts.get(sendKey(fileId, receiverId))?.();
  updateTransfer(sendKey(fileId, receiverId), { status: 'cancelled', note: 'Cancelled by you' });
}

/** A receiver accepted our offer — open a channel and stream the file. */
export function handleAccept(mesh: Mesh, fileId: string, receiverId: string): void {
  const file = sendingFiles.get(fileId);
  if (!file) return;

  const key = sendKey(fileId, receiverId);
  useGhostStore.setState((s) => ({
    transfers: {
      ...s.transfers,
      [key]: {
        key,
        fileId,
        peerId: receiverId,
        direction: 'send',
        name: file.name,
        size: file.size,
        mimeType: file.type,
        bytes: 0,
        status: 'waiting',
      },
    },
  }));

  const channel = mesh.openChannel(receiverId, `file:${fileId}`);
  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = FILE_BUFFER_LOW_WATER;

  let aborted = false;
  sendAborts.set(key, () => {
    aborted = true;
    if (channel.readyState === 'open') channel.close();
  });

  channel.onopen = () => {
    void pump();
  };
  channel.onerror = () => {
    if (!aborted) updateTransfer(key, { status: 'error', note: 'Connection error' });
    sendAborts.delete(key);
  };

  async function pump(): Promise<void> {
    updateTransfer(key, { status: 'active' });
    let offset = 0;
    let lastReport = 0;
    try {
      while (offset < file!.size) {
        if (aborted) return;
        if (channel.readyState !== 'open') {
          updateTransfer(key, { status: 'error', note: 'Channel closed mid-transfer' });
          return;
        }
        if (channel.bufferedAmount > FILE_BUFFER_HIGH_WATER) {
          await drainOnce(channel);
          continue;
        }
        const chunk = await file!.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer();
        channel.send(chunk);
        offset += chunk.byteLength;
        if (offset - lastReport >= PROGRESS_STEP || offset === file!.size) {
          updateTransfer(key, { bytes: offset });
          lastReport = offset;
        }
      }
      // Let the buffer flush before closing so the tail chunks arrive.
      while (channel.bufferedAmount > 0 && channel.readyState === 'open' && !aborted) {
        await drainOnce(channel);
      }
      if (!aborted) {
        updateTransfer(key, { status: 'done', bytes: file!.size });
        channel.close();
      }
    } catch {
      if (!aborted) updateTransfer(key, { status: 'error', note: 'Transfer failed' });
    } finally {
      sendAborts.delete(key);
    }
  }
}

function drainOnce(channel: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      channel.removeEventListener('bufferedamountlow', done);
      channel.removeEventListener('close', done);
      clearTimeout(timer);
      resolve();
    };
    // Fallback tick in case bufferedamountlow never fires (browser quirks).
    const timer = setTimeout(done, 500);
    channel.addEventListener('bufferedamountlow', done);
    channel.addEventListener('close', done);
  });
}

/** Incoming data channel from the mesh — route file channels to a receiver. */
export function handleIncomingChannel(from: string, channel: RTCDataChannel): void {
  if (!channel.label.startsWith('file:')) return; // keepalive channel etc.
  const fileId = channel.label.slice('file:'.length);
  const offer = expectedReceives.get(fileId);
  if (!offer || offer.senderId !== from) {
    channel.close();
    return;
  }

  channel.binaryType = 'arraybuffer';
  receiveChannels.set(fileId, channel);
  const chunks: ArrayBuffer[] = [];
  let received = 0;
  let lastReport = 0;
  let finished = false;

  updateTransfer(fileId, { status: 'active' });

  channel.onmessage = (event) => {
    const data = event.data as ArrayBuffer;
    chunks.push(data);
    received += data.byteLength;
    if (received - lastReport >= PROGRESS_STEP) {
      updateTransfer(fileId, { bytes: received });
      lastReport = received;
    }
    if (received >= offer.size) {
      finished = true;
      const blob = new Blob(chunks, { type: offer.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      updateTransfer(fileId, { bytes: received, status: 'done', url });
      getSocket().emit('file:complete', fileId);
      expectedReceives.delete(fileId);
      receiveChannels.delete(fileId);
      channel.close();
      addToast(`Received "${offer.name}"`, 'success');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = offer.name;
      anchor.click();
    }
  };
  channel.onclose = () => {
    receiveChannels.delete(fileId);
    if (!finished && expectedReceives.has(fileId)) {
      expectedReceives.delete(fileId);
      updateTransfer(fileId, { status: 'error', note: 'Connection closed before completion' });
    }
  };
  channel.onerror = channel.onclose as never;
}

/** file:cancel arrived — either the offer was withdrawn or one side aborted. */
export function handleCancel(fileId: string, byId: string): void {
  const { fileOffers, transfers, selfId } = useGhostStore.getState();
  const offer = fileOffers[fileId];

  if (offer && offer.senderId === byId) {
    // Offer withdrawn (sender cancelled or left the room).
    useGhostStore.setState((s) => {
      const offers = { ...s.fileOffers };
      delete offers[fileId];
      return { fileOffers: offers };
    });
    if (expectedReceives.has(fileId)) {
      expectedReceives.delete(fileId);
      receiveChannels.get(fileId)?.close();
      receiveChannels.delete(fileId);
      updateTransfer(fileId, { status: 'cancelled', note: 'Sender left — transfer cancelled' });
      addToast(`Transfer of "${offer.name}" was cancelled by the sender.`, 'error');
    }
    return;
  }

  // A receiver cancelled their download of our offer.
  if (selfId && offer?.senderId === selfId) {
    const key = sendKey(fileId, byId);
    if (transfers[key]) {
      sendAborts.get(key)?.();
      updateTransfer(key, { status: 'cancelled', note: 'Cancelled by receiver' });
    }
  }
}

export function handleComplete(fileId: string, receiverId: string): void {
  updateTransfer(sendKey(fileId, receiverId), { status: 'done' });
}

/** A peer left: abort any sends targeting them. */
export function handlePeerGone(participantId: string): void {
  const { transfers } = useGhostStore.getState();
  for (const t of Object.values(transfers)) {
    if (t.direction === 'send' && t.peerId === participantId && (t.status === 'active' || t.status === 'waiting')) {
      sendAborts.get(t.key)?.();
      updateTransfer(t.key, { status: 'cancelled', note: 'Receiver left' });
    }
  }
}

export function resetFileTransfers(): void {
  for (const abort of sendAborts.values()) abort();
  sendAborts.clear();
  for (const channel of receiveChannels.values()) channel.close();
  receiveChannels.clear();
  sendingFiles.clear();
  expectedReceives.clear();
}
