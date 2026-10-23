export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  remaining: number;
  resetMs: number;
}

export interface LockoutStatus {
  isLocked: boolean;
  remainingLockoutMs: number;
  failures: number;
}

/**
 * Sliding-window rate limiter with brute-force lockout protection.
 * Platform-independent, bounded memory, suitable for Node.js, Tauri, and browser runtimes.
 */
export class RateLimiter {
  private requests = new Map<string, number[]>(); // key -> array of timestamps
  private lockouts = new Map<string, { lockedUntil: number; failures: number }>();

  /**
   * Checks whether an action for the given key is allowed within the rate window.
   * @param key Identifier (e.g. IP address, peer UID, or action token)
   * @param limit Max permitted actions within windowMs
   * @param windowMs Time window in milliseconds
   */
  public checkLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const lockout = this.getLockoutStatus(key);
    if (lockout.isLocked) {
      return {
        allowed: false,
        currentCount: limit,
        remaining: 0,
        resetMs: lockout.remainingLockoutMs,
      };
    }

    const timestamps = (this.requests.get(key) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      const resetMs = Math.max(0, windowMs - (now - oldest));
      this.requests.set(key, timestamps);
      return {
        allowed: false,
        currentCount: timestamps.length,
        remaining: 0,
        resetMs,
      };
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);

    return {
      allowed: true,
      currentCount: timestamps.length,
      remaining: limit - timestamps.length,
      resetMs: windowMs,
    };
  }

  /**
   * Records a security failure (e.g. invalid pairing token or signature mismatch).
   * Enforces temporary lockout when consecutive failures exceed maxFailures.
   */
  public recordFailure(key: string, maxFailures: number, lockoutDurationMs: number): boolean {
    const now = Date.now();
    const entry = this.lockouts.get(key) || { lockedUntil: 0, failures: 0 };
    entry.failures += 1;

    if (entry.failures >= maxFailures) {
      entry.lockedUntil = now + lockoutDurationMs;
      this.lockouts.set(key, entry);
      return true; // Now locked out
    }

    this.lockouts.set(key, entry);
    return false;
  }

  /**
   * Resets failures and unlocks the key after successful authentication.
   */
  public reset(key: string): void {
    this.requests.delete(key);
    this.lockouts.delete(key);
  }

  /**
   * Returns current lockout status for the given key.
   */
  public getLockoutStatus(key: string): LockoutStatus {
    const entry = this.lockouts.get(key);
    if (!entry) {
      return { isLocked: false, remainingLockoutMs: 0, failures: 0 };
    }

    const now = Date.now();
    if (now < entry.lockedUntil) {
      return {
        isLocked: true,
        remainingLockoutMs: entry.lockedUntil - now,
        failures: entry.failures,
      };
    }

    // Lockout expired
    if (entry.lockedUntil > 0) {
      this.lockouts.delete(key);
      return { isLocked: false, remainingLockoutMs: 0, failures: 0 };
    }

    return {
      isLocked: false,
      remainingLockoutMs: 0,
      failures: entry.failures,
    };
  }

  /**
   * Cleans up expired entries to maintain bounded memory footprint.
   */
  public prune(maxAgeMs = 3600000): void {
    const now = Date.now();
    for (const [key, timestamps] of this.requests.entries()) {
      const active = timestamps.filter((t) => now - t < maxAgeMs);
      if (active.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, active);
      }
    }

    for (const [key, entry] of this.lockouts.entries()) {
      if (now > entry.lockedUntil && entry.failures === 0) {
        this.lockouts.delete(key);
      }
    }
  }
}
