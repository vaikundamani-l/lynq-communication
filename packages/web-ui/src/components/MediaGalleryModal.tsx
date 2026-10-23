import React, { useState } from 'react';
import { Message } from '@lynq/core';

interface MediaGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  messages: Message[];
}

export const MediaGalleryModal: React.FC<MediaGalleryModalProps> = ({
  isOpen,
  onClose,
  title,
  messages,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'media' | 'docs' | 'voice'>('all');

  if (!isOpen) return null;

  // Extract all file and voice messages
  const fileMessages = messages.filter((m) => m.type === 'file' || m.type === 'voice');

  const filtered = fileMessages.filter((m) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'voice') return m.type === 'voice';
    const mime = m.fileMetadata?.mimeType || '';
    if (activeTab === 'media') {
      return mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/');
    }
    if (activeTab === 'docs') {
      return !mime.startsWith('image/') && !mime.startsWith('video/') && m.type !== 'voice';
    }
    return true;
  });

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ width: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Media & Files Gallery</h3>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{title}</div>
          </div>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '14px' }}>
          {(['all', 'media', 'docs', 'voice'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'var(--accent)' : 'var(--bg-active)',
                color: activeTab === tab ? 'white' : 'var(--text-secondary)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab === 'all' ? `All (${fileMessages.length})` : tab}
            </button>
          ))}
        </div>

        {/* Gallery Content Stream */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
              <div>No shared media or documents found in this conversation yet.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map((msg) => {
                const meta = msg.fileMetadata;
                const isImage = meta?.mimeType?.startsWith('image/');
                const isVoice = msg.type === 'voice';

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      background: 'var(--bg-active)',
                      padding: '10px 14px',
                      borderRadius: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: isImage ? '#3b82f6' : isVoice ? '#10b981' : '#6366f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        color: 'white',
                      }}
                    >
                      {isImage ? '🖼️' : isVoice ? '🎙️' : '📄'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '13.5px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {meta?.fileName || msg.content}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {formatFileSize(meta?.fileSize)} • {formatDate(msg.timestamp)}
                        {meta?.sha256Hash && ' • SHA-256 ✓'}
                      </div>
                    </div>

                    <button
                      onClick={() => alert(`Accessing local file: ${meta?.fileName || 'media'}\nVerified SHA-256: ${meta?.sha256Hash || 'N/A'}`)}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
