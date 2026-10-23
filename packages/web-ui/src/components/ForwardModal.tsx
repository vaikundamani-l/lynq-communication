import React from 'react';
import { Contact, Group, Message } from '@lynq/core';

interface ForwardModalProps {
  message: Message | null;
  contacts: Contact[];
  groups: Group[];
  currentUserId: string;
  onForward: (targetId: string, isGroup: boolean, content: string) => void;
  onClose: () => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  message,
  contacts,
  groups,
  currentUserId,
  onForward,
  onClose,
}) => {
  if (!message) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ width: '420px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">Forward Message</h3>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Message Preview */}
        <div
          style={{
            background: 'var(--bg-active)',
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13px',
            borderLeft: '3px solid var(--accent)',
            maxHeight: '80px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px', fontSize: '11px' }}>
            Forwarding:
          </div>
          <div>{message.content}</div>
        </div>

        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Select recipient:
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Groups */}
          {groups.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Groups
              </div>
              {groups.map((g) => (
                <div
                  key={g.id}
                  onClick={() => {
                    onForward(g.id, true, message.content);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: 'var(--bg-card)',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
                >
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '15px',
                    }}
                  >
                    👥
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{g.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {g.members.length} members
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contacts */}
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Direct Contacts
            </div>
            {contacts.map((c) => (
              <div
                key={c.uid}
                onClick={() => {
                  onForward(c.uid, false, message.content);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: 'var(--bg-card)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
              >
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}
                >
                  {(c.username ? c.username[0] : 'U').toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{c.username}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {c.ipAddress} • {c.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
