import {
  MAX_CHAT_MESSAGE_CHARS,
  MAX_FILE_BYTES,
  MAX_NAME_CHARS,
  ROOM_ID_LENGTH,
} from '../constants/index.js';

const ROOM_ID_RE = new RegExp(`^[A-Za-z0-9_-]{${ROOM_ID_LENGTH}}$`);

export function isValidRoomId(value: unknown): value is string {
  return typeof value === 'string' && ROOM_ID_RE.test(value);
}

export function isValidToken(value: unknown): value is { participantId: string; secret: string } {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.participantId === 'string' &&
    t.participantId.length > 0 &&
    t.participantId.length <= 32 &&
    typeof t.secret === 'string' &&
    t.secret.length > 0 &&
    t.secret.length <= 64
  );
}

/** Trims, collapses inner whitespace, caps length. Returns null if nothing usable remains. */
export function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_CHARS);
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeChatText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, MAX_CHAT_MESSAGE_CHARS);
  return cleaned.length > 0 ? cleaned : null;
}

export function isValidFileOffer(
  value: unknown
): value is { fileId: string; name: string; size: number; mimeType: string } {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.fileId === 'string' &&
    o.fileId.length > 0 &&
    o.fileId.length <= 32 &&
    typeof o.name === 'string' &&
    o.name.length > 0 &&
    o.name.length <= 255 &&
    typeof o.size === 'number' &&
    Number.isFinite(o.size) &&
    o.size > 0 &&
    o.size <= MAX_FILE_BYTES &&
    typeof o.mimeType === 'string' &&
    o.mimeType.length <= 128
  );
}
