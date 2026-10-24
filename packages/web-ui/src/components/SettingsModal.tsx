import React, { useState } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  onUpdateUsername: (newName: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  downloadPath: string;
  onUpdateDownloadPath: (path: string) => void;
  onOpenDiagnostics?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  username,
  onUpdateUsername,
  theme,
  onToggleTheme,
  downloadPath,
  onUpdateDownloadPath,
  onOpenDiagnostics,
}) => {
  const [name, setName] = useState(username);
  const [path, setPath] = useState(downloadPath);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoDownload, setAutoDownload] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    if (name.trim()) onUpdateUsername(name.trim());
    if (path.trim()) onUpdateDownloadPath(path.trim());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ width: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">Settings & Preferences</h3>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* User Profile */}
          <div className="settings-section">
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              👤 User Profile & Node Identity
            </h4>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Display Name (Visible on LAN)
            </label>
            <input
              type="text"
              className="modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice ThinkPad"
            />
          </div>

          {/* Download & Storage Configuration */}
          <div className="settings-section">
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              📁 Storage & Download Location
            </h4>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Default Download Directory
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="modal-input"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/home/user/Downloads/LYNQ"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setPath('/home/shadow-khan/Downloads/LYNQ')}
                style={{
                  background: 'var(--bg-active)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '0 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
              >
                Reset Default
              </button>
            </div>

            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Require Approval for Incoming Files</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Prevents automatic or unauthorized file downloads (Recommended)
                </div>
              </div>
              <input
                type="checkbox"
                checked={!autoDownload}
                onChange={(e) => setAutoDownload(!e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Appearance & Sound */}
          <div className="settings-section">
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              🎨 Appearance & Sound
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Theme Mode</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Currently set to {theme} theme</div>
              </div>
              <button
                type="button"
                onClick={onToggleTheme}
                style={{
                  background: 'var(--bg-active)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                Switch to {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Message & Call Chimes</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Synthesized audio tones via Web Audio API</div>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Network Diagnostics */}
          {onOpenDiagnostics && (
            <div className="settings-section">
              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                📊 Diagnostics & Topology
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>LAN Connection Diagnostics</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Inspect signaling, WebRTC states & active mesh peers</div>
                </div>
                <button
                  type="button"
                  onClick={onOpenDiagnostics}
                  style={{
                    background: 'var(--bg-active)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    color: 'var(--accent)',
                  }}
                >
                  View Details
                </button>
              </div>
            </div>
          )}

          {/* Local-First Data Disclosure (Section 8) */}
          <div
            style={{
              background: 'var(--bg-active)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '12px',
              lineHeight: 1.5,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>
              🔒 Local-First Data Storage Disclosure
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              • <strong>SQLite Database</strong>: <code>~/.gemini/antigravity-cli/lynq_storage.db</code> (WAL mode)<br />
              • <strong>Cloud Storage</strong>: None. 0 bytes transmitted externally.<br />
              • <strong>Telemetry / Analytics</strong>: Strictly disabled by design.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          {isSaved && <span style={{ color: 'var(--status-online)', fontSize: '13px', alignSelf: 'center' }}>✓ Settings saved!</span>}
          <button
            type="button"
            className="modal-btn secondary"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="modal-btn primary"
            onClick={handleSave}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
