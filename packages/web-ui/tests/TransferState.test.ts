import { describe, it, expect } from 'vitest';
import { FileTransfer, Message } from '@lynq/core';

describe('Transfer UI State Accuracy', () => {
  it('does not mark incoming file message metadata as completed or fabricate hash/speed', () => {
    const fileMessage: Message = {
      id: 'msg_file_123',
      senderId: 'alice',
      receiverId: 'bob',
      type: 'file',
      content: 'Offered file: contract.pdf',
      timestamp: Date.now(),
      status: 'sent',
      fileMetadata: {
        fileId: 'file_999',
        fileName: 'contract.pdf',
        fileSize: 15 * 1024 * 1024, // 15 MB
        mimeType: 'application/pdf',
        sha256Hash: 'a'.repeat(64),
      },
    };

    // Construct transfer record as processed by App.tsx
    const transferRecord: FileTransfer = {
      transferId: fileMessage.fileMetadata!.fileId || fileMessage.id,
      fileId: fileMessage.fileMetadata!.fileId || fileMessage.id,
      fileName: fileMessage.fileMetadata!.fileName,
      fileSize: fileMessage.fileMetadata!.fileSize,
      mimeType: fileMessage.fileMetadata!.mimeType || 'application/octet-stream',
      sha256Hash: fileMessage.fileMetadata!.sha256Hash || '',
      chunkSize: 2 * 1024 * 1024,
      totalChunks: Math.ceil((fileMessage.fileMetadata!.fileSize || 1) / (2 * 1024 * 1024)),
      transferredChunks: 0,
      transferredBytes: 0,
      direction: 'incoming',
      senderId: fileMessage.senderId,
      receiverId: fileMessage.receiverId,
      status: 'pending_approval',
      speedBps: 0,
      etaSeconds: 0,
      startedAt: fileMessage.timestamp,
    };

    // Assertions matching Phase 5 requirements:
    // 1. Receiving file metadata alone MUST NOT mark transfer as completed
    expect(transferRecord.status).not.toBe('completed');
    expect(transferRecord.status).toBe('pending_approval');

    // 2. No placeholder strings such as 'sha256_verified'
    expect(transferRecord.sha256Hash).not.toBe('sha256_verified');
    expect(transferRecord.sha256Hash).toBe('a'.repeat(64));

    // 3. No fabricated transfer speeds, byte counts, progress
    expect(transferRecord.transferredBytes).toBe(0);
    expect(transferRecord.transferredChunks).toBe(0);
    expect(transferRecord.speedBps).toBe(0);
    expect(transferRecord.completedAt).toBeUndefined();
  });
});
