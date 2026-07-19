export const ROOM_ID_LENGTH = 14;

export const MAX_ROOMS = 50;
export const MAX_PARTICIPANTS = 10;
export const RECOMMENDED_PARTICIPANTS = 6;

export const MAX_CHAT_MESSAGES = 500;
export const MAX_CHAT_TOTAL_BYTES = 1024 * 1024; // 1 MB per room, whichever cap hits first
export const MAX_CHAT_MESSAGE_CHARS = 2000;

export const MAX_NOTES_BYTES = 1024 * 1024;
export const MAX_WHITEBOARD_BYTES = 5 * 1024 * 1024;
export const MAX_WHITEBOARD_ELEMENTS = 5000;
export const WHITEBOARD_THROTTLE_MS = 100;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// 64 KB is the safe cross-browser ceiling for data-channel messages; larger
// chunks mean far fewer per-chunk round trips than the old 16 KB.
export const FILE_CHUNK_BYTES = 64 * 1024;
// Pause sending when the data channel buffer exceeds this; resume at bufferedAmountLow.
export const FILE_BUFFER_HIGH_WATER = 1024 * 1024;
export const FILE_BUFFER_LOW_WATER = 256 * 1024;

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const HEARTBEAT_TIMEOUT_MS = 25_000;
export const GRACE_PERIOD_MS = 30_000;
export const CLEANUP_INTERVAL_MS = 60_000;

export const MAX_NAME_CHARS = 24;

/** Allowed call reactions; anything else is rejected server-side. */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '👏', '😢', '🔥'] as const;
export const REACTION_DISPLAY_MS = 3000;
