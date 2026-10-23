import React, { useState } from 'react';
import { Contact, Message } from '@lynq/core';

interface ConversationListProps {
  contacts: Contact[];
  messages: Message[];
  selectedContactId: string | null;
  onSelectContact: (contact: Contact) => void;
  onOpenPairing: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  contacts,
  messages,
  selectedContactId,
  onSelectContact,
  onOpenPairing,
}) => {
  const [search, setSearch] = useState('');

  const filteredContacts = contacts.filter((c) =>
    c.username.toLowerCase().includes(search.toLowerCase()) ||
    c.ipAddress.includes(search)
  );

  const getLastMessage = (uid: string): Message | undefined => {
    const list = messages.filter((m) => m.senderId === uid || m.receiverId === uid);
    return list[list.length - 1];
  };

  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <section className="nav-panel">
      <div className="nav-header">
        <h2 className="nav-title">Messages</h2>
        <button
          onClick={onOpenPairing}
          className="action-btn"
          title="Pair New Device"
          style={{ fontSize: '15px', width: 'auto', padding: '0 8px', gap: '4px' }}
        >
          ➕ Pair
        </button>
      </div>

      <div className="search-container">
        <div className="search-input-wrapper">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search conversations or LAN peers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', color: 'gray', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="items-list">
        {filteredContacts.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ marginBottom: '8px', fontSize: '14px' }}>No LAN peers found</p>
            <p style={{ fontSize: '12px' }}>Discovered devices on the same Wi-Fi or subnet appear here automatically.</p>
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const lastMsg = getLastMessage(contact.uid);
            const isSelected = selectedContactId === contact.uid;
            const initial = (contact.username ? contact.username[0] : '?').toUpperCase();

            return (
              <div
                key={contact.uid}
                className={`contact-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectContact(contact)}
              >
                <div className="avatar-wrapper">
                  <div className="avatar">{initial}</div>
                  <div className={`presence-badge ${contact.status || 'offline'}`} />
                </div>

                <div className="contact-info">
                  <div className="contact-name-row">
                    <span className="contact-name">{contact.username}</span>
                    <span className="contact-time">
                      {formatTimestamp(lastMsg?.timestamp || contact.lastSeen)}
                    </span>
                  </div>

                  <div className="contact-preview-row">
                    <span className="contact-preview">
                      {lastMsg ? lastMsg.content : `${contact.ipAddress} • ${contact.deviceInfo?.platform || 'LAN'}`}
                    </span>
                    {contact.isPaired && (
                      <span title="Paired device" style={{ fontSize: '11px', color: 'var(--accent)' }}>
                        🔒
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
