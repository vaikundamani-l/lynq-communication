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

export interface FileChunk {
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string; // Base64 encoded binary chunk or ArrayBuffer in transport
  sha256Chunk?: string;
}
