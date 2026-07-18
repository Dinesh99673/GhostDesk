import { GRACE_PERIOD_MS, RoomState } from '@ghostdesk/shared';

/**
 * Owns the room's state machine: ACTIVE → DESTROYING (grace period, empty room)
 * → DESTROYED. The explicit enum prevents races — a join arriving mid-teardown
 * is either allowed (DESTROYING, timer cancelled) or cleanly rejected (DESTROYED).
 */
export class LifecycleManager {
  state: RoomState = RoomState.ACTIVE;
  private graceTimer: NodeJS.Timeout | null = null;
  private destroyingSince: number | null = null;

  constructor(private readonly onGraceExpired: () => void) {}

  /** Last participant left — start the 30 s grace countdown. */
  scheduleDestroy(): void {
    if (this.state !== RoomState.ACTIVE) return;
    this.state = RoomState.DESTROYING;
    this.destroyingSince = Date.now();
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      this.onGraceExpired();
    }, GRACE_PERIOD_MS);
  }

  /** Someone came back within grace — the room lives on. */
  cancelDestroy(): void {
    if (this.state !== RoomState.DESTROYING) return;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.destroyingSince = null;
    this.state = RoomState.ACTIVE;
  }

  markDestroyed(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.state = RoomState.DESTROYED;
  }

  get joinable(): boolean {
    return this.state === RoomState.ACTIVE || this.state === RoomState.DESTROYING;
  }

  /** Safety net for the cleanup sweep: DESTROYING with a lost/overdue timer. */
  isStuckDestroying(now: number): boolean {
    return (
      this.state === RoomState.DESTROYING &&
      this.destroyingSince !== null &&
      now - this.destroyingSince > GRACE_PERIOD_MS * 2
    );
  }

  destroy(): void {
    this.markDestroyed();
  }
}
