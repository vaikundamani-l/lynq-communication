import { EventEmitter } from './EventEmitter.js';
import {
  FileTransfer,
  FileChunk,
  generateUUID,
  computeSHA256,
  verifyFileIntegrity,
  sanitizeFilename,
} from '@lynq/core';

export const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB

export interface FileDataInput {
  name: string;
  size: number;
  type: string;
  data: Uint8Array;
}

export interface TransferTransport {
  sendData: (type: string, payload: unknown) => boolean;
  isBufferedHigh?: () => boolean;
  onBufferedLow?: (cb: () => void) => void;
}

export class FileTransferEngine extends EventEmitter {
  private activeTransfers = new Map<string, FileTransfer>();
  private outgoingBuffers = new Map<string, Uint8Array>();
  private incomingBuffers = new Map<string, { chunks: Map<number, Uint8Array>; receivedBytes: number }>();
  private transferSpeeds = new Map<string, { lastBytes: number; lastTime: number }>();

  constructor(private myUid: string) {
    super();
  }

  /**
   * Sender initiates a file transfer offer. Requires recipient approval.
   */
  public async createTransferOffer(
    input: FileDataInput,
    receiverId: string
  ): Promise<{ transfer: FileTransfer; offerPayload: unknown }> {
    const safeName = sanitizeFilename(input.name);
    const hash = await computeSHA256(input.data);
    const transferId = generateUUID();
    const fileId = generateUUID();
    const totalChunks = Math.ceil(input.size / DEFAULT_CHUNK_SIZE);

    const transfer: FileTransfer = {
      transferId,
      fileId,
      fileName: safeName,
      fileSize: input.size,
      mimeType: input.type || 'application/octet-stream',
      sha256Hash: hash,
      chunkSize: DEFAULT_CHUNK_SIZE,
      totalChunks,
      transferredChunks: 0,
      transferredBytes: 0,
      direction: 'outgoing',
      senderId: this.myUid,
      receiverId,
      status: 'pending_approval',
      speedBps: 0,
      etaSeconds: 0,
      startedAt: Date.now(),
    };

    this.activeTransfers.set(transferId, transfer);
    this.outgoingBuffers.set(transferId, input.data);

    return {
      transfer,
      offerPayload: {
        transferId,
        fileId,
        fileName: safeName,
        fileSize: input.size,
        mimeType: transfer.mimeType,
        sha256Hash: hash,
        chunkSize: DEFAULT_CHUNK_SIZE,
        totalChunks,
        senderId: this.myUid,
      },
    };
  }

  /**
   * Recipient receives a transfer offer from peer.
   */
  public handleIncomingOffer(offer: any): FileTransfer {
    const transfer: FileTransfer = {
      transferId: offer.transferId,
      fileId: offer.fileId,
      fileName: sanitizeFilename(offer.fileName),
      fileSize: offer.fileSize,
      mimeType: offer.mimeType,
      sha256Hash: offer.sha256Hash,
      chunkSize: offer.chunkSize || DEFAULT_CHUNK_SIZE,
      totalChunks: offer.totalChunks,
      transferredChunks: 0,
      transferredBytes: 0,
      direction: 'incoming',
      senderId: offer.senderId,
      receiverId: this.myUid,
      status: 'pending_approval',
      speedBps: 0,
      etaSeconds: 0,
      startedAt: Date.now(),
    };

    this.activeTransfers.set(transfer.transferId, transfer);
    this.incomingBuffers.set(transfer.transferId, {
      chunks: new Map<number, Uint8Array>(),
      receivedBytes: 0,
    });

    this.emit('offerReceived', transfer);
    return transfer;
  }

  /**
   * Recipient approves incoming transfer.
   */
  public acceptTransfer(transferId: string, transport: TransferTransport): boolean {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.status !== 'pending_approval') {
      return false;
    }

    transfer.status = 'transferring';
    this.emit('transferStarted', transfer);

    return transport.sendData('transfer:accept', {
      transferId,
      receiverId: this.myUid,
    });
  }

  /**
   * Recipient rejects transfer.
   */
  public rejectTransfer(transferId: string, transport: TransferTransport): boolean {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return false;

    transfer.status = 'canceled';
    this.cleanupTransfer(transferId);
    this.emit('transferCanceled', transfer);

    return transport.sendData('transfer:reject', {
      transferId,
      receiverId: this.myUid,
    });
  }

  /**
   * Sender starts streaming chunks once recipient accepts.
   */
  public async startStreamingOutgoing(
    transferId: string,
    transport: TransferTransport
  ): Promise<void> {
    const transfer = this.activeTransfers.get(transferId);
    const data = this.outgoingBuffers.get(transferId);
    if (!transfer || !data) return;

    transfer.status = 'transferring';
    this.emit('transferStarted', transfer);
    this.transferSpeeds.set(transferId, { lastBytes: 0, lastTime: Date.now() });

    for (let index = 0; index < transfer.totalChunks; index++) {
      const current = this.activeTransfers.get(transferId);
      if (!current || current.status !== 'transferring') {
        break;
      }

      // Backpressure check
      if (transport.isBufferedHigh?.()) {
        await new Promise<void>((resolve) => {
          transport.onBufferedLow?.(resolve);
        });
      }

      const start = index * transfer.chunkSize;
      const end = Math.min(start + transfer.chunkSize, data.length);
      const chunkBytes = data.subarray(start, end);

      // Base64 encode for json transport or binary array
      let chunkDataStr: string;
      if (typeof Buffer !== 'undefined') {
        chunkDataStr = Buffer.from(chunkBytes).toString('base64');
      } else {
        let binary = '';
        for (let i = 0; i < chunkBytes.length; i++) {
          binary += String.fromCharCode(chunkBytes[i]);
        }
        chunkDataStr = btoa(binary);
      }

      const chunk: FileChunk = {
        transferId,
        chunkIndex: index,
        totalChunks: transfer.totalChunks,
        data: chunkDataStr,
      };

      transport.sendData('transfer:chunk', chunk);

      transfer.transferredChunks = index + 1;
      transfer.transferredBytes = end;
      this.updateMetrics(transfer);

      this.emit('progress', transfer);
    }

    if (transfer.status === 'transferring') {
      transfer.status = 'completed';
      transfer.completedAt = Date.now();
      this.cleanupTransfer(transferId);
      this.emit('transferCompleted', transfer);
    }
  }

  /**
   * Recipient processes an incoming chunk and checks SHA-256 upon completion.
   */
  public async handleIncomingChunk(chunk: FileChunk): Promise<void> {
    const transfer = this.activeTransfers.get(chunk.transferId);
    const bufferRecord = this.incomingBuffers.get(chunk.transferId);
    if (!transfer || !bufferRecord) return;

    // Decode chunk
    let chunkBytes: Uint8Array;
    if (typeof Buffer !== 'undefined') {
      chunkBytes = Uint8Array.from(Buffer.from(chunk.data, 'base64'));
    } else {
      const binary = atob(chunk.data);
      chunkBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        chunkBytes[i] = binary.charCodeAt(i);
      }
    }

    bufferRecord.chunks.set(chunk.chunkIndex, chunkBytes);
    bufferRecord.receivedBytes += chunkBytes.length;

    transfer.transferredChunks = bufferRecord.chunks.size;
    transfer.transferredBytes = bufferRecord.receivedBytes;
    this.updateMetrics(transfer);

    this.emit('progress', transfer);

    // If all chunks received, assemble and verify SHA-256
    if (transfer.transferredChunks >= transfer.totalChunks) {
      const assembled = new Uint8Array(transfer.fileSize);
      let offset = 0;
      for (let i = 0; i < transfer.totalChunks; i++) {
        const c = bufferRecord.chunks.get(i);
        if (c) {
          assembled.set(c, offset);
          offset += c.length;
        }
      }

      const isValid = await verifyFileIntegrity(assembled, transfer.sha256Hash);
      if (!isValid) {
        transfer.status = 'failed';
        transfer.error = 'SHA-256 checksum verification failed: file corrupted in transit';
        this.emit('transferFailed', transfer);
        this.cleanupTransfer(chunk.transferId);
        return;
      }

      transfer.status = 'completed';
      transfer.completedAt = Date.now();
      this.emit('transferCompleted', { transfer, fileData: assembled });
      this.cleanupTransfer(chunk.transferId);
    }
  }

  private updateMetrics(transfer: FileTransfer): void {
    const speedRecord = this.transferSpeeds.get(transfer.transferId);
    const now = Date.now();

    if (!speedRecord) {
      this.transferSpeeds.set(transfer.transferId, { lastBytes: transfer.transferredBytes, lastTime: now });
      return;
    }

    const timeDiff = (now - speedRecord.lastTime) / 1000;
    if (timeDiff >= 0.5) {
      const bytesDiff = transfer.transferredBytes - speedRecord.lastBytes;
      const speed = bytesDiff / timeDiff;
      transfer.speedBps = Math.round(speed);

      const remainingBytes = transfer.fileSize - transfer.transferredBytes;
      transfer.etaSeconds = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;

      speedRecord.lastBytes = transfer.transferredBytes;
      speedRecord.lastTime = now;
    }
  }

  public cancelTransfer(transferId: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer) {
      transfer.status = 'canceled';
      this.emit('transferCanceled', transfer);
      this.cleanupTransfer(transferId);
    }
  }

  public getTransfer(transferId: string): FileTransfer | undefined {
    return this.activeTransfers.get(transferId);
  }

  private cleanupTransfer(transferId: string): void {
    this.outgoingBuffers.delete(transferId);
    this.incomingBuffers.delete(transferId);
    this.transferSpeeds.delete(transferId);
  }
}
