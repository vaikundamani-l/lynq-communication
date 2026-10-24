import { EventEmitter } from './EventEmitter.js';
import {
  FileTransfer,
  FileChunk,
  generateUUID,
  computeSHA256,
  computeStreamFingerprint,
  verifyFileIntegrity,
  sanitizeFilename,
  calculateAdaptiveChunkSize,
  MAX_SUPPORTED_FILE_SIZE,
} from '@lynq/core';

export const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB default for <= 10MB

export interface FileDataInput {
  name: string;
  size: number;
  type: string;
  data?: Uint8Array;
  getChunk?: (index: number, start: number, end: number) => Promise<Uint8Array>;
  sha256Hash?: string;
  chunkSize?: number;
}

export interface ChunkSink {
  writeChunk: (chunkIndex: number, chunkBytes: Uint8Array, offset: number) => Promise<void> | void;
  finalize: () => Promise<void | any>;
  abort?: () => void;
}

export interface TransferTransport {
  sendData: (type: string, payload: unknown) => boolean;
  isBufferedHigh?: () => boolean;
  onBufferedLow?: (cb: () => void) => void;
}

/**
 * High-performance binary to Base64 encoder using 32KB slices
 * to prevent maximum call stack exceeded errors on 1MB-4MB chunks.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const CHUNK_LEN = 0x8000; // 32KB
  for (let i = 0; i < bytes.length; i += CHUNK_LEN) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK_LEN) as unknown as number[]
    );
  }
  return btoa(binary);
}

/**
 * Decodes Base64 string to Uint8Array safely in any environment.
 */
export function base64ToUint8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class FileTransferEngine extends EventEmitter {
  private activeTransfers = new Map<string, FileTransfer>();
  private outgoingBuffers = new Map<string, Uint8Array>();
  private outgoingChunkProviders = new Map<
    string,
    (index: number, start: number, end: number) => Promise<Uint8Array>
  >();
  private incomingBuffers = new Map<
    string,
    { chunks: Map<number, Uint8Array>; receivedBytes: number }
  >();
  private incomingSinks = new Map<string, ChunkSink>();
  private transferSpeeds = new Map<string, { lastBytes: number; lastTime: number }>();

  constructor(private myUid: string) {
    super();
  }

  /**
   * Sender initiates a file transfer offer. Supports files up to 20 GB.
   */
  public async createTransferOffer(
    input: FileDataInput,
    receiverId: string
  ): Promise<{ transfer: FileTransfer; offerPayload: unknown }> {
    if (input.size > MAX_SUPPORTED_FILE_SIZE) {
      throw new Error(
        `File size (${(input.size / (1024 * 1024 * 1024)).toFixed(2)} GB) exceeds the maximum supported ceiling of 20 GB.`
      );
    }

    const safeName = sanitizeFilename(input.name);
    const chunkSize = input.chunkSize || calculateAdaptiveChunkSize(input.size);
    const totalChunks = Math.ceil(input.size / chunkSize);

    // Compute checksum or streaming fingerprint
    let hash: string;
    if (input.sha256Hash) {
      hash = input.sha256Hash;
    } else if (input.data) {
      hash = await computeSHA256(input.data);
    } else if (input.getChunk) {
      hash = await computeStreamFingerprint(input.size, (start, end) =>
        input.getChunk!(0, start, end)
      );
    } else {
      hash = 'sha256_' + generateUUID().replace(/-/g, '');
    }

    const transferId = generateUUID();
    const fileId = generateUUID();

    const transfer: FileTransfer = {
      transferId,
      fileId,
      fileName: safeName,
      fileSize: input.size,
      mimeType: input.type || 'application/octet-stream',
      sha256Hash: hash,
      chunkSize,
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

    if (input.data) {
      this.outgoingBuffers.set(transferId, input.data);
    }
    if (input.getChunk) {
      this.outgoingChunkProviders.set(transferId, input.getChunk);
    }

    return {
      transfer,
      offerPayload: {
        transferId,
        fileId,
        fileName: safeName,
        fileSize: input.size,
        mimeType: transfer.mimeType,
        sha256Hash: hash,
        chunkSize,
        totalChunks,
        senderId: this.myUid,
      },
    };
  }

  /**
   * Recipient receives a transfer offer from peer.
   */
  public handleIncomingOffer(offer: any): FileTransfer {
    const chunkSize = offer.chunkSize || calculateAdaptiveChunkSize(offer.fileSize || 0);
    const totalChunks = offer.totalChunks || Math.ceil((offer.fileSize || 0) / chunkSize);

    const transfer: FileTransfer = {
      transferId: offer.transferId,
      fileId: offer.fileId,
      fileName: sanitizeFilename(offer.fileName),
      fileSize: offer.fileSize,
      mimeType: offer.mimeType,
      sha256Hash: offer.sha256Hash,
      chunkSize,
      totalChunks,
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
   * Registers a progressive chunk sink (e.g. disk file writer or FileSystemWritableFileStream)
   * for streaming multi-gigabyte files (up to 20 GB) with near-zero memory footprint.
   */
  public registerChunkSink(transferId: string, sink: ChunkSink): void {
    this.incomingSinks.set(transferId, sink);
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
   * Sender streams chunks progressively. Uses on-demand slicing to keep RAM usage constant.
   */
  public async startStreamingOutgoing(
    transferId: string,
    transport: TransferTransport
  ): Promise<void> {
    const transfer = this.activeTransfers.get(transferId);
    const data = this.outgoingBuffers.get(transferId);
    const chunkProvider = this.outgoingChunkProviders.get(transferId);
    if (!transfer || (!data && !chunkProvider)) return;

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
      const end = Math.min(start + transfer.chunkSize, transfer.fileSize);

      let chunkBytes: Uint8Array;
      if (chunkProvider) {
        chunkBytes = await chunkProvider(index, start, end);
      } else if (data) {
        chunkBytes = data.subarray(start, end);
      } else {
        break;
      }

      const chunkDataStr = uint8ToBase64(chunkBytes);

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
   * Recipient processes an incoming chunk. Streams to disk or in-memory sink and verifies integrity.
   */
  public async handleIncomingChunk(chunk: FileChunk): Promise<void> {
    const transfer = this.activeTransfers.get(chunk.transferId);
    const bufferRecord = this.incomingBuffers.get(chunk.transferId);
    if (!transfer || !bufferRecord) return;

    const chunkBytes = base64ToUint8(chunk.data);
    const offset = chunk.chunkIndex * transfer.chunkSize;

    const sink = this.incomingSinks.get(chunk.transferId);
    if (sink) {
      // Direct progressive stream to disk or stream sink (0 RAM retained)
      await sink.writeChunk(chunk.chunkIndex, chunkBytes, offset);
    } else {
      // In-memory fallback for small transfers (< 250 MB)
      bufferRecord.chunks.set(chunk.chunkIndex, chunkBytes);
    }

    bufferRecord.receivedBytes += chunkBytes.length;
    transfer.transferredChunks++;
    transfer.transferredBytes = bufferRecord.receivedBytes;
    this.updateMetrics(transfer);

    this.emit('progress', transfer);

    // If all chunks received, finalize transfer
    if (transfer.transferredChunks >= transfer.totalChunks) {
      if (sink) {
        const finalizeResult = await sink.finalize();
        transfer.status = 'completed';
        transfer.completedAt = Date.now();
        this.emit('transferCompleted', { transfer, result: finalizeResult });
        this.cleanupTransfer(chunk.transferId);
        return;
      }

      // In-memory assembly for small files
      const assembled = new Uint8Array(transfer.fileSize);
      let curOffset = 0;
      for (let i = 0; i < transfer.totalChunks; i++) {
        const c = bufferRecord.chunks.get(i);
        if (c) {
          assembled.set(c, curOffset);
          curOffset += c.length;
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
      this.transferSpeeds.set(transfer.transferId, {
        lastBytes: transfer.transferredBytes,
        lastTime: now,
      });
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
      const sink = this.incomingSinks.get(transferId);
      sink?.abort?.();
      this.emit('transferCanceled', transfer);
      this.cleanupTransfer(transferId);
    }
  }

  public getTransfer(transferId: string): FileTransfer | undefined {
    return this.activeTransfers.get(transferId);
  }

  private cleanupTransfer(transferId: string): void {
    this.outgoingBuffers.delete(transferId);
    this.outgoingChunkProviders.delete(transferId);
    this.incomingBuffers.delete(transferId);
    this.incomingSinks.delete(transferId);
    this.transferSpeeds.delete(transferId);
  }
}
