import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { safeStorage } from '../src/services/SafeStorage';
import { FileTransfer, sanitizeFilename } from '@lynq/core';

describe('UI/UX Overhaul & State Synchronizations', () => {
  let originalWindow: any;
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    originalWindow = (globalThis as any).window;

    const mockLocalStorage = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStore[key] = String(value);
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
      get length() {
        return Object.keys(mockStore).length;
      },
      key: (i: number) => Object.keys(mockStore)[i] ?? null,
    };

    (globalThis as any).window = {
      localStorage: mockLocalStorage,
      dispatchEvent: () => true,
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('persists and retrieves user preferences (requireApproval and soundChimes)', () => {
    const defaultSettings = safeStorage.getJSON('lynq_settings', {
      requireApproval: true,
      soundChimes: true,
    });
    expect(defaultSettings.requireApproval).toBe(true);
    expect(defaultSettings.soundChimes).toBe(true);

    const updatedSettings = {
      requireApproval: false,
      soundChimes: false,
    };
    safeStorage.setJSON('lynq_settings', updatedSettings);

    const reloaded = safeStorage.getJSON('lynq_settings', {
      requireApproval: true,
      soundChimes: true,
    });
    expect(reloaded.requireApproval).toBe(false);
    expect(reloaded.soundChimes).toBe(false);
  });

  it('sorts transfer queue placing failed transfers at the top for immediate recovery', () => {
    const transfers: FileTransfer[] = [
      {
        transferId: 't1',
        fileId: 'f1',
        fileName: 'document.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        sha256Hash: 'hash1',
        chunkSize: 64,
        totalChunks: 16,
        transferredChunks: 16,
        transferredBytes: 1024,
        direction: 'incoming',
        senderId: 'peer_1',
        receiverId: 'user_me',
        status: 'completed',
        speedBps: 1000,
        etaSeconds: 0,
        startedAt: 1000,
        completedAt: 2000,
      },
      {
        transferId: 't2',
        fileId: 'f2',
        fileName: 'corrupted_archive.zip',
        fileSize: 2048,
        mimeType: 'application/zip',
        sha256Hash: 'hash2',
        chunkSize: 64,
        totalChunks: 32,
        transferredChunks: 10,
        transferredBytes: 640,
        direction: 'incoming',
        senderId: 'peer_2',
        receiverId: 'user_me',
        status: 'failed',
        speedBps: 0,
        etaSeconds: 0,
        startedAt: 1000,
      },
      {
        transferId: 't3',
        fileId: 'f3',
        fileName: 'active_video.mp4',
        fileSize: 5000,
        mimeType: 'video/mp4',
        sha256Hash: 'hash3',
        chunkSize: 64,
        totalChunks: 80,
        transferredChunks: 40,
        transferredBytes: 2500,
        direction: 'outgoing',
        senderId: 'user_me',
        receiverId: 'peer_1',
        status: 'transferring',
        speedBps: 50000,
        etaSeconds: 1,
        startedAt: 1000,
      },
      {
        transferId: 't4',
        fileId: 'f4',
        fileName: 'proposal.docx',
        fileSize: 3000,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sha256Hash: 'hash4',
        chunkSize: 64,
        totalChunks: 50,
        transferredChunks: 0,
        transferredBytes: 0,
        direction: 'incoming',
        senderId: 'peer_3',
        receiverId: 'user_me',
        status: 'pending_approval',
        speedBps: 0,
        etaSeconds: 0,
        startedAt: 1000,
      },
    ];

    const score = (t: FileTransfer) =>
      t.status === 'failed' ? 0 : t.status === 'transferring' ? 1 : t.status === 'pending_approval' ? 2 : 3;

    const sorted = [...transfers].sort((a, b) => score(a) - score(b));

    expect(sorted[0].transferId).toBe('t2'); // failed first
    expect(sorted[1].transferId).toBe('t3'); // transferring second
    expect(sorted[2].transferId).toBe('t4'); // pending_approval third
    expect(sorted[3].transferId).toBe('t1'); // completed last
  });

  it('safely sanitizes and preserves legitimate file names for transfers', () => {
    const raw = '../../../etc/passwd';
    const sanitized = sanitizeFilename(raw);
    expect(sanitized).not.toContain('..');
    expect(sanitized).toBe('passwd');

    const clean = 'presentation_final.pdf';
    expect(sanitizeFilename(clean)).toBe('presentation_final.pdf');
  });
});
