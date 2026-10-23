import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../src/index.js';

describe('RateLimiter Security & Protection', () => {
  it('enforces sliding window request limits', () => {
    const limiter = new RateLimiter();
    const key = '192.168.1.50';

    // Limit: 5 requests per 1000ms
    for (let i = 0; i < 5; i++) {
      const res = limiter.checkLimit(key, 5, 1000);
      expect(res.allowed).toBe(true);
      expect(res.currentCount).toBe(i + 1);
    }

    // 6th request within window must be rejected
    const blocked = limiter.checkLimit(key, 5, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it('enforces brute force lockout on repeated failed attempts', () => {
    const limiter = new RateLimiter();
    const key = 'peer_malicious_node';

    // 4 failed attempts should not lock out yet (threshold is 5)
    for (let i = 0; i < 4; i++) {
      const locked = limiter.recordFailure(key, 5, 60000);
      expect(locked).toBe(false);
    }

    expect(limiter.getLockoutStatus(key).isLocked).toBe(false);

    // 5th failure must trigger lockout
    const lockedNow = limiter.recordFailure(key, 5, 60000);
    expect(lockedNow).toBe(true);

    const status = limiter.getLockoutStatus(key);
    expect(status.isLocked).toBe(true);
    expect(status.failures).toBe(5);
    expect(status.remainingLockoutMs).toBeGreaterThan(0);

    // Any rate check while locked must be denied
    const check = limiter.checkLimit(key, 100, 1000);
    expect(check.allowed).toBe(false);

    // Reset clears lockout
    limiter.reset(key);
    expect(limiter.getLockoutStatus(key).isLocked).toBe(false);
  });

  it('prunes expired rate limit records to conserve memory', () => {
    const limiter = new RateLimiter();
    limiter.checkLimit('old_key', 10, 50);

    // Wait 60ms and prune
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        limiter.prune(50);
        const res = limiter.checkLimit('old_key', 10, 50);
        expect(res.currentCount).toBe(1);
        resolve();
      }, 60);
    });
  });
});
