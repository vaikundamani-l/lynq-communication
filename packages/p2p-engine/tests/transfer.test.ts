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
});
