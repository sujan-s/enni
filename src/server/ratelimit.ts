export interface RateLimiterOptions {
  /** Burst size per key. Default 10. */
  capacity?: number
  /** Tokens refilled per second per key. Default 1. */
  refillPerSec?: number
  /** Bound on tracked keys (memory safety). Default 10 000. */
  maxKeys?: number
}

/**
 * In-memory token bucket, keyed by caller IP held only for the lifetime
 * of the bucket — nothing is persisted. Per-instance on serverless,
 * which is fine: abuse here is noise in counters, not a breach.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>()
  private capacity: number
  private refillPerSec: number
  private maxKeys: number

  constructor(opts: RateLimiterOptions = {}) {
    this.capacity = opts.capacity ?? 10
    this.refillPerSec = opts.refillPerSec ?? 1
    this.maxKeys = opts.maxKeys ?? 10_000
  }

  allow(key: string, now = Date.now()): boolean {
    let b = this.buckets.get(key)
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now)
      if (this.buckets.size >= this.maxKeys) this.buckets.clear()
      b = { tokens: this.capacity, last: now }
      this.buckets.set(key, b)
    }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.last) / 1000) * this.refillPerSec)
    b.last = now
    if (b.tokens < 1) return false
    b.tokens -= 1
    return true
  }

  private sweep(now: number): void {
    for (const [k, b] of this.buckets) if (now - b.last > 60_000) this.buckets.delete(k)
  }
}
