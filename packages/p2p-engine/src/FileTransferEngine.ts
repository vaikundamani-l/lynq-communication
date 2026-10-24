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

export interface StreamingOptions {
  maxRetries?: number;
  ackTimeoutMs?: number;
  waitForAcks?: boolean;
  confirmationTimeoutMs?: number;
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
    { chunks: Map<number, Uint8Array>; receivedBytes: number; receivedIndexes: Set<number> }
  >();
  private incomingSinks = new Map<string, ChunkSink>();
  private transferSpeeds = new Map<string, { lastBytes: number; lastTime: number }>();
  private outgoingChunkAcks = new Map<string, Set<number>>();
  private outgoingAckResolvers = new Map<string, Map<number, (success: boolean) => void>>();
  private confirmationTimeouts = new Map<string, NodeJS.Timeout>();
  private terminalTransfers = new Set<string>();

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
      receivedIndexes: new Set<number>(),
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
   * Tracks chunk acknowledgements, supports bounded retries, and waits for receiver confirmation.
   */
  public async startStreamingOutgoing(
    transferId: string,
    transport: TransferTransport,
    options?: StreamingOptions
  ): Promise<void> {
    const transfer = this.activeTransfers.get(transferId);
    const data = this.outgoingBuffers.get(transferId);
    const chunkProvider = this.outgoingChunkProviders.get(transferId);
    if (!transfer || (!data && !chunkProvider)) return;

    if (this.terminalTransfers.has(transferId)) return;

    transfer.status = 'transferring';
    this.emit('transferStarted', transfer);
    this.transferSpeeds.set(transferId, { lastBytes: 0, lastTime: Date.now() });

    const maxRetries = options?.maxRetries ?? 3;
    const ackTimeoutMs = options?.ackTimeoutMs ?? 2000;
    const waitForAcks = options?.waitForAcks ?? false;
    const confirmationTimeoutMs = options?.confirmationTimeoutMs ?? 30000;

    if (!this.outgoingChunkAcks.has(transferId)) {
      this.outgoingChunkAcks.set(transferId, new Set<number>());
    }

    for (let index = 0; index < transfer.totalChunks; index++) {
      const current = this.activeTransfers.get(transferId);
      if (!current || current.status !== 'transferring' || this.terminalTransfers.has(transferId)) {
        return;
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

      if (waitForAcks) {
        let acked = false;
        let attempts = 0;

        while (!acked && attempts <= maxRetries) {
          if (this.terminalTransfers.has(transferId) || transfer.status !== 'transferring') {
            return;
          }

          attempts++;
          const sent = transport.sendData('transfer:chunk', chunk);
          if (!sent && attempts > maxRetries) {
            this.failTransfer(
              transfer,
              `Transport send failed on chunk ${index}/${transfer.totalChunks}`
            );
            return;
          }

          // Wait for receiver ACK with timeout
          acked = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
              this.removeAckResolver(transferId, index);
              resolve(false);
            }, ackTimeoutMs);

            this.setAckResolver(transferId, index, (success) => {
              clearTimeout(timer);
              resolve(success);
            });
          });
        }

        if (!acked) {
          this.failTransfer(
            transfer,
            `Chunk ${index} unacknowledged after ${maxRetries} retries (${ackTimeoutMs}ms timeout)`
          );
          return;
        }
      } else {
        const sent = transport.sendData('transfer:chunk', chunk);
        if (!sent) {
          this.failTransfer(
            transfer,
            `Transport send failed on chunk ${index}/${transfer.totalChunks}`
          );
          return;
        }
      }
    }

    // Set confirmation timeout waiting for receiver final success confirmation
    if (transfer.status === 'transferring' && !this.terminalTransfers.has(transferId)) {
      const timer = setTimeout(() => {
        const t = this.activeTransfers.get(transferId);
        if (t && t.status === 'transferring' && !this.terminalTransfers.has(transferId)) {
          this.failTransfer(t, `Transfer confirmation timed out after ${Math.round(confirmationTimeoutMs / 1000)}s`);
        }
      }, confirmationTimeoutMs);
      this.confirmationTimeouts.set(transferId, timer);
    }
  }

  /**
   * Sender processes chunk acknowledgement from receiver.
   * Prevents duplicate ACKs from inflating transferred byte counters or chunks.
   */
  public handleChunkAck(transferId: string, chunkIndex: number): void {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.direction !== 'outgoing' || this.terminalTransfers.has(transferId)) {
      return;
    }

    let acks = this.outgoingChunkAcks.get(transferId);
    if (!acks) {
      acks = new Set<number>();
      this.outgoingChunkAcks.set(transferId, acks);
    }

    // Resolve any pending waitForAcks promise
    const resolver = this.getAckResolver(transferId, chunkIndex);
    if (resolver) {
      resolver(true);
      this.removeAckResolver(transferId, chunkIndex);
    }

    // Drop duplicate ACK - strictly prevents progress corruption
    if (acks.has(chunkIndex)) {
      return;
    }

    acks.add(chunkIndex);
    transfer.transferredChunks = acks.size;

    // Calculate actual non-duplicated transferred bytes based on chunk index
    let totalAckedBytes = 0;
    for (const idx of acks) {
      const start = idx * transfer.chunkSize;
      const end = Math.min(start + transfer.chunkSize, transfer.fileSize);
      totalAckedBytes += (end - start);
    }
    transfer.transferredBytes = Math.min(transfer.fileSize, totalAckedBytes);
    this.updateMetrics(transfer);

    this.emit('progress', transfer);
  }

  /**
   * Recipient processes an incoming chunk. Streams to disk or in-memory sink and verifies integrity.
   * Validates chunk boundaries, detects and drops duplicate chunks, and confirms completion.
   */
  public async handleIncomingChunk(
    chunk: FileChunk,
    transport?: TransferTransport
  ): Promise<void> {
    if (!chunk || typeof chunk !== 'object') return;
    const transferId = chunk.transferId;
    if (!transferId || this.terminalTransfers.has(transferId)) return;

    const transfer = this.activeTransfers.get(transferId);
    const bufferRecord = this.incomingBuffers.get(transferId);
    if (!transfer || !bufferRecord) return;

    if (transfer.status !== 'transferring' && transfer.status !== 'pending_approval') {
      return;
    }

    // 1. Validate chunk structure and totalChunks match
    if (
      typeof chunk.chunkIndex !== 'number' ||
      typeof chunk.totalChunks !== 'number' ||
      chunk.totalChunks !== transfer.totalChunks ||
      typeof chunk.data !== 'string'
    ) {
      transfer.status = 'failed';
      transfer.error = `Malformed chunk payload for transfer ${transferId}`;
      transport?.sendData('transfer:complete', {
        transferId,
        success: false,
        error: transfer.error,
      });
      this.failTransfer(transfer, transfer.error);
      return;
    }

    // 2. Validate chunkIndex boundary
    if (chunk.chunkIndex < 0 || chunk.chunkIndex >= transfer.totalChunks) {
      transfer.status = 'failed';
      transfer.error = `Invalid chunkIndex ${chunk.chunkIndex} for totalChunks ${transfer.totalChunks}`;
      transport?.sendData('transfer:complete', {
        transferId,
        success: false,
        error: transfer.error,
      });
      this.failTransfer(transfer, transfer.error);
      return;
    }

    // 3. Prevent duplicate chunk processing (idempotency)
    if (bufferRecord.receivedIndexes.has(chunk.chunkIndex)) {
      transport?.sendData('transfer:chunk_ack', {
        transferId,
        chunkIndex: chunk.chunkIndex,
      });
      return;
    }

    // 4. Safely decode Base64 data
    let chunkBytes: Uint8Array;
    try {
      chunkBytes = base64ToUint8(chunk.data);
    } catch (e: any) {
      transfer.status = 'failed';
      transfer.error = `Base64 decoding failed for chunk ${chunk.chunkIndex}: ${e?.message || e}`;
      transport?.sendData('transfer:complete', {
        transferId,
        success: false,
        error: transfer.error,
      });
      this.failTransfer(transfer, transfer.error);
      return;
    }

    const offset = chunk.chunkIndex * transfer.chunkSize;

    // 5. Validate chunk length and file boundary
    if (offset + chunkBytes.length > transfer.fileSize) {
      transfer.status = 'failed';
      transfer.error = `Chunk bytes exceed total file size boundary (${offset + chunkBytes.length} > ${transfer.fileSize})`;
      transport?.sendData('transfer:complete', {
        transferId,
        success: false,
        error: transfer.error,
      });
      this.failTransfer(transfer, transfer.error);
      return;
    }

    // Non-final chunks must equal negotiated chunkSize (unless single chunk file)
    if (chunk.chunkIndex < transfer.totalChunks - 1 && chunkBytes.length !== transfer.chunkSize) {
      transfer.status = 'failed';
      transfer.error = `Chunk length ${chunkBytes.length} exceeds negotiated chunkSize ${transfer.chunkSize}`;
      transport?.sendData('transfer:complete', {
        transferId,
        success: false,
        error: transfer.error,
      });
      this.failTransfer(transfer, transfer.error);
      return;
    }

    // Final chunk must exactly match remaining file bytes
    if (chunk.chunkIndex === transfer.totalChunks - 1 && offset + chunkBytes.length !== transfer.fileSize) {
      transfer.status = 'failed';
      transfer.error = `Final chunk length ${chunkBytes.length} does not match expected remainder ${transfer.fileSize - offset}`;
      transport?.sendData('transfer:complete', {
        transferId,
        success: false,
        error: transfer.error,
      });
      this.failTransfer(transfer, transfer.error);
      return;
    }

    // 6. Write chunk to sink or memory buffer
    const sink = this.incomingSinks.get(transferId);
    if (sink) {
      try {
        await sink.writeChunk(chunk.chunkIndex, chunkBytes, offset);
      } catch (err: any) {
        transfer.status = 'failed';
        transfer.error = `Disk write failure on chunk ${chunk.chunkIndex}: ${err?.message || err}`;
        sink.abort?.();
        transport?.sendData('transfer:complete', {
          transferId,
          success: false,
          error: transfer.error,
        });
        this.failTransfer(transfer, transfer.error);
        return;
      }
    } else {
      bufferRecord.chunks.set(chunk.chunkIndex, chunkBytes);
    }

    bufferRecord.receivedIndexes.add(chunk.chunkIndex);
    bufferRecord.receivedBytes += chunkBytes.length;
    transfer.transferredChunks = bufferRecord.receivedIndexes.size;
    transfer.transferredBytes = bufferRecord.receivedBytes;
    this.updateMetrics(transfer);

    this.emit('progress', transfer);

    if (transport) {
      transport.sendData('transfer:chunk_ack', {
        transferId,
        chunkIndex: chunk.chunkIndex,
      });
    }

    // 7. If all unique chunks received, finalize transfer and confirm success
    if (bufferRecord.receivedIndexes.size >= transfer.totalChunks) {
      if (bufferRecord.receivedBytes !== transfer.fileSize) {
        transfer.status = 'failed';
        transfer.error = `Final file size mismatch: received ${bufferRecord.receivedBytes} bytes, expected ${transfer.fileSize} bytes`;
        transport?.sendData('transfer:complete', {
          transferId,
          success: false,
          error: transfer.error,
        });
        this.failTransfer(transfer, transfer.error);
        return;
      }

      if (sink) {
        try {
          const finalizeResult = await sink.finalize();
          this.terminalTransfers.add(transferId);
          transfer.status = 'completed';
          transfer.completedAt = Date.now();
          transport?.sendData('transfer:complete', {
            transferId,
            success: true,
          });
          this.emit('transferCompleted', { transfer, result: finalizeResult });
          this.cleanupTransfer(transferId);
        } catch (err: any) {
          transfer.status = 'failed';
          transfer.error = `Sink finalization failure: ${err?.message || err}`;
          sink.abort?.();
          transport?.sendData('transfer:complete', {
            transferId,
            success: false,
            error: transfer.error,
          });
          this.failTransfer(transfer, transfer.error);
        }
        return;
      }

      // In-memory assembly for small files
      const assembled = new Uint8Array(transfer.fileSize);
      let curOffset = 0;
      for (let i = 0; i < transfer.totalChunks; i++) {
        const c = bufferRecord.chunks.get(i);
        if (!c) {
          transfer.status = 'failed';
          transfer.error = `Missing chunk ${i} during final assembly`;
          transport?.sendData('transfer:complete', {
            transferId,
            success: false,
            error: transfer.error,
          });
          this.failTransfer(transfer, transfer.error);
          return;
        }
        assembled.set(c, curOffset);
        curOffset += c.length;
      }

      if (transfer.sha256Hash) {
        const isValid = await verifyFileIntegrity(assembled, transfer.sha256Hash);
        if (!isValid) {
          transfer.status = 'failed';
          transfer.error = 'SHA-256 checksum verification failed: file corrupted in transit';
          transport?.sendData('transfer:complete', {
            transferId,
            success: false,
            error: transfer.error,
          });
          this.failTransfer(transfer, transfer.error);
          return;
        }
      }

      this.terminalTransfers.add(transferId);
      transfer.status = 'completed';
      transfer.completedAt = Date.now();
      transport?.sendData('transfer:complete', {
        transferId,
        success: true,
      });
      this.emit('transferCompleted', { transfer, fileData: assembled });
      this.cleanupTransfer(transferId);
    }
  }

  /**
   * Sender processes completion confirmation from receiver.
   */
  public handleTransferConfirmation(
    transferId: string,
    success: boolean,
    error?: string
  ): void {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || this.terminalTransfers.has(transferId)) return;

    this.clearConfirmationTimeout(transferId);

    if (!success) {
      this.failTransfer(transfer, error || 'Receiver rejected transfer finalization');
      return;
    }

    this.terminalTransfers.add(transferId);
    transfer.status = 'completed';
    transfer.completedAt = Date.now();
    transfer.transferredChunks = transfer.totalChunks;
    transfer.transferredBytes = transfer.fileSize;
    this.cleanupTransfer(transferId);
    this.emit('transferCompleted', transfer);
  }

  /**
   * Handles peer cancellation notification.
   */
  public handleRemoteCancellation(transferId: string, reason?: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || this.terminalTransfers.has(transferId)) return;
    this.terminalTransfers.add(transferId);

    transfer.status = 'canceled';
    transfer.error = reason || 'Transfer canceled by remote peer';
    const sink = this.incomingSinks.get(transferId);
    sink?.abort?.();
    this.cleanupTransfer(transferId);
    this.emit('transferCanceled', transfer);
  }

  private failTransfer(transfer: FileTransfer, errorMessage: string): void {
    if (this.terminalTransfers.has(transfer.transferId)) return;
    this.terminalTransfers.add(transfer.transferId);

    this.clearConfirmationTimeout(transfer.transferId);
    transfer.status = 'failed';
    transfer.error = errorMessage;
    const sink = this.incomingSinks.get(transfer.transferId);
    sink?.abort?.();
    this.cleanupTransfer(transfer.transferId);
    this.emit('transferFailed', transfer);
  }

  private setAckResolver(transferId: string, index: number, resolver: (success: boolean) => void): void {
    let map = this.outgoingAckResolvers.get(transferId);
    if (!map) {
      map = new Map();
      this.outgoingAckResolvers.set(transferId, map);
    }
    map.set(index, resolver);
  }

  private getAckResolver(transferId: string, index: number): ((success: boolean) => void) | undefined {
    return this.outgoingAckResolvers.get(transferId)?.get(index);
  }

  private removeAckResolver(transferId: string, index: number): void {
    this.outgoingAckResolvers.get(transferId)?.delete(index);
  }

  private clearConfirmationTimeout(transferId: string): void {
    const timer = this.confirmationTimeouts.get(transferId);
    if (timer) {
      clearTimeout(timer);
      this.confirmationTimeouts.delete(transferId);
    }
  }

  /**
   * Periodic check to fail transfers that have timed out without progress.
   */
  public checkTimeouts(maxIdleMs = 60000): void {
    const now = Date.now();
    for (const [transferId, transfer] of this.activeTransfers.entries()) {
      if (this.terminalTransfers.has(transferId)) continue;
      if (transfer.status === 'transferring' || transfer.status === 'pending_approval') {
        const speedRecord = this.transferSpeeds.get(transferId);
        const lastActivity = speedRecord?.lastTime || transfer.startedAt;
        if (now - lastActivity > maxIdleMs) {
          this.failTransfer(
            transfer,
            `Transfer timed out after ${Math.round(maxIdleMs / 1000)}s of inactivity`
          );
        }
      }
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
    if (!transfer || this.terminalTransfers.has(transferId)) return;
    this.terminalTransfers.add(transferId);

    this.clearConfirmationTimeout(transferId);
    transfer.status = 'canceled';
    const sink = this.incomingSinks.get(transferId);
    sink?.abort?.();
    this.emit('transferCanceled', transfer);
    this.cleanupTransfer(transferId);
  }

  public getTransfer(transferId: string): FileTransfer | undefined {
    return this.activeTransfers.get(transferId);
  }

  private cleanupTransfer(transferId: string): void {
    this.clearConfirmationTimeout(transferId);
    this.outgoingBuffers.delete(transferId);
    this.outgoingChunkProviders.delete(transferId);
    this.incomingBuffers.delete(transferId);
    this.incomingSinks.delete(transferId);
    this.transferSpeeds.delete(transferId);
    this.outgoingChunkAcks.delete(transferId);
    const resolvers = this.outgoingAckResolvers.get(transferId);
    if (resolvers) {
      for (const res of resolvers.values()) {
        try { res(false); } catch {}
      }
      this.outgoingAckResolvers.delete(transferId);
    }
  }
}
