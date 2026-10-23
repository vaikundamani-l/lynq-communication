import React, { useState, useRef, useEffect } from 'react';
import { Contact, Message } from '@lynq/core';

interface ChatWindowProps {
  contact: Contact | null;
  currentUserId: string;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onInitiateCall: (type: 'voice' | 'video') => void;
  onSendFile: () => void;
  networkStatus: { connected: boolean; url: string };
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  contact,
  currentUserId,
  messages,
  onSendMessage,
  onInitiateCall,
  onSendFile,
  networkStatus,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderStatusTicks = (msg: Message) => {
    if (msg.senderId !== currentUserId) return null;

    switch (msg.status) {
      case 'pending':
        return <span className="message-ticks" title="Pending">⏱️</span>;
      case 'sent':
        return <span className="message-ticks" title="Sent">✓</span>;
      case 'delivered':
        return <span className="message-ticks" title="Delivered">✓✓</span>;
      case 'read':
        return <span className="message-ticks read" title="Read">✓✓</span>;
      default:
        return null;
    }
  };

  const initial = (contact.username ? contact.username[0] : '?').toUpperCase();

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
              {contact.status === 'online' ? 'Online on LAN' : 'Offline'} • {contact.ipAddress}
            </div>
          </div>
        </div>

        <div className="chat-actions">
          <button
            className="action-btn"
            title="Voice Call"
            onClick={() => onInitiateCall('voice')}
          >
            📞
          </button>
          <button
            className="action-btn"
            title="Video Call"
            onClick={() => onInitiateCall('video')}
          >
            📹
          </button>
          <button
            className="action-btn"
            title="Attach & Send File"
            onClick={onSendFile}
          >
            📎
          </button>
        </div>
      </header>

      {/* Diagnostics Banner */}
      <div className="diagnostics-banner">
        <span>⚡ Direct LAN Channel</span>
        <div className="diagnostics-tags">
          <span className="tag-badge">Signaling: {networkStatus.connected ? 'Active (WS)' : 'Reconnecting...'}</span>
          <span className="tag-badge">Peer: {contact.ipAddress}:{contact.port}</span>
          <span className="tag-badge">{contact.isPaired ? '🔒 Authenticated' : '⚠️ Unpaired'}</span>
        </div>
      </div>

      {/* Message Stream */}
      <div className="messages-container">
        {messages.map((msg) => {
          const isOutgoing = msg.senderId === currentUserId;

          return (
            <div
              key={msg.id}
              className={`message-bubble-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
            >
              <div className={`message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                <div className="message-content">{msg.content}</div>
                <div className="message-footer">
                  <span className="message-timestamp">{formatTime(msg.timestamp)}</span>
                  {renderStatusTicks(msg)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Composer */}
      <footer className="chat-composer">
        <button
          className="action-btn"
          title="Send File"
          onClick={onSendFile}
        >
          📎
        </button>

        <input
          type="text"
          className="composer-input"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />

        <button
          className="send-btn"
          title="Send Message"
          onClick={handleSend}
          disabled={!inputText.trim()}
        >
          ➤
        </button>
      </footer>
    </main>
  );
};
