import React from 'react';

export type NavTab = 'chats' | 'contacts' | 'pairing' | 'diagnostics' | 'settings';

interface SidebarRailProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  username: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const SidebarRail: React.FC<SidebarRailProps> = ({
  activeTab,
  onTabChange,
  username,
  theme,
  onToggleTheme,
}) => {
  const initial = (username ? username[0] : 'L').toUpperCase();

  return (
    <aside className="icon-rail">
      {/* Brand Logo with Glowing Pulse */}
      <div className="rail-brand" title="LYNQ Communication • LAN Direct">
        <div className="brand-icon-wrapper">
          <span className="brand-icon">⚡</span>
        </div>
      </div>

      {/* User Identity Avatar */}
      <div className="avatar-wrapper rail-user-avatar" title={`Signed in as ${username}`}>
        <div className="avatar">{initial}</div>
        <div className="presence-badge online" />
      </div>

      <div className="rail-divider" />

      {/* Navigation Buttons */}
      <button
        className={`rail-btn ${activeTab === 'chats' ? 'active' : ''}`}
        onClick={() => onTabChange('chats')}
        title="Active Chats"
      >
        <span className="rail-btn-icon">💬</span>
        <span className="rail-btn-label">Chats</span>
        <span className="rail-tooltip">Chats</span>
      </button>

      <button
        className={`rail-btn ${activeTab === 'contacts' ? 'active' : ''}`}
        onClick={() => onTabChange('contacts')}
        title="Discovered LAN Peers"
      >
        <span className="rail-btn-icon">👥</span>
        <span className="rail-btn-label">Peers</span>
        <span className="rail-tooltip">Peers</span>
      </button>

      <button
        className={`rail-btn ${activeTab === 'pairing' ? 'active' : ''}`}
        onClick={() => onTabChange('pairing')}
        title="QR Device Pairing"
      >
        <span className="rail-btn-icon">🔗</span>
        <span className="rail-btn-label">Pair</span>
        <span className="rail-tooltip">Pair Device</span>
      </button>

      <button
        className={`rail-btn diagnostics-tab-btn desktop-only ${activeTab === 'diagnostics' ? 'active' : ''}`}
        onClick={() => onTabChange('diagnostics')}
        title="LAN Network Diagnostics"
      >
        <span className="rail-btn-icon">📊</span>
        <span className="rail-btn-label">Network</span>
        <span className="rail-tooltip">Diagnostics</span>
      </button>

      <div className="rail-spacer" />

      {/* Theme Toggle */}
      <button
        className="rail-btn theme-toggle-btn desktop-only"
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
      >
        <span className="rail-btn-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
        <span className="rail-btn-label">{theme === 'dark' ? 'Theme' : 'Theme'}</span>
        <span className="rail-tooltip">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
      </button>

      {/* Settings */}
      <button
        className={`rail-btn ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
        title="Settings & Storage"
      >
        <span className="rail-btn-icon">⚙️</span>
        <span className="rail-btn-label">Settings</span>
        <span className="rail-tooltip">Settings</span>
      </button>
    </aside>
  );
};
