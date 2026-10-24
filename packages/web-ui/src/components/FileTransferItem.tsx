import React from 'react';
import { FileTransfer } from '@lynq/core';
import { CloseIcon, RefreshIcon, CheckIcon } from './Icons';

interface FileTransferItemProps {
  transfer: FileTransfer;
  onCancel?: (transferId: string) => void;
  onAccept?: (transferId: string) => void;
  onDecline?: (transferId: string) => void;
  onRetry?: (transferId: string) => void;
}

export const FileTransferItem: React.FC<FileTransferItemProps> = ({
  transfer,
  onCancel,
  onAccept,
  onDecline,
  onRetry,
}) => {
  const percent =
    transfer.fileSize > 0
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

  const isFailed = transfer.status === 'failed';
  const isPending = transfer.status === 'pending_approval';
  const isTransferring = transfer.status === 'transferring';
  const isCompleted = transfer.status === 'completed';

  return (
    <div
      style={{
        background: isFailed ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-active)',
        borderRadius: '10px',
        padding: '10px 14px',
        margin: '6px 0',
        border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-subtle)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
          <span style={{ fontSize: '22px', flexShrink: 0 }}>{getFileIcon(transfer.mimeType)}</span>
          <div style={{ overflow: 'hidden', flex: 1, paddingRight: '8px' }}>
            <div
              title={transfer.fileName}
              style={{
                fontWeight: 600,
                fontSize: '13.5px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.3,
                wordBreak: 'break-word',
              }}
            >
              {transfer.fileName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {formatSize(transfer.transferredBytes)} of {formatSize(transfer.fileSize)}
              {isTransferring && ` • ${formatSpeed(transfer.speedBps)}`}
              {isTransferring && transfer.etaSeconds > 0 && ` • ~${transfer.etaSeconds}s left`}
              {` • ${transfer.direction === 'outgoing' ? 'Outgoing' : `From ${transfer.senderId}`}`}
            </div>
            {isFailed && (
              <div style={{ fontSize: '11px', color: 'var(--accent-danger)', marginTop: '3px', fontWeight: 500 }}>
                Transfer interrupted. Transport packet lost or verification error.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {isPending && (
            <>
              {onDecline && (
                <button
                  type="button"
                  onClick={() => onDecline(transfer.transferId)}
                  className="action-btn"
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong)',
                  }}
                  title="Decline transfer"
                >
                  Decline
                </button>
              )}
              {onAccept && (
                <button
                  type="button"
                  onClick={() => onAccept(transfer.transferId)}
                  className="modal-btn primary"
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                  title="Accept and download file"
                >
                  Accept
                </button>
              )}
            </>
          )}

          {isFailed && onRetry && (
            <button
              type="button"
              onClick={() => onRetry(transfer.transferId)}
              className="action-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '6px',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}
              title="Retry Transfer"
            >
              <RefreshIcon size={14} /> Retry
            </button>
          )}

          {isTransferring && onCancel && (
            <button
              type="button"
              onClick={() => onCancel(transfer.transferId)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Cancel Transfer"
              aria-label="Cancel Transfer"
            >
              <CloseIcon size={16} />
            </button>
          )}

          {isCompleted && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--status-online)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <CheckIcon size={14} /> Verified
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {isTransferring && (
        <div
          style={{
            width: '100%',
            height: '4px',
            background: 'var(--border-strong)',
            borderRadius: '2px',
            overflow: 'hidden',
            marginTop: '4px',
          }}
        >
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
