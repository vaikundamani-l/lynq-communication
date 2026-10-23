import React, { useState } from 'react';
import { Contact, Message, Group } from '@lynq/core';

interface ConversationListProps {
  contacts: Contact[];
  groups?: Group[];
  messages: Message[];
  selectedContactId: string | null;
  selectedGroupId?: string | null;
  onSelectContact: (contact: Contact) => void;
  onSelectGroup?: (group: Group) => void;
  onOpenPairing: () => void;
  onOpenCreateGroup?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  contacts,
  groups = [],
  messages,
  selectedContactId,
  selectedGroupId,
  onSelectContact,
  onSelectGroup,
  onOpenPairing,
  onOpenCreateGroup,
}) => {
  const [search, setSearch] = useState('');

  const filteredContacts = contacts.filter(
    (c) =>
      c.username.toLowerCase().includes(search.toLowerCase()) ||
      c.ipAddress.includes(search)
  );

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const getLastMessage = (targetId: string): Message | undefined => {
    const list = messages.filter(
      (m) =>
        m.senderId === targetId ||
        m.receiverId === targetId ||
        m.conversationId === targetId
    );
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
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={onOpenCreateGroup}
            className="action-btn"
            title="Create New Group"
            style={{ fontSize: '12px', width: 'auto', padding: '0 8px', gap: '4px' }}
          >
            👥+ Group
          </button>
          <button
            onClick={onOpenPairing}
            className="action-btn"
            title="Pair New Device"
            style={{ fontSize: '12px', width: 'auto', padding: '0 8px', gap: '4px' }}
          >
            ➕ Pair
          </button>
        </div>
      </div>

      <div className="search-container">
        <div className="search-input-wrapper">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search chats, groups or messages"
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
        {/* Groups Section */}
        {filteredGroups.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                padding: '8px 16px 4px',
                textTransform: 'uppercase',
              }}
            >
              Groups ({filteredGroups.length})
            </div>
            {filteredGroups.map((group) => {
              const lastMsg = getLastMessage(group.id);
              const isSelected = selectedGroupId === group.id;

              return (
                <div
                  key={group.id}
                  className={`contact-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectGroup?.(group)}
                >
                  <div className="avatar-wrapper">
                    <div
                      className="avatar"
                      style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
                    >
                      👥
                    </div>
                  </div>

                  <div className="contact-info">
                    <div className="contact-name-row">
                      <span className="contact-name">{group.name}</span>
                      <span className="contact-time">
                        {formatTimestamp(lastMsg?.timestamp || group.updatedAt)}
                      </span>
                    </div>

                    <div className="contact-preview-row">
                      <span className="contact-preview">
                        {lastMsg ? lastMsg.content : `${group.members.length} members`}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          background: 'rgba(255,255,255,0.06)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                        }}
                      >
                        Group
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* LAN Peers & Direct Contacts */}
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            padding: '8px 16px 4px',
            textTransform: 'uppercase',
          }}
        >
          Direct Contacts ({filteredContacts.length})
        </div>

        {filteredContacts.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ marginBottom: '8px', fontSize: '14px' }}>No LAN peers found</p>
            <p style={{ fontSize: '12px' }}>
              Discovered devices on the same Wi-Fi or subnet appear here automatically.
            </p>
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
                      {lastMsg
                        ? lastMsg.content
                        : `${contact.ipAddress} • ${contact.deviceInfo?.platform || 'LAN'}`}
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
