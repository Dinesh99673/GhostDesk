import {
  isValidFileOffer,
  isValidRoomId,
  isValidToken,
  REACTION_EMOJIS,
  sanitizeChatText,
  sanitizeName,
  type FileOffer,
  type JoinedRoom,
} from '@ghostdesk/shared';
import type { RateLimiter } from './rateLimiter.js';
import type { Room } from './room.js';
import type { RoomStore } from './roomStore.js';
import type { GhostServer, GhostSocket } from './types.js';

export interface SocketLimiters {
  create: RateLimiter;
  join: RateLimiter;
}

function ipOf(socket: GhostSocket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return socket.handshake.address;
}

/** Resolves the socket's current room + participant; null when not in a room. */
function context(store: RoomStore, socket: GhostSocket): { room: Room; participantId: string } | null {
  const { roomId, participantId } = socket.data;
  if (!roomId || !participantId) return null;
  const room = store.get(roomId);
  if (!room) return null;
  // Guard against evicted/stale sockets still emitting room events.
  if (room.presence.socketIdOf(participantId) !== socket.id) return null;
  return { room, participantId };
}

function joinRoomAsNew(room: Room, socket: GhostSocket): JoinedRoom | null {
  const joined = room.presence.join(socket.id);
  if (!joined) return null;

  socket.data.roomId = room.roomId;
  socket.data.participantId = joined.record.info.participantId;
  socket.join(room.roomId);
  socket.to(room.roomId).emit('participant:joined', joined.record.info);
  room.lifecycle.cancelDestroy();

  return {
    ok: true,
    roomId: room.roomId,
    token: joined.token,
    self: joined.record.info,
    snapshot: room.snapshot(),
  };
}

export function registerSocketHandlers(io: GhostServer, store: RoomStore, limiters: SocketLimiters): void {
  io.on('connection', (socket) => {
    socket.on('room:create', (ack) => {
      if (typeof ack !== 'function') return;
      if (!limiters.create.allow(ipOf(socket))) return ack({ ok: false, error: 'rate_limited' });

      const room = store.create();
      if (!room) return ack({ ok: false, error: 'at_capacity' });

      const joined = joinRoomAsNew(room, socket);
      // A brand-new room can't be full; this only guards the type.
      if (!joined) return ack({ ok: false, error: 'full' });
      ack(joined);
    });

    socket.on('room:join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!limiters.join.allow(ipOf(socket))) return ack({ ok: false, error: 'rate_limited' });
      if (typeof payload !== 'object' || payload === null || !isValidRoomId(payload.roomId)) {
        return ack({ ok: false, error: 'invalid_payload' });
      }

      const room = store.get(payload.roomId);
      if (!room || !room.lifecycle.joinable) return ack({ ok: false, error: 'not_found' });

      // Idempotency: the same socket joining its current room again (duplicate
      // emit during connection setup) must not mint a second participant.
      if (socket.data.roomId === room.roomId && socket.data.participantId) {
        const existing = room.presence.get(socket.data.participantId);
        if (existing && existing.socketId === socket.id) {
          return ack({
            ok: true,
            roomId: room.roomId,
            token: { participantId: existing.info.participantId, secret: existing.secret },
            self: existing.info,
            snapshot: room.snapshot(),
          });
        }
      }

      // Reconnect path: a valid token restores the same participant (identity
      // preserved, no duplicate) and cancels a pending destruction.
      if (payload.token && isValidToken(payload.token)) {
        const restored = room.presence.restore(payload.token, socket.id);
        if (restored) {
          const { record, previousSocketId } = restored;
          const participantId = record.info.participantId;
          const rejoinedFromDormant = previousSocketId === null;
          // A new connection replaced a still-registered one — e.g. a page
          // reload whose rejoin raced ahead of the old socket's disconnect.
          const tookOver = previousSocketId !== null && previousSocketId !== socket.id;

          if (tookOver) {
            const previous = io.sockets.sockets.get(previousSocketId);
            if (previous) {
              previous.data.roomId = undefined;
              previous.data.participantId = undefined;
              previous.disconnect(true);
            }
          }

          socket.data.roomId = room.roomId;
          socket.data.participantId = participantId;
          socket.join(room.roomId);
          room.lifecycle.cancelDestroy();

          if (tookOver) {
            // Peers still hold WebRTC state bound to the dead connection; a
            // left/joined resync makes them tear it down before the rejoiner's
            // fresh offers arrive (per-connection ordering guarantees this).
            socket.to(room.roomId).emit('participant:left', participantId, 'left');
            socket.to(room.roomId).emit('whiteboard:pointer', participantId, null);
            for (const fileId of room.files.removeOffersFrom(participantId)) {
              socket.to(room.roomId).emit('file:cancel', fileId, participantId);
            }
          }
          if (rejoinedFromDormant || tookOver) {
            socket.to(room.roomId).emit('participant:joined', record.info);
          }
          return ack({
            ok: true,
            roomId: room.roomId,
            token: { participantId: record.info.participantId, secret: record.secret },
            self: record.info,
            snapshot: room.snapshot(),
          });
        }
      }

      const joined = joinRoomAsNew(room, socket);
      if (!joined) return ack({ ok: false, error: 'full' });
      ack(joined);
    });

    socket.on('room:leave', () => {
      const ctx = context(store, socket);
      if (!ctx) return;
      socket.data.roomId = undefined;
      socket.data.participantId = undefined;
      socket.leave(ctx.room.roomId);
      ctx.room.handleDeparture(ctx.participantId, 'left');
    });

    socket.on('disconnect', () => {
      const ctx = context(store, socket);
      if (!ctx) return;
      ctx.room.handleDeparture(ctx.participantId, 'left');
    });

    socket.on('heartbeat', () => {
      const ctx = context(store, socket);
      if (!ctx) return;
      ctx.room.presence.heartbeat(ctx.participantId);
      socket.emit('heartbeat:ack');
    });

    socket.on('participant:rename', (name) => {
      const ctx = context(store, socket);
      const cleaned = sanitizeName(name);
      if (!ctx || !cleaned) return;
      const updated = ctx.room.presence.rename(ctx.participantId, cleaned);
      if (updated) io.to(ctx.room.roomId).emit('participant:updated', updated);
    });

    socket.on('participant:media', (state) => {
      const ctx = context(store, socket);
      if (!ctx || typeof state !== 'object' || state === null) return;
      const updated = ctx.room.presence.setMedia(ctx.participantId, {
        micOn: state.micOn === true,
        camOn: state.camOn === true,
      });
      if (updated) socket.to(ctx.room.roomId).emit('participant:updated', updated);
    });

    socket.on('chat:send', (text) => {
      const ctx = context(store, socket);
      const cleaned = sanitizeChatText(text);
      if (!ctx || !cleaned) return;
      const sender = ctx.room.presence.get(ctx.participantId);
      if (!sender) return;
      const message = ctx.room.chat.add(sender.info, cleaned);
      io.to(ctx.room.roomId).emit('chat:message', message);
    });

    socket.on('chat:typing', (isTyping) => {
      const ctx = context(store, socket);
      if (!ctx) return;
      socket.to(ctx.room.roomId).emit('chat:typing', ctx.participantId, isTyping === true);
    });

    socket.on('notes:update', (update) => {
      const ctx = context(store, socket);
      if (!ctx || !(update instanceof Uint8Array)) return;
      if (ctx.room.notes.applyUpdate(update)) {
        socket.to(ctx.room.roomId).emit('notes:update', update);
      }
    });

    socket.on('whiteboard:update', (elements) => {
      const ctx = context(store, socket);
      if (!ctx || !Array.isArray(elements) || elements.length === 0 || elements.length > 500) return;
      const accepted = ctx.room.whiteboard.applyDiff(elements);
      if (accepted.length > 0) {
        socket.to(ctx.room.roomId).emit('whiteboard:update', ctx.participantId, accepted);
      }
    });

    socket.on('whiteboard:pointer', (pointer) => {
      const ctx = context(store, socket);
      if (!ctx) return;
      const valid =
        pointer === null ||
        (typeof pointer === 'object' &&
          typeof pointer.x === 'number' &&
          typeof pointer.y === 'number' &&
          Number.isFinite(pointer.x) &&
          Number.isFinite(pointer.y));
      if (!valid) return;
      socket.to(ctx.room.roomId).emit('whiteboard:pointer', ctx.participantId, pointer);
    });

    const relaySignal = (event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:ice') => {
      const handler = (to: string, data: unknown) => {
        const ctx = context(store, socket);
        if (!ctx || typeof to !== 'string' || typeof data !== 'object' || data === null) return;
        const targetSocketId = ctx.room.presence.socketIdOf(to);
        // Payload is an opaque relay between peers; the server never inspects SDP.
        if (targetSocketId) (io.to(targetSocketId) as { emit: (ev: string, ...args: unknown[]) => void }).emit(event, ctx.participantId, data);
      };
      socket.on(event, handler as never);
    };
    relaySignal('webrtc:offer');
    relaySignal('webrtc:answer');
    relaySignal('webrtc:ice');

    socket.on('file:offer', (payload) => {
      const ctx = context(store, socket);
      if (!ctx || !isValidFileOffer(payload)) return;
      const offer: FileOffer = {
        fileId: payload.fileId,
        senderId: ctx.participantId,
        name: payload.name,
        size: payload.size,
        mimeType: payload.mimeType,
        offeredAt: Date.now(),
      };
      if (ctx.room.files.addOffer(offer)) {
        socket.to(ctx.room.roomId).emit('file:offer', offer);
      }
    });

    /** accept/reject/complete are receiver → sender notifications. */
    const relayToSender = (event: 'file:accept' | 'file:reject' | 'file:complete') => {
      socket.on(event, (fileId: string) => {
        const ctx = context(store, socket);
        if (!ctx || typeof fileId !== 'string') return;
        const offer = ctx.room.files.getOffer(fileId);
        if (!offer) return;
        const senderSocketId = ctx.room.presence.socketIdOf(offer.senderId);
        if (senderSocketId) io.to(senderSocketId).emit(event, fileId, ctx.participantId);
      });
    };
    relayToSender('file:accept');
    relayToSender('file:reject');
    relayToSender('file:complete');

    // Reactions are relayed, never stored; a small per-socket throttle stops spam.
    let lastReactionAt = 0;
    socket.on('reaction:send', (emoji) => {
      const ctx = context(store, socket);
      if (!ctx || typeof emoji !== 'string') return;
      if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return;
      const now = Date.now();
      if (now - lastReactionAt < 250) return;
      lastReactionAt = now;
      io.to(ctx.room.roomId).emit('reaction', ctx.participantId, emoji);
    });

    socket.on('file:cancel', (fileId) => {
      const ctx = context(store, socket);
      if (!ctx || typeof fileId !== 'string') return;
      const offer = ctx.room.files.getOffer(fileId);
      if (!offer) return;

      if (offer.senderId === ctx.participantId) {
        // Sender withdraws the offer for everyone.
        ctx.room.files.removeOffer(fileId);
        io.to(ctx.room.roomId).emit('file:cancel', fileId, ctx.participantId);
      } else {
        // Receiver aborts their own transfer; only the sender needs to know.
        const senderSocketId = ctx.room.presence.socketIdOf(offer.senderId);
        if (senderSocketId) io.to(senderSocketId).emit('file:cancel', fileId, ctx.participantId);
      }
    });
  });
}
