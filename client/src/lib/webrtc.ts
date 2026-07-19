import type { RtcIceCandidate, RtcSessionDescription } from '@ghostdesk/shared';
import type { GhostSocket } from './socket.js';

export interface MeshCallbacks {
  onStream(participantId: string, stream: MediaStream): void;
  onStreamGone(participantId: string): void;
  onDataChannel(participantId: string, channel: RTCDataChannel): void;
}

interface Peer {
  pc: RTCPeerConnection;
  /** Deterministic role for the perfect-negotiation glare rule. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: (import.meta.env.VITE_TURN_USERNAME as string | undefined) ?? '',
      credential: (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) ?? '',
    });
  }
  return servers;
}

/**
 * Full-mesh WebRTC manager using the "perfect negotiation" pattern.
 *
 * Connection convention: the newest joiner initiates a connection to every
 * existing peer (via an always-created keepalive data channel, so negotiation
 * fires even before any media exists). Existing peers create their side lazily
 * when the first offer arrives. Later media (camera granted, screen share)
 * simply triggers renegotiation, with politeness resolving glare.
 */
export class Mesh {
  private peers = new Map<string, Peer>();
  private localStream: MediaStream | null = null;
  private destroyed = false;

  constructor(
    private readonly socket: GhostSocket,
    private readonly selfId: string,
    private readonly callbacks: MeshCallbacks
  ) {}

  /** Attach (or replace) the local media stream; renegotiates every peer. */
  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    for (const [, peer] of this.peers) this.addLocalTracks(peer);
  }

  private addLocalTracks(peer: Peer): void {
    if (!this.localStream) return;
    const existing = new Set(
      peer.pc
        .getSenders()
        .map((s) => s.track?.id)
        .filter(Boolean)
    );
    for (const track of this.localStream.getTracks()) {
      if (!existing.has(track.id)) peer.pc.addTrack(track, this.localStream);
    }
  }

  private ensurePeer(participantId: string): Peer {
    const found = this.peers.get(participantId);
    if (found) return found;

    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer: Peer = {
      pc,
      polite: this.selfId < participantId,
      makingOffer: false,
      ignoreOffer: false,
    };
    this.peers.set(participantId, peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) {
          this.socket.emit('webrtc:offer', participantId, pc.localDescription.toJSON());
        }
      } catch {
        // A failed negotiation attempt will be retried on the next state change.
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) this.socket.emit('webrtc:ice', participantId, event.candidate.toJSON());
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) this.callbacks.onStream(participantId, stream);
    };

    pc.ondatachannel = (event) => {
      this.callbacks.onDataChannel(participantId, event.channel);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
    };

    this.addLocalTracks(peer);
    return peer;
  }

  /** Called by the newest joiner for each peer already in the room. */
  initiateTo(participantId: string): void {
    if (this.destroyed || participantId === this.selfId) return;
    const peer = this.ensurePeer(participantId);
    // Guarantees onnegotiationneeded fires even with no media tracks yet.
    peer.pc.createDataChannel('ghostdesk:keepalive');
  }

  /** Opens a data channel to a peer (used for P2P file transfer). */
  openChannel(participantId: string, label: string): RTCDataChannel {
    const peer = this.ensurePeer(participantId);
    return peer.pc.createDataChannel(label);
  }

  async handleDescription(from: string, description: RtcSessionDescription): Promise<void> {
    if (this.destroyed) return;
    const peer = this.ensurePeer(from);
    const { pc } = peer;

    const collision =
      description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
    peer.ignoreOffer = !peer.polite && collision;
    if (peer.ignoreOffer) return;

    try {
      await pc.setRemoteDescription(description as RTCSessionDescriptionInit);
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        if (pc.localDescription) {
          this.socket.emit('webrtc:answer', from, pc.localDescription.toJSON());
        }
      }
    } catch {
      // Negotiation glitch — the perfect-negotiation cycle recovers on retry.
    }
  }

  async handleIce(from: string, candidate: RtcIceCandidate): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer) return;
    try {
      await peer.pc.addIceCandidate(candidate as RTCIceCandidateInit);
    } catch {
      if (!peer.ignoreOffer) {
        // Candidates for an ignored offer are expected to fail; others are
        // transient (e.g. arrived before the remote description) and harmless
        // to drop — ICE keeps generating candidates.
      }
    }
  }

  removePeer(participantId: string): void {
    const peer = this.peers.get(participantId);
    if (!peer) return;
    peer.pc.close();
    this.peers.delete(participantId);
    this.callbacks.onStreamGone(participantId);
  }

  destroy(): void {
    this.destroyed = true;
    for (const [id] of this.peers) this.removePeer(id);
  }
}
