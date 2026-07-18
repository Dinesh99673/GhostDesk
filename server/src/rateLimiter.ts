interface Bucket {
  count: number;
  windowStart: number;
}

/** Fixed-window per-key limiter; in-memory, wiped with the process like everything else. */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    bucket.count++;
    return bucket.count <= this.maxPerWindow;
  }

  /** Drop expired buckets; called from the periodic cleanup sweep. */
  prune(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.windowMs) this.buckets.delete(key);
    }
  }
}
