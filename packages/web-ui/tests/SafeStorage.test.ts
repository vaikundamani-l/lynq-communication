import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SafeStorage } from '../src/services/SafeStorage.js';

describe('SafeStorage Resilient Storage Abstraction', () => {
  let storage: SafeStorage;

  beforeEach(() => {
    storage = new SafeStorage();
  });

  it('stores and retrieves string items correctly in memory or available storage', () => {
    storage.setItem('test_key', 'hello_world');
    expect(storage.getItem('test_key')).toBe('hello_world');

    storage.removeItem('test_key');
    expect(storage.getItem('test_key')).toBeNull();
  });

  it('handles corrupted JSON safely by falling back to default value without crashing', () => {
    storage.setItem('corrupted_key', '{ invalid json syntax');

    const defaultVal = [{ id: '1', name: 'default' }];
    const result = storage.getJSON('corrupted_key', defaultVal);

    expect(result).toEqual(defaultVal);
    // Verifies raw string is not wiped out
    expect(storage.getItem('corrupted_key')).toBe('{ invalid json syntax');
  });

  it('validates parsed JSON with schema validator and falls back on mismatch', () => {
    storage.setJSON('contacts', { notAnArray: true });

    // Expects an array
    const defaultContacts: any[] = [];
    const result = storage.getJSON('contacts', defaultContacts, (val) => Array.isArray(val));

    expect(result).toEqual([]);
  });

  it('handles unavailable localStorage gracefully (e.g. SecurityError in private mode)', () => {
    // Mock window without localStorage or throwing SecurityError
    const prevWindow = (globalThis as any).window;
    (globalThis as any).window = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError: Access is denied');
        },
        setItem: () => {
          throw new Error('SecurityError: Access is denied');
        },
        removeItem: () => {
          throw new Error('SecurityError: Access is denied');
        },
      },
    };

    try {
      const restrictedStorage = new SafeStorage();
      // Should not crash, and should use in-memory fallback
      expect(restrictedStorage.isAvailable()).toBe(false);

      restrictedStorage.setItem('fallback_key', 'saved_in_ram');
      expect(restrictedStorage.getItem('fallback_key')).toBe('saved_in_ram');
    } finally {
      (globalThis as any).window = prevWindow;
    }
  });

  it('handles QuotaExceededError without throwing uncaught exceptions', () => {
    const prevWindow = (globalThis as any).window;
    (globalThis as any).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        },
        removeItem: () => {},
      },
    };

    try {
      const quotaStorage = new SafeStorage();
      const success = quotaStorage.setItem('large_key', 'huge_data');
      expect(success).toBe(false);
      // Data is still safely held in memory
      expect(quotaStorage.getItem('large_key')).toBe('huge_data');
    } finally {
      (globalThis as any).window = prevWindow;
    }
  });
});
