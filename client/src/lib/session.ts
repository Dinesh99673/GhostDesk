import type { ParticipantToken } from '@ghostdesk/shared';

/** Reconnect tokens live in sessionStorage: survive a refresh, die with the tab. */
const keyFor = (roomId: string) => `ghostdesk:token:${roomId}`;

export function loadToken(roomId: string): ParticipantToken | null {
  try {
    const raw = sessionStorage.getItem(keyFor(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ParticipantToken;
    if (typeof parsed.participantId === 'string' && typeof parsed.secret === 'string') return parsed;
  } catch {
    // Corrupt or inaccessible storage — treat as no token.
  }
  return null;
}

export function saveToken(roomId: string, token: ParticipantToken): void {
  try {
    sessionStorage.setItem(keyFor(roomId), JSON.stringify(token));
  } catch {
    // Storage full/blocked: reconnection just won't restore identity.
  }
}

export function clearToken(roomId: string): void {
  try {
    sessionStorage.removeItem(keyFor(roomId));
  } catch {
    // Nothing to do.
  }
}
