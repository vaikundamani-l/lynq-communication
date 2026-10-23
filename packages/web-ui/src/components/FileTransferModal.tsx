import React from 'react';
import { FileTransfer } from '@lynq/core';

interface FileTransferModalProps {
  incomingTransfer: FileTransfer | null;
  onAccept: (transferId: string) => void;
  onReject: (transferId: string) => void;
}

export const FileTransferModal: React.FC<FileTransferModalProps> = ({
  incomingTransfer,
  onAccept,
  onReject,
}) => {
  if (!incomingTransfer || incomingTransfer.status !== 'pending_approval') {
    return null;
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>
          {getFileIcon(incomingTransfer.mimeType)}
        </div>

        <h3 className="modal-title" style={{ marginBottom: '8px' }}>
          Incoming Direct File Transfer
        </h3>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          User <strong>{incomingTransfer.senderId}</strong> wants to send you a file over your direct local network.
        </p>

        <div
          style={{
            background: 'var(--bg-input)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '14px', wordBreak: 'break-all' }}>
            {incomingTransfer.fileName}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {formatSize(incomingTransfer.fileSize)} • {incomingTransfer.mimeType}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => onReject(incomingTransfer.transferId)}
            className="action-btn"
            style={{
              width: '120px',
              height: '40px',
              borderRadius: '8px',
              border: '1px solid var(--border-strong)',
              fontSize: '14px',
            }}
          >
            Decline
          </button>
          <button
            onClick={() => onAccept(incomingTransfer.transferId)}
            className="send-btn"
            style={{
              width: '140px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            ✓ Accept & Save
          </button>
        </div>
      </div>
    </div>
  );
};
