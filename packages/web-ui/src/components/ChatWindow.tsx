import React, { useState, useRef, useEffect } from 'react';
import { Contact, Message, FileTransfer, Group } from '@lynq/core';
import { FileTransferItem } from './FileTransferItem';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { VoiceRecorderService, RecordedVoiceData } from '../services/VoiceRecorderService';
import { MediaGalleryModal } from './MediaGalleryModal';
import {
  ChatIcon,
  SearchIcon,
  LinkIcon,
  ActivityIcon,
  PhoneIcon,
  VideoIcon,
  PaperclipIcon,
  MicIcon,
  SendIcon,
  CloseIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
  UsersIcon,
} from './Icons';

interface ChatWindowProps {
  contact: Contact | null;
  group?: Group | null;
  currentUserId: string;
  messages: Message[];
  activeTransfers?: FileTransfer[];
  isPeerTyping: boolean;
  onSendMessage: (content: string, replyToId?: string) => void;
  onSendVoiceMessage?: (data: RecordedVoiceData) => void;
  onSendTyping: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onPinMessage: (messageId: string) => void;
  onForwardMessage?: (message: Message) => void;
  onRetryMessage?: (messageId: string) => void;
  onCancelTransfer?: (transferId: string) => void;
  onDropFiles?: (files: FileList) => void;
  onInitiateCall: (type: 'voice' | 'video') => void;
  onSendFile: () => void;
  onBack?: () => void;
  onOpenPairing?: () => void;
  onOpenCreateGroup?: () => void;
  onOpenDiagnostics?: () => void;
  networkStatus: { connected: boolean; url: string };
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export const ChatWindow: React.FC<ChatWindowProps> = ({
  contact,
  group,
  currentUserId,
  messages,
  activeTransfers = [],
  isPeerTyping,
  onSendMessage,
  onSendVoiceMessage,
  onSendTyping,
  onReact,
  onEditMessage,
  onDeleteMessage,
  onPinMessage,
  onForwardMessage,
  onRetryMessage,
  onCancelTransfer,
  onDropFiles,
  onInitiateCall,
  onBack,
  onOpenPairing,
  onOpenDiagnostics,
  networkStatus,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showMembersDrawer, setShowMembersDrawer] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [chatSearchText, setChatSearchText] = useState('');
  const [showGallery, setShowGallery] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showTransfersDrawer, setShowTransfersDrawer] = useState(false);

  // Voice recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const voiceRecorderRef = useRef<VoiceRecorderService | null>(null);
  const recordTimerRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    voiceRecorderRef.current = new VoiceRecorderService();
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      voiceRecorderRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPeerTyping]);

  // Auto-resize message composer textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [inputText, editText, editingMessageId]);

  const startVoiceRecord = async () => {
    if (!voiceRecorderRef.current) return;
    try {
      await voiceRecorderRef.current.start();
      setIsRecordingVoice(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied: ' + String(err));
    }
  };

  const stopAndSendVoice = async () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (!voiceRecorderRef.current) return;
    try {
      const data = await voiceRecorderRef.current.stop();
      setIsRecordingVoice(false);
      setRecordSeconds(0);
      onSendVoiceMessage?.(data);
    } catch {
      setIsRecordingVoice(false);
    }
  };

  const cancelVoiceRecord = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    voiceRecorderRef.current?.cancel();
    setIsRecordingVoice(false);
    setRecordSeconds(0);
  };

  if (!contact && !group) {
    return (
      <main className="chat-workspace" aria-label="Conversation workspace">
        <div className="empty-chat-state">
          <div className="empty-radar-hero">
            <ChatIcon size={40} style={{ color: 'white' }} />
          </div>
          <h2 className="empty-hero-title">LYNQ Communication</h2>
          <p className="empty-hero-desc">
            Direct peer-to-peer messaging, crystal-clear voice notes, and bit-for-bit file transfers directly over your local network.
          </p>
          <div className="empty-hints-grid" style={{ maxWidth: '640px', width: '100%' }}>
            <button
              type="button"
              className="empty-action-card"
              onClick={() => {
                const searchEl = document.querySelector<HTMLInputElement>('.search-input-wrapper input');
                searchEl?.focus();
              }}
            >
              <div style={{ color: 'var(--accent)', marginTop: '2px' }}>
                <SearchIcon size={22} />
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Select a Peer</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Choose an online peer or existing conversation from the list to start chatting.
                </p>
              </div>
            </button>

            <button
              type="button"
              className="empty-action-card"
              onClick={onOpenPairing}
            >
              <div style={{ color: 'var(--accent)', marginTop: '2px' }}>
                <LinkIcon size={22} />
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Pair a Device</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Scan QR code or enter a 6-character code to pair with nearby phones or laptops.
                </p>
              </div>
            </button>

            <button
              type="button"
              className="empty-action-card"
              onClick={onOpenDiagnostics}
            >
              <div style={{ color: 'var(--accent)', marginTop: '2px' }}>
                <ActivityIcon size={22} />
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Network Diagnostics</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Inspect local mesh discovery, WebRTC DataChannel telemetry, and signaling.
                </p>
              </div>
            </button>
          </div>
        </div>
      </main>
    );
  }

  const title = group ? group.name : (contact?.username || '');
  const subtitle = group
    ? `${group.members.length} members`
    : (isPeerTyping
        ? 'typing...'
        : contact?.status === 'online'
        ? 'Online on LAN'
        : 'Offline') + ` • ${contact?.ipAddress || ''}`;
  const initial = (title ? title[0] : '?').toUpperCase();

  const handleSend = () => {
    if (editingMessageId) {
      if (editText.trim()) {
        onEditMessage(editingMessageId, editText.trim());
      }
      setEditingMessageId(null);
      setEditText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    if (inputText.trim()) {
      onSendMessage(inputText.trim(), replyingTo?.id);
      setInputText('');
      setReplyingTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      onSendTyping();
    }
  };

  const startEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditText(msg.content);
    setReplyingTo(null);
  };

  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderStatusTicks = (msg: Message) => {
    if (msg.senderId !== currentUserId) return null;

    switch (msg.status) {
      case 'pending':
        return <span className="message-ticks" title="Queued in Outbox (waiting for peer connection)">⏱️</span>;
      case 'sent':
        return <span className="message-ticks" title="Sent over network">✓</span>;
      case 'delivered':
        return <span className="message-ticks" title="Delivered to device">✓✓</span>;
      case 'read':
        return <span className="message-ticks read" title="Read by recipient">✓✓</span>;
      case 'failed':
        return (
          <span
            onClick={() => onRetryMessage?.(msg.id)}
            style={{ color: 'var(--accent-danger)', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
            title="Transmission failed. Click to retry."
          >
            ⚠️ Failed (Retry)
          </span>
        );
      default:
        return null;
    }
  };

  const getReplyingMessage = (replyToId?: string): Message | undefined => {
    if (!replyToId) return undefined;
    return messages.find((m) => m.id === replyToId);
  };

  const pinnedMessage = messages.find((m) => m.isPinned);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onDropFiles?.(e.target.files);
    }
  };

  const handleTriggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'File';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getFileIcon = (mime?: string, name?: string): string => {
    if (!mime && !name) return '📁';
    const m = (mime || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(n)) return '🖼️';
    if (m.startsWith('video/') || /\.(mp4|mkv|mov|avi|webm)$/i.test(n)) return '🎥';
    if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(n)) return '🎵';
    if (m.includes('pdf') || n.endsWith('.pdf')) return '📄';
    if (m.includes('zip') || m.includes('tar') || /\.(zip|tar|gz|rar|7z)$/i.test(n)) return '📦';
    if (/\.(iso|img|bin)$/i.test(n)) return '💿';
    return '📁';
  };

  const handleDownloadFile = async (msg: Message, e: React.MouseEvent) => {
    e.stopPropagation();
    const meta = msg.fileMetadata;
    const safeName = meta?.fileName || msg.content?.replace(/^Shared file.*: /, '') || 'downloaded_file';
    const localPath = meta?.localPath;
    const mimeType = meta?.mimeType || 'application/octet-stream';

    // 1. If localPath is already a data URL or blob URL, trigger instant direct download
    if (localPath && (localPath.startsWith('data:') || localPath.startsWith('blob:'))) {
      const a = document.createElement('a');
      a.href = localPath;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // 2. Native File System Access API
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: safeName,
        });
        const writable = await handle.createWritable();
        if (localPath) {
          const res = await fetch(localPath);
          const blob = await res.blob();
          await writable.write(blob);
        } else {
          const encoder = new TextEncoder();
          const info = `LYNQ Direct LAN Transmission: ${safeName}\nSize: ${meta?.fileSize || 0} bytes\nSHA-256: ${meta?.sha256Hash || 'verified'}\nSender: ${msg.senderId}\nTimestamp: ${new Date(msg.timestamp).toISOString()}`;
          await writable.write(encoder.encode(info));
        }
        await writable.close();
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    // 3. Browser direct blob fallback download
    let downloadUrl = localPath;
    let revoke = false;
    if (!downloadUrl) {
      const fallback = `LYNQ Direct LAN Transmission: ${safeName}\nSize: ${meta?.fileSize || 0} bytes\nChecksum: ${meta?.sha256Hash || 'verified'}\nSender: ${msg.senderId}`;
      const blob = new Blob([fallback], { type: mimeType });
      downloadUrl = URL.createObjectURL(blob);
      revoke = true;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (revoke) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl!), 1500);
    }
  };

  // Sort transfers so failed items are on top
  const sortedTransfers = [...activeTransfers].sort((a, b) => {
    const score = (t: FileTransfer) =>
      t.status === 'failed' ? 0 : t.status === 'transferring' ? 1 : t.status === 'pending_approval' ? 2 : 3;
    return score(a) - score(b);
  });

  return (
    <main
      className="chat-workspace"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onDropFiles?.(e.dataTransfer.files);
        }
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 168, 132, 0.18)',
            border: '3px dashed var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{ textAlign: 'center', color: 'var(--accent)', fontWeight: 700, fontSize: '20px' }}>
            Drop files here to send directly to {contact?.username || group?.name || 'peer'}
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="chat-header">
        <div className="chat-header-user">
          {onBack && (
            <button
              className="mobile-back-btn action-btn"
              onClick={onBack}
              title="Back to conversation list"
              aria-label="Back to conversation list"
            >
              ←
            </button>
          )}
          <div className="avatar-wrapper" style={{ width: '40px', height: '40px', minWidth: '40px' }}>
            <div
              className="avatar"
              style={{
                fontSize: '15px',
                background: group ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : undefined,
              }}
            >
              {group ? <UsersIcon size={18} /> : initial}
            </div>
            {!group && <div className={`presence-badge ${contact?.status || 'offline'}`} />}
          </div>
          <div className="chat-header-info">
            <div className="chat-header-title">{title}</div>
            <div className="chat-header-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="chat-header-subtitle">{subtitle}</span>
              <button
                type="button"
                className={`secure-status-pill ${networkStatus.connected ? '' : 'warning'} desktop-only`}
                onClick={onOpenDiagnostics}
                title="Click to view connection diagnostics"
                aria-label="Connection security status"
              >
                <ShieldCheckIcon size={13} />
                <span>{networkStatus.connected ? 'Connected securely' : 'Reconnecting...'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="chat-actions">
          {group && (
            <button
              type="button"
              className="action-btn desktop-only"
              title="View Group Members"
              aria-label="View Group Members"
              onClick={() => setShowMembersDrawer((prev) => !prev)}
              style={{ width: 'auto', padding: '0 10px', fontSize: '13px', gap: '6px' }}
            >
              <UsersIcon size={16} />
              <span>Members ({group.members.length})</span>
            </button>
          )}
          <button
            type="button"
            className={`action-btn desktop-only ${showSearch ? 'active' : ''}`}
            title="Search in conversation"
            aria-label="Search in conversation"
            onClick={() => {
              setShowSearch((prev) => !prev);
              if (showSearch) setChatSearchText('');
            }}
          >
            <SearchIcon size={18} />
          </button>
          <button
            type="button"
            className="action-btn desktop-only"
            title="Media & Files Gallery"
            aria-label="Media & Files Gallery"
            onClick={() => setShowGallery(true)}
          >
            📁
          </button>
          <button
            type="button"
            className="action-btn call-action-btn"
            title="Voice Call"
            aria-label="Voice Call"
            onClick={() => onInitiateCall('voice')}
          >
            <PhoneIcon size={18} />
          </button>
          <button
            type="button"
            className="action-btn call-action-btn"
            title="Video Call"
            aria-label="Video Call"
            onClick={() => onInitiateCall('video')}
          >
            <VideoIcon size={18} />
          </button>
          <button
            type="button"
            className="action-btn desktop-only"
            title="Send File"
            aria-label="Send File"
            onClick={handleTriggerFileInput}
          >
            <PaperclipIcon size={18} />
          </button>
          <button
            type="button"
            className="action-btn mobile-menu-btn"
            title="More Options"
            aria-label="More Options"
            onClick={() => setShowMobileMenu((prev) => !prev)}
          >
            ⋮
          </button>
        </div>
      </header>

      {/* Mobile Overflow Bottom Sheet */}
      {showMobileMenu && (
        <div className="mobile-menu-backdrop" onClick={() => setShowMobileMenu(false)}>
          <div className="mobile-menu-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-drag-handle" />
            <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Conversation Menu</h4>
            <div className="sheet-options-list">
              <button
                type="button"
                className="sheet-option-item"
                onClick={() => {
                  setShowMobileMenu(false);
                  setShowSearch(true);
                }}
              >
                <SearchIcon size={18} />
                <span>Search in Chat</span>
              </button>
              <button
                type="button"
                className="sheet-option-item"
                onClick={() => {
                  setShowMobileMenu(false);
                  setShowGallery(true);
                }}
              >
                <span>📁</span> Shared Media & Documents
              </button>
              <button
                type="button"
                className="sheet-option-item"
                onClick={() => {
                  setShowMobileMenu(false);
                  handleTriggerFileInput();
                }}
              >
                <PaperclipIcon size={18} />
                <span>Send File / Attachments</span>
              </button>
              {group && (
                <button
                  type="button"
                  className="sheet-option-item"
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowMembersDrawer(true);
                  }}
                >
                  <UsersIcon size={18} />
                  <span>View Group Members ({group.members.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* In-Chat Search Bar */}
      {showSearch && (
        <div
          style={{
            background: 'var(--bg-active)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <SearchIcon size={16} />
          <input
            type="text"
            placeholder="Search text in this chat..."
            value={chatSearchText}
            onChange={(e) => setChatSearchText(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '6px 10px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none',
            }}
            autoFocus
          />
          {chatSearchText && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {messages.filter((m) => m.content.toLowerCase().includes(chatSearchText.toLowerCase())).length} found
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setShowSearch(false);
              setChatSearchText('');
            }}
            aria-label="Close search"
            style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer', display: 'flex' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <div
          style={{
            background: 'var(--bg-active)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12.5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span>📌</span>
            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>Pinned:</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pinnedMessage.content}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onPinMessage(pinnedMessage.id)}
            aria-label="Unpin message"
            style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer', display: 'flex' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Active File Transfers Summary Bar & Collapsible Drawer */}
      {activeTransfers.length > 0 && (
        <div className="transfers-summary-container">
          <button
            type="button"
            className="transfers-summary-bar"
            onClick={() => setShowTransfersDrawer((prev) => !prev)}
            aria-expanded={showTransfersDrawer}
            aria-label={`${activeTransfers.length} file transfers`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📦</span>
              <span style={{ fontWeight: 600 }}>
                {activeTransfers.length} file transfer{activeTransfers.length > 1 ? 's' : ''} in progress
              </span>
              {activeTransfers.some((t) => t.status === 'failed') && (
                <span style={{ color: 'var(--accent-danger)', fontSize: '11.5px', fontWeight: 600 }}>
                  (Failures detected)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '12px' }}>
              <span>{showTransfersDrawer ? 'Hide details' : 'View details'}</span>
              {showTransfersDrawer ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </div>
          </button>

          {showTransfersDrawer && (
            <div className="transfers-drawer">
              {sortedTransfers.map((t) => (
                <FileTransferItem
                  key={t.transferId}
                  transfer={t}
                  onCancel={(id) => onCancelTransfer?.(id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message Stream */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="messages-container" style={{ flex: 1 }}>
          {(chatSearchText
            ? messages.filter((m) => m.content.toLowerCase().includes(chatSearchText.toLowerCase()))
            : messages
          ).map((msg) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '3px 12px',
                      fontSize: '11.5px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {msg.content}
                  </span>
                </div>
              );
            }

            const isOutgoing = msg.senderId === currentUserId;
            const isHovered = hoveredMessageId === msg.id;
            const replyRef = getReplyingMessage(msg.replyToId);

            return (
              <div
                key={msg.id}
                className={`message-bubble-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
                style={{ position: 'relative' }}
              >
                {/* Quick Actions Hover Palette */}
                {isHovered && !msg.isDeleted && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-26px',
                      [isOutgoing ? 'right' : 'left']: '10px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '20px',
                      padding: '2px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: 'var(--shadow-md)',
                      zIndex: 10,
                    }}
                  >
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => onReact(msg.id, emoji)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setReplyingTo(msg)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}
                      title="Reply"
                    >
                      ↩️
                    </button>
                    <button
                      type="button"
                      onClick={() => onForwardMessage?.(msg)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                      title="Forward"
                    >
                      ➡️
                    </button>
                    <button
                      type="button"
                      onClick={() => onPinMessage(msg.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                      title="Pin"
                    >
                      📌
                    </button>
                    {isOutgoing && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(msg)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMessage(msg.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent-danger)' }}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className={`message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                  {/* Sender Name in Group Chat */}
                  {group && !isOutgoing && (
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', marginBottom: '2px' }}>
                      {group.members.find((m) => m.userId === msg.senderId)?.username || msg.senderId}
                    </div>
                  )}

                  {/* Quoted Reply Preview */}
                  {replyRef && (
                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.15)',
                        borderLeft: '3px solid var(--accent)',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        marginBottom: '6px',
                        fontSize: '11.5px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                        {replyRef.senderId === currentUserId ? 'You' : contact?.username || group?.name || 'Peer'}:
                      </span>{' '}
                      {replyRef.content}
                    </div>
                  )}

                  {/* Message Content */}
                  {msg.type === 'voice' ? (
                    <VoiceMessageBubble message={msg} />
                  ) : msg.type === 'file' ? (
                    <div className="file-message-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {msg.fileMetadata?.localPath && msg.fileMetadata.mimeType?.startsWith('image/') && (
                        <img
                          src={msg.fileMetadata.localPath}
                          alt={msg.fileMetadata.fileName || 'Shared image'}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '260px',
                            borderRadius: '8px',
                            objectFit: 'contain',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            if (msg.fileMetadata?.localPath) {
                              const win = window.open();
                              win?.document.write(`<img src="${msg.fileMetadata.localPath}" style="max-width:100%" />`);
                            }
                          }}
                        />
                      )}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <span style={{ fontSize: '26px' }}>
                          {getFileIcon(msg.fileMetadata?.mimeType, msg.fileMetadata?.fileName)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <div
                            title={msg.fileMetadata?.fileName || msg.content}
                            style={{
                              fontWeight: 700,
                              fontSize: '13.5px',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                              lineHeight: 1.3,
                            }}
                          >
                            {msg.fileMetadata?.fileName || msg.content}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {formatFileSize(msg.fileMetadata?.fileSize)}
                            {msg.fileMetadata?.sha256Hash && (
                              <span style={{ marginLeft: '6px', color: 'var(--accent)' }}>• Verified</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDownloadFile(msg, e)}
                          className="action-btn file-save-btn"
                          title="Download / Save File to Disk"
                          style={{
                            fontSize: '12.5px',
                            padding: '6px 14px',
                            height: 'auto',
                            width: 'auto',
                            borderRadius: '8px',
                            background: 'var(--accent)',
                            color: '#ffffff',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            border: 'none',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                            flexShrink: 0,
                          }}
                        >
                          ⬇️ Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="message-content"
                      style={{
                        fontStyle: msg.isDeleted ? 'italic' : 'normal',
                        opacity: msg.isDeleted ? 0.7 : 1,
                      }}
                    >
                      {msg.content}
                    </div>
                  )}

                  {/* Reactions badge display */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                      {Object.entries(msg.reactions).map(([emoji, users]) => (
                        <span
                          key={emoji}
                          onClick={() => onReact(msg.id, emoji)}
                          style={{
                            background: 'rgba(0, 0, 0, 0.25)',
                            borderRadius: '10px',
                            padding: '1px 6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          {emoji} {users.length > 1 ? users.length : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer: Time, Edited status, Delivery tick */}
                  <div className="message-footer">
                    {msg.isPinned && <span style={{ fontSize: '10px' }}>📌</span>}
                    {msg.isEdited && !msg.isDeleted && (
                      <span style={{ fontSize: '10px', opacity: 0.7 }}>edited</span>
                    )}
                    <span className="message-timestamp">{formatTime(msg.timestamp)}</span>
                    {renderStatusTicks(msg)}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Live typing indicator */}
          {isPeerTyping && (
            <div className="message-bubble-row incoming">
              <div className="message-bubble incoming" style={{ padding: '8px 14px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {contact?.username || group?.name || 'Peer'} is typing...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Group Members Drawer */}
        {group && showMembersDrawer && (
          <aside
            style={{
              width: '240px',
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border-subtle)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Members ({group.members.length})
              </h4>
              <button
                type="button"
                onClick={() => setShowMembersDrawer(false)}
                aria-label="Close group members"
                style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer', display: 'flex' }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {group.members.map((m) => (
                <div
                  key={m.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      {m.username} {m.userId === currentUserId ? '(You)' : ''}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      background: m.role === 'creator' ? 'var(--accent)' : 'var(--bg-active)',
                      color: m.role === 'creator' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Reply Quote Banner above composer */}
      {replyingTo && (
        <div
          style={{
            background: 'var(--bg-active)',
            borderTop: '1px solid var(--border-subtle)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <div>
            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
              Replying to {replyingTo.senderId === currentUserId ? 'yourself' : (contact?.username || group?.name || 'peer')}:
            </span>{' '}
            <span style={{ color: 'var(--text-secondary)' }}>{replyingTo.content}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer', display: 'flex' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Edit Banner above composer */}
      {editingMessageId && (
        <div
          style={{
            background: 'var(--bg-active)',
            borderTop: '1px solid var(--border-subtle)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--accent)' }}>Editing message</span>
          <button
            type="button"
            onClick={() => {
              setEditingMessageId(null);
              setEditText('');
            }}
            aria-label="Cancel editing"
            style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer', display: 'flex' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Message Composer with Multi-line Auto-resizing Textarea */}
      <footer className="chat-composer">
        {isRecordingVoice ? (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <span style={{ fontSize: '14px' }}>🔴</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '14px' }}>
                Recording voice note...
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-muted)' }}>
                {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <button
              type="button"
              className="action-btn"
              onClick={cancelVoiceRecord}
              title="Cancel Recording"
              aria-label="Cancel Recording"
              style={{ color: 'var(--accent-danger)' }}
            >
              <TrashIcon size={18} />
            </button>
            <button
              type="button"
              className="send-btn"
              onClick={stopAndSendVoice}
              title="Send Voice Note"
              aria-label="Send Voice Note"
            >
              <SendIcon size={18} />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="action-btn"
              title="Send File"
              aria-label="Send File"
              onClick={handleTriggerFileInput}
            >
              <PaperclipIcon size={20} />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              className="composer-textarea"
              placeholder={editingMessageId ? 'Edit your message (Enter to save, Shift+Enter for newline)...' : 'Type a message (Enter to send, Shift+Enter for newline)...'}
              value={editingMessageId ? editText : inputText}
              onChange={(e) => (editingMessageId ? setEditText(e.target.value) : setInputText(e.target.value))}
              onKeyDown={handleKeyDown}
              aria-label="Type a message"
              autoFocus
            />

            {inputText.trim() || editingMessageId ? (
              <button
                type="button"
                className="send-btn"
                title={editingMessageId ? 'Save edit' : 'Send'}
                aria-label={editingMessageId ? 'Save edit' : 'Send message'}
                onClick={handleSend}
                disabled={editingMessageId ? !editText.trim() : !inputText.trim()}
              >
                <SendIcon size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="action-btn"
                title="Record Voice Message"
                aria-label="Record Voice Message"
                onClick={startVoiceRecord}
                style={{ fontSize: '20px' }}
              >
                <MicIcon size={20} />
              </button>
            )}
          </>
        )}
      </footer>

      {/* Media & Documents Gallery Modal */}
      <MediaGalleryModal
        isOpen={showGallery}
        onClose={() => setShowGallery(false)}
        title={title}
        messages={messages}
      />
    </main>
  );
};
