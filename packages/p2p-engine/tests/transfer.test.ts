import { describe, it, expect } from 'vitest';
import { FileTransferEngine, FileDataInput, TransferTransport } from '../src/index.js';
import { FileChunk } from '@lynq/core';

describe('FileTransferEngine (P2P Streaming, Chunking & Verification)', () => {
  it('creates transfer offer with sanitized filename and valid SHA-256', async () => {
    const engine = new FileTransferEngine('alice');
    const testData = new TextEncoder().encode('Hello LYNQ P2P streaming file transfer!');

    const input: FileDataInput = {
      name: '../../secret_notes.txt',
      size: testData.length,
      type: 'text/plain',
      data: testData,
    };

    const { transfer, offerPayload } = await engine.createTransferOffer(input, 'bob');

    expect(transfer.fileName).toBe('secret_notes.txt'); // sanitized!
    expect(transfer.sha256Hash).toHaveLength(64);
    expect(transfer.totalChunks).toBe(1);
    expect(transfer.status).toBe('pending_approval');
    expect(offerPayload).toBeDefined();
  });

  it('completes end-to-end chunked transfer with SHA-256 integrity verification', async () => {
    const senderEngine = new FileTransferEngine('alice');
    const receiverEngine = new FileTransferEngine('bob');

    // Create a 150KB test file (spans 3 chunks of 64KB)
    const fileBytes = new Uint8Array(150 * 1024);
    for (let i = 0; i < fileBytes.length; i++) {
      fileBytes[i] = (i % 256);
    }

    const { transfer: sendTransfer } = await senderEngine.createTransferOffer(
      {
        name: 'sample_presentation.pdf',
        size: fileBytes.length,
        type: 'application/pdf',
        data: fileBytes,
      },
      'bob'
    );

    expect(sendTransfer.totalChunks).toBe(3);

    // Receiver handles offer
    const recvTransfer = receiverEngine.handleIncomingOffer(sendTransfer);
    expect(recvTransfer.status).toBe('pending_approval');

    // Transport channel wire
    const transmittedChunks: FileChunk[] = [];
    const mockTransport: TransferTransport = {
      sendData: (type: string, payload: unknown) => {
        if (type === 'transfer:chunk') {
          transmittedChunks.push(payload as FileChunk);
        }
        return true;
      },
    };

    // Receiver accepts
    receiverEngine.acceptTransfer(recvTransfer.transferId, mockTransport);

    // Sender streams outgoing chunks
    await senderEngine.startStreamingOutgoing(sendTransfer.transferId, mockTransport);
    expect(transmittedChunks).toHaveLength(3);
    expect(sendTransfer.status).toBe('completed');

    // Receiver processes incoming chunks
    let completedEventFired = false;
    let verifiedFileData: Uint8Array | null = null;

    receiverEngine.on('transferCompleted', ({ fileData }) => {
      completedEventFired = true;
      verifiedFileData = fileData;
    });

    for (const chunk of transmittedChunks) {
      await receiverEngine.handleIncomingChunk(chunk);
    }

    expect(completedEventFired).toBe(true);
    expect(recvTransfer.status).toBe('completed');
    expect(verifiedFileData).not.toBeNull();
    expect(verifiedFileData?.length).toBe(fileBytes.length);
  });

  it('detects tampering and rejects corrupted file transfers', async () => {
    const senderEngine = new FileTransferEngine('alice');
    const receiverEngine = new FileTransferEngine('bob');

    const testData = new TextEncoder().encode('Original authentic payload');

    const { transfer: sendTransfer } = await senderEngine.createTransferOffer(
      {
        name: 'contract.pdf',
        size: testData.length,
        type: 'application/pdf',
        data: testData,
      },
      'bob'
    );

    const recvTransfer = receiverEngine.handleIncomingOffer(sendTransfer);

    const transmittedChunks: FileChunk[] = [];
    const mockTransport: TransferTransport = {
      sendData: (type: string, payload: unknown) => {
        if (type === 'transfer:chunk') transmittedChunks.push(payload as FileChunk);
        return true;
      },
    };

    receiverEngine.acceptTransfer(recvTransfer.transferId, mockTransport);
    await senderEngine.startStreamingOutgoing(sendTransfer.transferId, mockTransport);

    // Tamper with the chunk payload in transit!
    transmittedChunks[0].data = Buffer.from('TAMPERED corrupted payload').toString('base64');

    let failedEventFired = false;
    receiverEngine.on('transferFailed', () => {
      failedEventFired = true;
    });

    for (const chunk of transmittedChunks) {
      await receiverEngine.handleIncomingChunk(chunk);
    }

    expect(failedEventFired).toBe(true);
    expect(recvTransfer.status).toBe('failed');
    expect(recvTransfer.error).toContain('checksum verification failed');
  });

  it('handles transfer cancellation correctly', () => {
    const engine = new FileTransferEngine('alice');
    const transferId = 'dummy-transfer-123';

    engine.handleIncomingOffer({
      transferId,
      fileName: 'cancel_me.zip',
      fileSize: 1000,
      totalChunks: 1,
      senderId: 'bob',
    });

    engine.cancelTransfer(transferId);
    expect(engine.getTransfer(transferId)?.status).toBe('canceled');
  });

  it('supports streaming up to 20 GB files with adaptive chunking and zero RAM retention', async () => {
    const senderEngine = new FileTransferEngine('alice');
    const receiverEngine = new FileTransferEngine('bob');

    const TWENTY_GB = 20 * 1024 * 1024 * 1024; // 21,474,836,480 bytes

    // Zero-RAM on-demand slice provider
    const sampleChunk = new Uint8Array(2 * 1024 * 1024); // 2 MB reusable buffer
    sampleChunk.fill(42);

    const { transfer: sendTransfer } = await senderEngine.createTransferOffer(
      {
        name: 'ubuntu-server-24.04-live-server-amd64.iso',
        size: TWENTY_GB,
        type: 'application/x-iso9660-image',
        getChunk: async (_idx, _start, _end) => sampleChunk,
      },
      'bob'
    );

    // Adaptive chunk size should be 2 MB for multi-GB files
    expect(sendTransfer.chunkSize).toBe(2 * 1024 * 1024);
    expect(sendTransfer.totalChunks).toBe(10240); // 20GB / 2MB

    // Receiver handles offer
    const recvTransfer = receiverEngine.handleIncomingOffer(sendTransfer);
    expect(recvTransfer.chunkSize).toBe(2 * 1024 * 1024);
    expect(recvTransfer.totalChunks).toBe(10240);

    // Register a mock disk stream sink on receiver
    let writtenChunks = 0;
    let writtenBytes = 0;
    let finalized = false;

    receiverEngine.registerChunkSink(recvTransfer.transferId, {
      writeChunk: (_index, chunkBytes, _offset) => {
        writtenChunks++;
        writtenBytes += chunkBytes.length;
      },
      finalize: async () => {
        finalized = true;
        return { savedTo: '/tmp/ubuntu.iso', totalBytes: writtenBytes };
      },
    });

    // Simulate wire transmission of first 5 chunks
    const transmittedChunks: FileChunk[] = [];
    const mockTransport: TransferTransport = {
      sendData: (_type: string, payload: unknown) => {
        transmittedChunks.push(payload as FileChunk);
        return true;
      },
    };

    receiverEngine.acceptTransfer(recvTransfer.transferId, mockTransport);

    // Simulate completion after 3 chunks for testing
    recvTransfer.totalChunks = 3;

    // Stream 3 chunks to verify
    for (let i = 0; i < 3; i++) {
      const chunk: FileChunk = {
        transferId: recvTransfer.transferId,
        chunkIndex: i,
        totalChunks: 3,
        data: Buffer.from(sampleChunk).toString('base64'),
      };
      await receiverEngine.handleIncomingChunk(chunk);
    }

    expect(writtenChunks).toBe(3);
    expect(writtenBytes).toBe(3 * sampleChunk.length);
    expect(finalized).toBe(true);
    expect(recvTransfer.status).toBe('completed');
  });

  it('rejects files exceeding 20 GB ceiling', async () => {
    const engine = new FileTransferEngine('alice');
    const TWENTY_ONE_GB = 21 * 1024 * 1024 * 1024;

    await expect(
      engine.createTransferOffer(
        {
          name: 'too_large.raw',
          size: TWENTY_ONE_GB,
          type: 'application/octet-stream',
          getChunk: async () => new Uint8Array(10),
        },
        'bob'
      )
    ).rejects.toThrow('exceeds the maximum supported ceiling of 20 GB');
  });

  it('handles transport send failures by aborting transfer and emitting failure', async () => {
    const senderEngine = new FileTransferEngine('alice');
    const { transfer } = await senderEngine.createTransferOffer(
      {
        name: 'test.dat',
        size: 1000,
        type: 'application/octet-stream',
        data: new Uint8Array(1000),
      },
      'bob'
    );

    let failedEvent = false;
    senderEngine.on('transferFailed', () => {
      failedEvent = true;
    });

    const failingTransport: TransferTransport = {
      sendData: () => false, // simulates transport failure (e.g. disconnected socket)
    };

    await senderEngine.startStreamingOutgoing(transfer.transferId, failingTransport);

    expect(failedEvent).toBe(true);
    expect(transfer.status).toBe('failed');
    expect(transfer.error).toContain('Transport send failed');
  });

  it('prevents duplicate chunks from corrupting transfer progress and byte count', async () => {
    const receiverEngine = new FileTransferEngine('bob');
    const transferId = 'dup-test-id';
    const recvTransfer = receiverEngine.handleIncomingOffer({
      transferId,
      fileName: 'dup_test.bin',
      fileSize: 200,
      chunkSize: 100,
      totalChunks: 2,
      senderId: 'alice',
      sha256Hash: 'dummy',
    });

    const chunk0: FileChunk = {
      transferId,
      chunkIndex: 0,
      totalChunks: 2,
      data: Buffer.from(new Uint8Array(100)).toString('base64'),
    };

    // First time receiving chunk 0
    await receiverEngine.handleIncomingChunk(chunk0);
    expect(recvTransfer.transferredChunks).toBe(1);
    expect(recvTransfer.transferredBytes).toBe(100);

    // Duplicate arrival of chunk 0
    await receiverEngine.handleIncomingChunk(chunk0);
    expect(recvTransfer.transferredChunks).toBe(1); // Must remain 1, not incremented to 2!
    expect(recvTransfer.transferredBytes).toBe(100); // Must remain 100, not double-counted!
  });

  it('validates chunk indexes and boundary limits', async () => {
    const receiverEngine = new FileTransferEngine('bob');
    const transferId = 'bounds-test-id';
    const recvTransfer = receiverEngine.handleIncomingOffer({
      transferId,
      fileName: 'bounds_test.bin',
      fileSize: 100,
      chunkSize: 100,
      totalChunks: 1,
      senderId: 'alice',
      sha256Hash: 'dummy',
    });

    let failedEvent = false;
    receiverEngine.on('transferFailed', () => {
      failedEvent = true;
    });

    // Send chunk with invalid index (99 for totalChunks = 1)
    await receiverEngine.handleIncomingChunk({
      transferId,
      chunkIndex: 99,
      totalChunks: 1,
      data: Buffer.from(new Uint8Array(50)).toString('base64'),
    });

    expect(failedEvent).toBe(true);
    expect(recvTransfer.status).toBe('failed');
    expect(recvTransfer.error).toContain('Invalid chunkIndex');
  });

  it('handles disk-write failures gracefully in streaming chunk sinks', async () => {
    const receiverEngine = new FileTransferEngine('bob');
    const transferId = 'disk-fail-id';
    const recvTransfer = receiverEngine.handleIncomingOffer({
      transferId,
      fileName: 'disk_fail.bin',
      fileSize: 100,
      chunkSize: 100,
      totalChunks: 1,
      senderId: 'alice',
      sha256Hash: 'dummy',
    });

    let abortCalled = false;
    receiverEngine.registerChunkSink(transferId, {
      writeChunk: () => {
        throw new Error('ENOSPC: no space left on device');
      },
      finalize: async () => {},
      abort: () => {
        abortCalled = true;
      },
    });

    let failedEvent = false;
    receiverEngine.on('transferFailed', () => {
      failedEvent = true;
    });

    await receiverEngine.handleIncomingChunk({
      transferId,
      chunkIndex: 0,
      totalChunks: 1,
      data: Buffer.from(new Uint8Array(100)).toString('base64'),
    });

    expect(failedEvent).toBe(true);
    expect(abortCalled).toBe(true);
    expect(recvTransfer.status).toBe('failed');
    expect(recvTransfer.error).toContain('ENOSPC');
  });

  it('processes receiver transfer confirmation correctly on sender', async () => {
    const senderEngine = new FileTransferEngine('alice');
    const { transfer } = await senderEngine.createTransferOffer(
      {
        name: 'confirm_test.bin',
        size: 50,
        type: 'text/plain',
        data: new Uint8Array(50),
      },
      'bob'
    );

    // Simulate negative confirmation from receiver (e.g. disk write failed on remote)
    senderEngine.handleTransferConfirmation(transfer.transferId, false, 'Disk full on receiver');
    expect(transfer.status).toBe('failed');
    expect(transfer.error).toBe('Disk full on receiver');
  });

  it('detects idle transfer timeouts', () => {
    const engine = new FileTransferEngine('alice');
    const transferId = 'timeout-test-id';
    const transfer = engine.handleIncomingOffer({
      transferId,
      fileName: 'idle.bin',
      fileSize: 1000,
      totalChunks: 10,
      senderId: 'bob',
      sha256Hash: 'dummy',
    });

    transfer.status = 'transferring';
    // Backdate start time to simulate 70 seconds of inactivity
    transfer.startedAt = Date.now() - 70000;

    let failedEvent = false;
    engine.on('transferFailed', () => {
      failedEvent = true;
    });

    engine.checkTimeouts(60000); // 60s timeout
    expect(failedEvent).toBe(true);
    expect(transfer.status).toBe('failed');
    expect(transfer.error).toContain('timed out');
  });
});
