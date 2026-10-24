import React, { useState, useEffect } from 'react';
import { CloseIcon, SettingsIcon, ActivityIcon, SunIcon, MoonIcon } from './Icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  onUpdateUsername: (newName: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  downloadPath: string;
  onUpdateDownloadPath: (path: string) => void;
  requireApproval?: boolean;
  soundChimes?: boolean;
  onUpdatePreferences?: (prefs: { requireApproval: boolean; soundChimes: boolean }) => void;
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
  requireApproval = true,
  soundChimes = true,
  onUpdatePreferences,
  onOpenDiagnostics,
}) => {
  const [name, setName] = useState(username);
  const [path, setPath] = useState(downloadPath);
  const [requireApprovalState, setRequireApprovalState] = useState(requireApproval);
  const [soundChimesState, setSoundChimesState] = useState(soundChimes);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(username);
      setPath(downloadPath);
      setRequireApprovalState(requireApproval);
      setSoundChimesState(soundChimes);
    }
  }, [isOpen, username, downloadPath, requireApproval, soundChimes]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (name.trim()) onUpdateUsername(name.trim());
    if (path.trim()) onUpdateDownloadPath(path.trim());
    onUpdatePreferences?.({
      requireApproval: requireApprovalState,
      soundChimes: soundChimesState,
    });
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SettingsIcon size={20} style={{ color: 'var(--accent)' }} />
            <h3 id="settings-dialog-title" className="modal-title">
              Settings & Preferences
            </h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close settings dialog">
            <CloseIcon size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* User Profile */}
          <div className="settings-section">
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              User Profile & Node Identity
            </h4>
            <label
              htmlFor="settings-username"
              style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}
            >
              Display Name (Visible to peers on LAN)
            </label>
            <input
              id="settings-username"
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
              Storage & Download Location
            </h4>
            <label
              htmlFor="settings-download-path"
              style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}
            >
              Default Download Directory
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="settings-download-path"
                type="text"
                className="modal-input"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="Downloads/LYNQ"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => {
                  const isWin =
                    typeof navigator !== 'undefined' &&
                    /win/i.test(navigator.userAgent || (navigator as any).platform || '');
                  setPath(isWin ? 'C:\\Users\\Public\\Downloads\\LYNQ' : '~/Downloads/LYNQ');
                }}
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

            <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label
                  htmlFor="settings-require-approval"
                  style={{ fontSize: '13px', fontWeight: 600, display: 'block', cursor: 'pointer' }}
                >
                  Require Approval for Incoming Files
                </label>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Prevents automatic or unauthorized file downloads (Recommended)
                </div>
              </div>
              <input
                id="settings-require-approval"
                type="checkbox"
                checked={requireApprovalState}
                onChange={(e) => setRequireApprovalState(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Appearance & Sound */}
          <div className="settings-section">
            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Appearance & Sound
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
                Switch to {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label
                  htmlFor="settings-sound-chimes"
                  style={{ fontSize: '13px', fontWeight: 600, display: 'block', cursor: 'pointer' }}
                >
                  Message & Call Chimes
                </label>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Synthesized audio tones via Web Audio API
                </div>
              </div>
              <input
                id="settings-sound-chimes"
                type="checkbox"
                checked={soundChimesState}
                onChange={(e) => setSoundChimesState(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Network Diagnostics */}
          {onOpenDiagnostics && (
            <div className="settings-section">
              <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Diagnostics & Topology
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>LAN Connection Diagnostics</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Inspect signaling, WebRTC states & active mesh peers
                  </div>
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <ActivityIcon size={16} />
                  View Details
                </button>
              </div>
            </div>
          )}

          {/* Local-First Data Disclosure */}
          <div
            style={{
              background: 'var(--bg-active)',
              padding: '14px',
              borderRadius: '10px',
              fontSize: '12px',
              lineHeight: 1.6,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: '6px' }}>
              🔒 Local-First Data Storage Disclosure
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              • <strong>Local SQLite Storage</strong>: Messages and contacts are encrypted and stored locally on this device.<br />
              • <strong>External Servers</strong>: Zero cloud relay or intermediary servers. 0 bytes transmitted externally.<br />
              • <strong>Telemetry / Analytics</strong>: Strictly disabled by design. All local mesh activity stays on your Wi-Fi.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          {isSaved && (
            <span style={{ color: 'var(--status-online)', fontSize: '13px', alignSelf: 'center', fontWeight: 600 }}>
              ✓ Settings saved!
            </span>
          )}
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="modal-btn primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
