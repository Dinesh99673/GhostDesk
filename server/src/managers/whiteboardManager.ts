import {
  MAX_WHITEBOARD_BYTES,
  MAX_WHITEBOARD_ELEMENTS,
  type WhiteboardElement,
} from '@ghostdesk/shared';

/**
 * Holds the authoritative scene as a map of elements. Clients send incremental
 * diffs (only changed elements); the winner per element is the higher version,
 * with versionNonce as a deterministic tie-breaker — mirroring Excalidraw's own
 * reconciliation, so every peer and the server converge on the same scene.
 */
export class WhiteboardManager {
  private elements = new Map<string, WhiteboardElement>();
  private byteSizes = new Map<string, number>();
  private totalBytes = 0;

  /** Applies a diff; returns the elements that actually won (for rebroadcast). */
  applyDiff(incoming: WhiteboardElement[]): WhiteboardElement[] {
    const accepted: WhiteboardElement[] = [];
    for (const element of incoming) {
      if (typeof element?.id !== 'string' || typeof element?.version !== 'number') continue;

      const existing = this.elements.get(element.id);
      if (existing && !this.wins(element, existing)) continue;

      const size = JSON.stringify(element).length;
      const previousSize = this.byteSizes.get(element.id) ?? 0;

      if (!existing && this.elements.size >= MAX_WHITEBOARD_ELEMENTS) continue;
      if (this.totalBytes - previousSize + size > MAX_WHITEBOARD_BYTES) continue;

      this.elements.set(element.id, element);
      this.byteSizes.set(element.id, size);
      this.totalBytes += size - previousSize;
      accepted.push(element);
    }
    return accepted;
  }

  private wins(incoming: WhiteboardElement, existing: WhiteboardElement): boolean {
    if (incoming.version !== existing.version) return incoming.version > existing.version;
    return (incoming.versionNonce ?? 0) < (existing.versionNonce ?? 0);
  }

  snapshot(): WhiteboardElement[] {
    return [...this.elements.values()];
  }

  destroy(): void {
    this.elements.clear();
    this.byteSizes.clear();
    this.totalBytes = 0;
  }
}
