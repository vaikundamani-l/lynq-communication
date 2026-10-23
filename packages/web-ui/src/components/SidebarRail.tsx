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
      <div className="avatar-wrapper" title={`Signed in as ${username}`}>
        <div className="avatar">{initial}</div>
        <div className="presence-badge online" />
      </div>

      <button
        className={`rail-btn ${activeTab === 'chats' ? 'active' : ''}`}
        onClick={() => onTabChange('chats')}
        title="Chats"
      >
        💬
      </button>

      <button
        className={`rail-btn ${activeTab === 'contacts' ? 'active' : ''}`}
        onClick={() => onTabChange('contacts')}
        title="Contacts & Discovered Peers"
      >
        👥
      </button>

      <button
        className={`rail-btn ${activeTab === 'pairing' ? 'active' : ''}`}
        onClick={() => onTabChange('pairing')}
        title="Device Pairing"
      >
        🔗
      </button>

      <button
        className={`rail-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
        onClick={() => onTabChange('diagnostics')}
        title="Network Diagnostics"
      >
        📊
      </button>

      <div className="rail-spacer" />

      <button
        className="rail-btn"
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <button
        className={`rail-btn ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
        title="Settings"
      >
        ⚙️
      </button>
    </aside>
  );
};
