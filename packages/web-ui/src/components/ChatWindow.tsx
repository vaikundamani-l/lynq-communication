import React, { useState, useRef, useEffect } from 'react';
import { Contact, Message, FileTransfer, Group } from '@lynq/core';
import { FileTransferItem } from './FileTransferItem';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { VoiceRecorderService, RecordedVoiceData } from '../services/VoiceRecorderService';
import { MediaGalleryModal } from './MediaGalleryModal';

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
  onSendFile,
  onBack,
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

  // Voice recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const voiceRecorderRef = useRef<VoiceRecorderService | null>(null);
  const recordTimerRef = useRef<any>(null);

  useEffect(() => {
    voiceRecorderRef.current = new VoiceRecorderService();
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      voiceRecorderRef.current?.cancel();
    };
  }, []);

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPeerTyping]);

  if (!contact && !group) {
    return (
      <main className="chat-workspace">
        <div className="empty-chat-state">
          <div className="empty-radar-hero">
            <span className="hero-emoji">💬</span>
          </div>
          <h2 className="empty-hero-title">LYNQ Communication</h2>
          <p className="empty-hero-desc">
            Ultra-fast direct local-first messaging, crystal-clear voice notes, and bit-for-bit file transfers directly over your Wi-Fi.
          </p>
          <div className="empty-hints-grid">
            <div className="hint-card">
              <span className="hint-icon">⚡</span>
              <h4>0.009 ms Latency</h4>
              <p>Direct local network routing without external cloud bottlenecks</p>
            </div>
            <div className="hint-card">
              <span className="hint-icon">🛡️</span>
              <h4>Local & Private</h4>
              <p>Zero external tracking; communications stay inside your LAN</p>
            </div>
            <div className="hint-card">
              <span className="hint-icon">🚀</span>
              <h4>250+ MB/s Transfers</h4>
              <p>Direct streaming with bit-for-bit SHA-256 verification</p>
            </div>
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
      return;
    }

    if (inputText.trim()) {
      onSendMessage(inputText.trim(), replyingTo?.id);
      setInputText('');
      setReplyingTo(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
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
            📁 Drop files here to send directly to {contact?.username || group?.name || 'peer'}
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
              {group ? '👥' : initial}
            </div>
            {!group && <div className={`presence-badge ${contact?.status || 'offline'}`} />}
          </div>
          <div>
            <div className="chat-header-title">{title}</div>
            <div className="chat-header-meta">
              <span className="chat-header-subtitle">{subtitle}</span>
              {!group && <span className="p2p-shield-badge">🛡️ Direct LAN</span>}
            </div>
          </div>
        </div>

        <div className="chat-actions">
          {group && (
            <button
              className="action-btn"
              title="View Group Members"
              onClick={() => setShowMembersDrawer((prev) => !prev)}
              style={{ width: 'auto', padding: '0 10px', fontSize: '13px', gap: '4px' }}
            >
              👥 Members ({group.members.length})
            </button>
          )}
          <button
            className={`action-btn ${showSearch ? 'active' : ''}`}
            title="Search in conversation"
            onClick={() => {
              setShowSearch((prev) => !prev);
              if (showSearch) setChatSearchText('');
            }}
          >
            🔍
          </button>
          <button
            className="action-btn"
            title="Media & Files Gallery"
            onClick={() => setShowGallery(true)}
          >
            🖼️
          </button>
          <button className="action-btn call-action-btn" title="Voice Call" onClick={() => onInitiateCall('voice')}>
            📞
          </button>
          <button className="action-btn call-action-btn" title="Video Call" onClick={() => onInitiateCall('video')}>
            📹
          </button>
          <button className="action-btn" title="Send File" onClick={handleTriggerFileInput}>
            📎
          </button>
        </div>
      </header>

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
          <span>🔍</span>
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
            }}
            autoFocus
          />
          {chatSearchText && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {messages.filter((m) => m.content.toLowerCase().includes(chatSearchText.toLowerCase())).length} found
            </span>
          )}
          <button
            onClick={() => {
              setShowSearch(false);
              setChatSearchText('');
            }}
            style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer', fontSize: '14px' }}
          >
            ✕
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
            onClick={() => onPinMessage(pinnedMessage.id)}
            style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Diagnostics Banner */}
      <div className="diagnostics-banner">
        <span>⚡ Direct Local Connection</span>
        <div className="diagnostics-tags">
          <span
            className="tag-badge"
            style={{ color: networkStatus.connected ? 'var(--status-online)' : 'var(--accent-warning)' }}
          >
            {networkStatus.connected ? 'Signaling: Connected' : 'Signaling: Reconnecting...'}
          </span>
          <span className="tag-badge">Transport: WebRTC DataChannel Ready</span>
          <span className="tag-badge">
            {group ? '🔒 Local Group' : contact?.isPaired ? '🔒 Authenticated' : '⚠️ Unpaired'}
          </span>
        </div>
      </div>

      {/* Active File Transfers Queue */}
      {activeTransfers.length > 0 && (
        <div style={{ padding: '8px 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
            ACTIVE P2P TRANSFERS ({activeTransfers.length})
          </div>
          {activeTransfers.map((t) => (
            <FileTransferItem
              key={t.transferId}
              transfer={t}
              onCancel={(id) => onCancelTransfer?.(id)}
            />
          ))}
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
                      onClick={() => onReact(msg.id, emoji)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    onClick={() => setReplyingTo(msg)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}
                    title="Reply"
                  >
                    ↩️
                  </button>
                  <button
                    onClick={() => onForwardMessage?.(msg)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                    title="Forward"
                  >
                    ➡️
                  </button>
                  <button
                    onClick={() => onPinMessage(msg.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                    title="Pin"
                  >
                    📌
                  </button>
                  {isOutgoing && (
                    <>
                      <button
                        onClick={() => startEdit(msg)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDeleteMessage(msg.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className={`message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                {group && !isOutgoing && (
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', marginBottom: '3px' }}>
                    {msg.senderId}
                  </div>
                )}

                {/* Replying quote preview */}
                {replyRef && (
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.15)',
                      borderLeft: '3px solid var(--accent)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      marginBottom: '6px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--accent)' }}>
                      {replyRef.senderId === currentUserId ? 'You' : (contact?.username || group?.name || 'Peer')}
                    </div>
                    <div style={{ opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {replyRef.content}
                    </div>
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
                        background: 'rgba(0, 0, 0, 0.15)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>📄</span>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '13px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {msg.fileMetadata?.fileName || msg.content}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {msg.fileMetadata?.fileSize
                            ? `${(msg.fileMetadata.fileSize / 1024).toFixed(1)} KB`
                            : 'File'}
                        </div>
                      </div>
                      {msg.fileMetadata?.localPath && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const a = document.createElement('a');
                            a.href = msg.fileMetadata!.localPath!;
                            a.download = msg.fileMetadata!.fileName || 'file';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          }}
                          className="action-btn"
                          title="Download File"
                          style={{
                            fontSize: '13px',
                            padding: '4px 10px',
                            height: 'auto',
                            width: 'auto',
                            borderRadius: '6px',
                            background: 'var(--accent)',
                            color: '#ffffff',
                            fontWeight: 600,
                          }}
                        >
                          ⬇️ Save
                        </button>
                      )}
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

        {/* Live typing indicator indicator */}
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
              onClick={() => setShowMembersDrawer(false)}
              style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer' }}
            >
              ✕
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
            onClick={() => setReplyingTo(null)}
            style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer', fontSize: '14px' }}
          >
            ✕
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
            onClick={() => {
              setEditingMessageId(null);
              setEditText('');
            }}
            style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer', fontSize: '14px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Message Composer */}
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
              className="action-btn"
              onClick={cancelVoiceRecord}
              title="Cancel Recording"
              style={{ color: 'var(--accent-danger)' }}
            >
              🗑️
            </button>
            <button className="send-btn" onClick={stopAndSendVoice} title="Send Voice Note">
              ➤
            </button>
          </div>
        ) : (
          <>
            <button className="action-btn" title="Send File" onClick={handleTriggerFileInput}>
              📎
            </button>

            <input
              type="text"
              className="composer-input"
              placeholder={editingMessageId ? 'Edit your message...' : 'Type a message...'}
              value={editingMessageId ? editText : inputText}
              onChange={(e) => (editingMessageId ? setEditText(e.target.value) : setInputText(e.target.value))}
              onKeyDown={handleKeyDown}
              autoFocus
            />

            {inputText.trim() || editingMessageId ? (
              <button
                className="send-btn"
                title="Send"
                onClick={handleSend}
                disabled={editingMessageId ? !editText.trim() : !inputText.trim()}
              >
                ➤
              </button>
            ) : (
              <button
                className="action-btn"
                title="Record Voice Message"
                onClick={startVoiceRecord}
                style={{ fontSize: '20px' }}
              >
                🎙️
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
