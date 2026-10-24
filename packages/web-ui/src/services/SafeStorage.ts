/**
 * SafeStorage abstraction for resilient browser storage.
 * Gracefully handles:
 * - Unavailable localStorage (e.g. strict privacy mode, restricted iframes, Safari incognito)
 * - QuotaExceededError when disk is full or storage limit is hit
 * - Corrupted or malformed JSON data without crashing or overwriting recoverable data
 * - In-memory fallback ensuring application never crashes on load
 */

export class SafeStorage {
  private inMemoryFallback = new Map<string, string>();
  private storageAvailable: boolean;

  constructor() {
    this.storageAvailable = this.probeStorage();
  }

  /**
   * Probe whether localStorage is genuinely accessible and writable
   */
  private probeStorage(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const storage = window.localStorage;
      if (!storage) return false;
      const testKey = '__lynq_storage_probe__';
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  public isAvailable(): boolean {
    return this.storageAvailable;
  }

  public getItem(key: string): string | null {
    if (this.storageAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch (err) {
        console.warn(`[SafeStorage] Failed to read key "${key}" from localStorage:`, err);
      }
    }
    return this.inMemoryFallback.get(key) ?? null;
  }

  public setItem(key: string, value: string): boolean {
    // Always keep in-memory fallback updated
    this.inMemoryFallback.set(key, value);

    if (this.storageAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err?.code === 22) {
          console.warn(`[SafeStorage] QuotaExceededError while saving key "${key}". Preserved in memory.`);
        } else {
          console.warn(`[SafeStorage] Failed to write key "${key}":`, err);
        }
        return false;
      }
    }
    return false;
  }

  public removeItem(key: string): boolean {
    this.inMemoryFallback.delete(key);
    if (this.storageAvailable) {
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (err) {
        console.warn(`[SafeStorage] Failed to remove key "${key}":`, err);
        return false;
      }
    }
    return true;
  }

  /**
   * Parse stored JSON with schema validation and safe default fallback.
   * Never throws on corrupted data.
   */
  public getJSON<T>(
    key: string,
    defaultValue: T,
    validator?: (data: unknown) => boolean
  ): T {
    const raw = this.getItem(key);
    if (raw === null || raw === undefined) {
      return defaultValue;
    }

    try {
      const parsed = JSON.parse(raw);
      if (validator) {
        if (validator(parsed)) {
          return parsed as T;
        } else {
          console.warn(`[SafeStorage] Schema validation failed for stored key "${key}". Using default.`);
          return defaultValue;
        }
      }
      return parsed as T;
    } catch (err) {
      console.warn(`[SafeStorage] Corrupted JSON found for key "${key}". Preserving raw and using default.`, err);
      return defaultValue;
    }
  }

  /**
   * Safely stringifies and saves JSON.
   */
  public setJSON<T>(key: string, value: T): boolean {
    try {
      const serialized = JSON.stringify(value);
      return this.setItem(key, serialized);
    } catch (err) {
      console.warn(`[SafeStorage] Failed to serialize JSON for key "${key}":`, err);
      return false;
    }
  }
}

export const safeStorage = new SafeStorage();
