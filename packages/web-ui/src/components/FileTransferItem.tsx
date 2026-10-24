import React from 'react';
import { FileTransfer } from '@lynq/core';

interface FileTransferItemProps {
  transfer: FileTransfer;
  onCancel: (transferId: string) => void;
}

export const FileTransferItem: React.FC<FileTransferItemProps> = ({ transfer, onCancel }) => {
  const percent = transfer.fileSize > 0
    ? Math.min(100, Math.round((transfer.transferredBytes / transfer.fileSize) * 100))
    : 0;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatSpeed = (bps: number): string => {
    if (bps < 1024) return `${bps} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    if (bps < 1024 * 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bps / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
  };

  const getFileIcon = (mime: string): string => {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎥';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar')) return '📦';
    return '📁';
  };

  return (
    <div
      style={{
        background: 'var(--bg-active)',
        borderRadius: '10px',
        padding: '10px 14px',
        margin: '6px 0',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <span style={{ fontSize: '20px' }}>{getFileIcon(transfer.mimeType)}</span>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontWeight: 600, fontSize: '13.5px', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {transfer.fileName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {formatSize(transfer.transferredBytes)} of {formatSize(transfer.fileSize)}
              {transfer.status === 'transferring' && ` • ${formatSpeed(transfer.speedBps)}`}
              {transfer.status === 'transferring' && transfer.etaSeconds > 0 && ` • ~${transfer.etaSeconds}s left`}
            </div>
          </div>
        </div>

        {transfer.status === 'transferring' && (
          <button
            onClick={() => onCancel(transfer.transferId)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '4px',
            }}
            title="Cancel Transfer"
          >
            ✕
          </button>
        )}

        {transfer.status === 'pending_approval' && (
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            ⏳ Pending
          </span>
        )}

        {transfer.status === 'completed' && (
          <span style={{ fontSize: '12px', color: 'var(--status-online)', fontWeight: 600 }}>
            ✓ Complete
          </span>
        )}

        {transfer.status === 'failed' && (
          <span style={{ fontSize: '12px', color: 'var(--accent-danger)', fontWeight: 600 }}>
            ⚠️ Failed
          </span>
        )}
      </div>

      {/* Progress Bar */}
      {transfer.status === 'transferring' && (
        <div style={{ width: '100%', height: '4px', background: 'var(--border-strong)', borderRadius: '2px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              background: 'var(--accent)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}
    </div>
  );
};
