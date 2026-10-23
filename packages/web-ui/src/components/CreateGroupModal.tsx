import React, { useState } from 'react';
import { Contact } from '@lynq/core';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  onCreateGroup: (name: string, description: string, selectedMemberIds: string[]) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  contacts,
  onCreateGroup,
}) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const toggleMember = (uid: string) => {
    setSelectedIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (groupName.trim()) {
      onCreateGroup(groupName.trim(), description.trim(), selectedIds);
      setGroupName('');
      setDescription('');
      setSelectedIds([]);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create Private Group</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'gray', fontSize: '20px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              GROUP NAME *
            </label>
            <input
              type="text"
              className="composer-input"
              placeholder="e.g. Engineering Squad"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              DESCRIPTION (OPTIONAL)
            </label>
            <input
              type="text"
              className="composer-input"
              placeholder="e.g. Local network project updates"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              SELECT INITIAL MEMBERS ({selectedIds.length})
            </label>
            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                background: 'var(--bg-input)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {contacts.length === 0 ? (
                <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No discovered contacts yet.
                </div>
              ) : (
                contacts.map((contact) => (
                  <div
                    key={contact.uid}
                    onClick={() => toggleMember(contact.uid)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: selectedIds.includes(contact.uid) ? 'var(--bg-active)' : 'transparent',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{contact.username}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{contact.ipAddress}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(contact.uid)}
                      onChange={() => toggleMember(contact.uid)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="action-btn"
              style={{ width: 'auto', padding: '0 16px', borderRadius: '8px', border: '1px solid var(--border-strong)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="send-btn"
              style={{ width: 'auto', padding: '0 20px', borderRadius: '8px', fontWeight: 600, fontSize: '14px' }}
              disabled={!groupName.trim()}
            >
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
