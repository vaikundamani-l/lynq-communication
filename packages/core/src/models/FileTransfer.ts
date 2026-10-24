export type TransferDirection = 'incoming' | 'outgoing';
export type TransferStatus =
  | 'pending_approval'
  | 'queued'
  | 'transferring'
  | 'paused'
  | 'completed'
  | 'canceled'
  | 'failed';

export interface FileTransfer {
  transferId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256Hash: string;
  chunkSize: number;
  totalChunks: number;
  transferredChunks: number;
  transferredBytes: number;
  direction: TransferDirection;
  senderId: string;
  receiverId: string;
  status: TransferStatus;
  speedBps: number;
  etaSeconds: number;
  savePath?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export const CHUNK_SIZE_SMALL = 64 * 1024; // 64 KB (files <= 10MB)
export const CHUNK_SIZE_MEDIUM = 256 * 1024; // 256 KB (files <= 100MB)
export const CHUNK_SIZE_LARGE = 1024 * 1024; // 1 MB (files <= 1GB)
export const CHUNK_SIZE_XLARGE = 2 * 1024 * 1024; // 2 MB (files up to 20GB+)

export const MAX_SUPPORTED_FILE_SIZE = 20 * 1024 * 1024 * 1024; // 20 GB

export function calculateAdaptiveChunkSize(fileSizeBytes: number): number {
  if (fileSizeBytes <= 10 * 1024 * 1024) return CHUNK_SIZE_SMALL;
  if (fileSizeBytes <= 100 * 1024 * 1024) return CHUNK_SIZE_MEDIUM;
  if (fileSizeBytes <= 1024 * 1024 * 1024) return CHUNK_SIZE_LARGE;
  return CHUNK_SIZE_XLARGE;
}

export interface FileChunk {
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string; // Base64 encoded binary chunk or ArrayBuffer in transport
  sha256Chunk?: string;
}
