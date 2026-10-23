import type Database from 'better-sqlite3';
import { FileTransfer, TransferStatus } from '@lynq/core';

interface TransferRow {
  transfer_id: string;
  file_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  sha256_hash: string;
  chunk_size: number;
  total_chunks: number;
  transferred_chunks: number;
  transferred_bytes: number;
  direction: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  speed_bps: number;
  eta_seconds: number;
  save_path: string | null;
  error: string | null;
  started_at: number;
  completed_at: number | null;
}

export class FileTransferRepository {
  constructor(private db: Database.Database) {}

  public saveTransfer(transfer: FileTransfer): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_transfers (
        transfer_id, file_id, file_name, file_size, mime_type,
        sha256_hash, chunk_size, total_chunks, transferred_chunks,
        transferred_bytes, direction, sender_id, receiver_id,
        status, speed_bps, eta_seconds, save_path, error,
        started_at, completed_at
      ) VALUES (
        @transferId, @fileId, @fileName, @fileSize, @mimeType,
        @sha256Hash, @chunkSize, @totalChunks, @transferredChunks,
        @transferredBytes, @direction, @senderId, @receiverId,
        @status, @speedBps, @etaSeconds, @savePath, @error,
        @startedAt, @completedAt
      )
      ON CONFLICT(transfer_id) DO UPDATE SET
        transferred_chunks = excluded.transferred_chunks,
        transferred_bytes = excluded.transferred_bytes,
        status = excluded.status,
        speed_bps = excluded.speed_bps,
        eta_seconds = excluded.eta_seconds,
        save_path = excluded.save_path,
        error = excluded.error,
        completed_at = excluded.completed_at
    `);

    stmt.run({
      transferId: transfer.transferId,
      fileId: transfer.fileId,
      fileName: transfer.fileName,
      fileSize: transfer.fileSize,
      mimeType: transfer.mimeType,
      sha256Hash: transfer.sha256Hash,
      chunkSize: transfer.chunkSize,
      totalChunks: transfer.totalChunks,
      transferredChunks: transfer.transferredChunks,
      transferredBytes: transfer.transferredBytes,
      direction: transfer.direction,
      senderId: transfer.senderId,
      receiverId: transfer.receiverId,
      status: transfer.status,
      speedBps: transfer.speedBps,
      etaSeconds: transfer.etaSeconds,
      savePath: transfer.savePath || null,
      error: transfer.error || null,
      startedAt: transfer.startedAt,
      completedAt: transfer.completedAt || null,
    });
  }

  public getTransfer(transferId: string): FileTransfer | null {
    const row = this.db.prepare('SELECT * FROM file_transfers WHERE transfer_id = ?').get(transferId) as
      | TransferRow
      | undefined;
    if (!row) return null;
    return this.mapRowToTransfer(row);
  }

  public updateProgress(
    transferId: string,
    transferredChunks: number,
    transferredBytes: number,
    speedBps: number,
    etaSeconds: number
  ): void {
    this.db.prepare(`
      UPDATE file_transfers 
      SET transferred_chunks = ?, transferred_bytes = ?, speed_bps = ?, eta_seconds = ?
      WHERE transfer_id = ?
    `).run(transferredChunks, transferredBytes, speedBps, etaSeconds, transferId);
  }

  public updateStatus(
    transferId: string,
    status: TransferStatus,
    savePath?: string,
    error?: string
  ): void {
    const completedAt = status === 'completed' ? Date.now() : null;
    this.db.prepare(`
      UPDATE file_transfers 
      SET status = ?, save_path = COALESCE(?, save_path), error = ?, completed_at = COALESCE(?, completed_at)
      WHERE transfer_id = ?
    `).run(status, savePath || null, error || null, completedAt, transferId);
  }

  public getTransfersByPeer(peerId: string): FileTransfer[] {
    const rows = this.db.prepare(`
      SELECT * FROM file_transfers 
      WHERE sender_id = ? OR receiver_id = ?
      ORDER BY started_at DESC
    `).all(peerId, peerId) as TransferRow[];
    return rows.map((r) => this.mapRowToTransfer(r));
  }

  private mapRowToTransfer(row: TransferRow): FileTransfer {
    return {
      transferId: row.transfer_id,
      fileId: row.file_id,
      fileName: row.file_name,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      sha256Hash: row.sha256_hash,
      chunkSize: row.chunk_size,
      totalChunks: row.total_chunks,
      transferredChunks: row.transferred_chunks,
      transferredBytes: row.transferred_bytes,
      direction: row.direction as 'incoming' | 'outgoing',
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: row.status as TransferStatus,
      speedBps: row.speed_bps,
      etaSeconds: row.eta_seconds,
      savePath: row.save_path || undefined,
      error: row.error || undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
    };
  }
}
