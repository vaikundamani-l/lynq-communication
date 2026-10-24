import React, { useState } from 'react';
import { Contact, Message, Group } from '@lynq/core';
import { SearchIcon, CloseIcon, UsersIcon, PlusIcon, LinkIcon } from './Icons';

interface ConversationListProps {
  activeTab?: 'chats' | 'contacts' | 'pairing' | 'diagnostics' | 'settings';
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

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Emerald
  'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)', // Cyan / Sky
  'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)', // Violet
  'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', // Rose
  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Amber
  'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', // Blue
];

const getAvatarGradient = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
};

const getPlatformIcon = (platform?: string): string => {
  if (!platform) return '💻';
  const p = platform.toLowerCase();
  if (p.includes('android')) return '📱';
  if (p.includes('ios') || p.includes('iphone') || p.includes('ipad')) return '📱';
  if (p.includes('darwin') || p.includes('macos') || p.includes('mac')) return '🍏';
  if (p.includes('win')) return '🪟';
  if (p.includes('linux')) return '🐧';
  return '💻';
};

export const ConversationList: React.FC<ConversationListProps> = ({
  activeTab = 'chats',
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
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getUnreadCount = (targetId: string): number => {
    return messages.filter(
      (m) => m.senderId === targetId && m.status !== 'read'
    ).length;
  };

  const isContactsTab = activeTab === 'contacts';
  const onlineContacts = filteredContacts.filter((c) => c.status === 'online');

  return (
    <section className="nav-panel" aria-label={isContactsTab ? 'Discovered Peers' : 'Conversations'}>
      {/* Top Header */}
      <div className="nav-header">
        <div className="nav-header-left">
          <h2 className="nav-title">{isContactsTab ? 'Discovered Peers' : 'Conversations'}</h2>
          <div className="lan-pulse-badge" title="Live LAN mesh networking is active">
            <span className="lan-pulse-dot" />
            <span className="lan-pulse-text">{onlineContacts.length} ONLINE</span>
          </div>
        </div>

        <div className="nav-actions">
          {!isContactsTab && onOpenCreateGroup && (
            <button
              onClick={onOpenCreateGroup}
              className="action-pill-btn"
              title="Create Private Group"
              aria-label="Create Private Group"
            >
              <PlusIcon size={15} />
              <span className="pill-btn-label">Group</span>
            </button>
          )}
        </div>
      </div>

      {/* Modern Frosted Search Bar */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <span className="search-icon">
            <SearchIcon size={16} />
          </span>
          <input
            type="text"
            placeholder={isContactsTab ? 'Search peers by name or IP...' : 'Search chats, peers or IP...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search conversations and peers"
          />
          {search ? (
            <button
              onClick={() => setSearch('')}
              className="search-clear-btn"
              title="Clear search"
              aria-label="Clear search input"
            >
              <CloseIcon size={14} />
            </button>
          ) : (
            <span className="search-kbd-chip">/</span>
          )}
        </div>
      </div>

      <div className="items-list" role="list">
        {/* Groups Section (shown only in Chats tab) */}
        {!isContactsTab && filteredGroups.length > 0 && (
          <div className="section-group">
            <div className="section-header">
              <span>Groups</span>
              <span className="section-count">{filteredGroups.length}</span>
            </div>
            {filteredGroups.map((group) => {
              const lastMsg = getLastMessage(group.id);
              const isSelected = selectedGroupId === group.id;

              return (
                <button
                  type="button"
                  key={group.id}
                  className={`contact-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectGroup?.(group)}
                  aria-selected={isSelected}
                  role="listitem"
                >
                  <div className="avatar-wrapper">
                    <div
                      className="avatar group-avatar"
                      style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}
                    >
                      <UsersIcon size={18} />
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
                      <span className="chip-tag group-tag">Group</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* LAN Peers & Direct Contacts */}
        <div className="section-header">
          <span>{isContactsTab ? 'Active LAN Peers & Nearby Devices' : 'Direct Messages'}</span>
          <span className="section-count">{filteredContacts.length}</span>
        </div>

        {filteredContacts.length === 0 ? (
          <div className="empty-peers-container">
            <div className="radar-scanner">
              <div className="radar-circle circle-1" />
              <div className="radar-circle circle-2" />
              <div className="radar-circle circle-3" />
              <div className="radar-sweep" />
              <div className="radar-center">📡</div>
            </div>
            <h4 className="radar-title">Searching Wi-Fi for LYNQ Devices</h4>
            <p className="radar-subtitle">
              Open <strong>LYNQ</strong> on your phone or laptop on the same Wi-Fi network to connect and chat automatically.
            </p>
            <button onClick={onOpenPairing} className="radar-cta-btn" aria-label="Show QR Pairing Code">
              <LinkIcon size={16} /> Show QR Pairing Code
            </button>
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const lastMsg = getLastMessage(contact.uid);
            const isSelected = selectedContactId === contact.uid;
            const initial = (contact.username ? contact.username[0] : '?').toUpperCase();
            const avatarBg = getAvatarGradient(contact.username || contact.uid);
            const platformIcon = getPlatformIcon(contact.deviceInfo?.platform);
            const unreadCount = getUnreadCount(contact.uid);
            const isOnline = contact.status === 'online';

            return (
              <button
                type="button"
                key={contact.uid}
                className={`contact-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectContact(contact)}
                aria-selected={isSelected}
                role="listitem"
              >
                <div className="avatar-wrapper">
                  <div className="avatar" style={{ background: avatarBg }}>
                    {initial}
                  </div>
                  <div className={`presence-badge ${isOnline ? 'online' : 'offline'}`} />
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
                      {lastMsg ? (
                        <>
                          {lastMsg.senderId !== contact.uid && (
                            <span className="msg-preview-tick">
                              {lastMsg.status === 'read' ? '✓✓ ' : '✓ '}
                            </span>
                          )}
                          {lastMsg.type === 'voice'
                            ? '🎙️ Voice note'
                            : lastMsg.type === 'file'
                            ? `📄 ${lastMsg.content}`
                            : lastMsg.content}
                        </>
                      ) : (
                        <span className="contact-subdetail">
                          {platformIcon} {contact.ipAddress}
                        </span>
                      )}
                    </span>

                    <div className="contact-badges-row">
                      {unreadCount > 0 && (
                        <span className="unread-counter-pill">{unreadCount}</span>
                      )}
                      <span className="chip-tag p2p-tag" title="Direct Peer-to-Peer">
                        P2P
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
};
