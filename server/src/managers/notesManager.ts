import * as Y from 'yjs';
import { MAX_NOTES_BYTES } from '@ghostdesk/shared';

export class NotesManager {
  private doc = new Y.Doc();
  /** Running total of applied update bytes; used as a cheap size guard. */
  private appliedBytes = 0;

  /** Applies a client update; returns false when rejected by the size cap. */
  applyUpdate(update: Uint8Array): boolean {
    if (update.byteLength > MAX_NOTES_BYTES) return false;

    // Re-encoding on every keystroke would be wasteful; only re-measure once the
    // running total of raw updates crosses the cap (compaction usually shrinks it).
    if (this.appliedBytes + update.byteLength > MAX_NOTES_BYTES) {
      this.appliedBytes = Y.encodeStateAsUpdate(this.doc).byteLength;
      if (this.appliedBytes + update.byteLength > MAX_NOTES_BYTES) return false;
    }

    try {
      Y.applyUpdate(this.doc, update);
    } catch {
      return false;
    }
    this.appliedBytes += update.byteLength;
    return true;
  }

  snapshot(): Uint8Array | null {
    const state = Y.encodeStateAsUpdate(this.doc);
    // A fresh empty doc encodes to a couple of bytes — treat that as "no notes yet".
    return state.byteLength > 2 ? state : null;
  }

  destroy(): void {
    this.doc.destroy();
    this.doc = new Y.Doc();
    this.appliedBytes = 0;
  }
}
