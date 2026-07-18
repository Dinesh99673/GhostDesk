import type { FileOffer } from '@ghostdesk/shared';

const MAX_OFFERS_PER_ROOM = 50;

/**
 * Tracks *offers* only — file bytes never touch the server; they move directly
 * between peers over WebRTC data channels.
 */
export class FileTransferManager {
  private offers = new Map<string, FileOffer>();

  addOffer(offer: FileOffer): boolean {
    if (this.offers.size >= MAX_OFFERS_PER_ROOM || this.offers.has(offer.fileId)) return false;
    this.offers.set(offer.fileId, offer);
    return true;
  }

  getOffer(fileId: string): FileOffer | undefined {
    return this.offers.get(fileId);
  }

  removeOffer(fileId: string): boolean {
    return this.offers.delete(fileId);
  }

  /** Withdraws every offer from a departing sender; returns the withdrawn ids. */
  removeOffersFrom(senderId: string): string[] {
    const removed: string[] = [];
    for (const [fileId, offer] of this.offers) {
      if (offer.senderId === senderId) {
        this.offers.delete(fileId);
        removed.push(fileId);
      }
    }
    return removed;
  }

  snapshot(): FileOffer[] {
    return [...this.offers.values()];
  }

  destroy(): void {
    this.offers.clear();
  }
}
