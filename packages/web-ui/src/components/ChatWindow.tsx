import React, { useState, useRef, useEffect } from 'react';
import { Contact, Message } from '@lynq/core';

interface ChatWindowProps {
  contact: Contact | null;
  currentUserId: string;
  messages: Message[];
  isPeerTyping: boolean;
  onSendMessage: (content: string, replyToId?: string) => void;
  onSendTyping: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onPinMessage: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onInitiateCall: (type: 'voice' | 'video') => void;
  onSendFile: () => void;
  networkStatus: { connected: boolean; url: string };
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export const ChatWindow: React.FC<ChatWindowProps> = ({
  contact,
  currentUserId,
  messages,
  isPeerTyping,
  onSendMessage,
  onSendTyping,
  onReact,
  onEditMessage,
  onDeleteMessage,
  onPinMessage,
  onRetryMessage,
  onInitiateCall,
  onSendFile,
  networkStatus,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPeerTyping]);

  if (!contact) {
    return (
      <main className="chat-workspace">
        <div className="empty-chat-state">
          <div className="empty-icon">💬</div>
          <h2>Welcome to LYNQ Communication</h2>
          <p>Select a contact or LAN peer from the sidebar to start ultra-fast local messaging.</p>
        </div>
      </main>
    );
  }

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

  const initial = (contact.username ? contact.username[0] : '?').toUpperCase();
  const pinnedMessage = messages.find((m) => m.isPinned);

  return (
    <main className="chat-workspace">
      {/* Top Header */}
      <header className="chat-header">
        <div className="chat-header-user">
          <div className="avatar-wrapper" style={{ width: '40px', height: '40px', minWidth: '40px' }}>
            <div className="avatar" style={{ fontSize: '15px' }}>{initial}</div>
            <div className={`presence-badge ${contact.status || 'offline'}`} />
          </div>
          <div>
            <div className="chat-header-title">{contact.username}</div>
            <div className="chat-header-subtitle">
              {isPeerTyping ? (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>typing...</span>
              ) : contact.status === 'online' ? (
                'Online on LAN'
              ) : (
                'Offline'
              )}{' '}
              • {contact.ipAddress}
            </div>
          </div>
        </div>

        <div className="chat-actions">
          <button className="action-btn" title="Voice Call" onClick={() => onInitiateCall('voice')}>
            📞
          </button>
          <button className="action-btn" title="Video Call" onClick={() => onInitiateCall('video')}>
            📹
          </button>
          <button className="action-btn" title="Send File" onClick={onSendFile}>
            📎
          </button>
        </div>
      </header>

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
          <span className="tag-badge">{contact.isPaired ? '🔒 Authenticated' : '⚠️ Unpaired'}</span>
        </div>
      </div>

      {/* Message Stream */}
      <div className="messages-container">
        {messages.map((msg) => {
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
                      {replyRef.senderId === currentUserId ? 'You' : contact.username}
                    </div>
                    <div style={{ opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {replyRef.content}
                    </div>
                  </div>
                )}

                {/* Message Content */}
                <div
                  className="message-content"
                  style={{
                    fontStyle: msg.isDeleted ? 'italic' : 'normal',
                    opacity: msg.isDeleted ? 0.7 : 1,
                  }}
                >
                  {msg.content}
                </div>

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
                {contact.username} is typing...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
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
              Replying to {replyingTo.senderId === currentUserId ? 'yourself' : contact.username}:
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
        <button className="action-btn" title="Send File" onClick={onSendFile}>
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

        <button
          className="send-btn"
          title="Send"
          onClick={handleSend}
          disabled={editingMessageId ? !editText.trim() : !inputText.trim()}
        >
          ➤
        </button>
      </footer>
    </main>
  );
};
