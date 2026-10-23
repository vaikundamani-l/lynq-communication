import React, { useState } from 'react';

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  myToken: string;
  onPairWithToken: (token: string) => void;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  myToken,
  onPairWithToken,
}) => {
  const [inputToken, setInputToken] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(myToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputToken.trim()) {
      onPairWithToken(inputToken.trim().toUpperCase());
      setInputToken('');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Device Pairing</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'gray', fontSize: '20px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Pair with compatible devices on your local network to verify peer identity and allow secure direct file transfers.
        </p>

        {/* Local Invitation Token Box */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
            YOUR PAIRING CODE:
          </label>
          <div className="token-display-box">
            <div className="token-digits">{myToken || 'LYNQ01'}</div>
            <button
              onClick={handleCopy}
              className="action-btn"
              style={{ margin: '8px auto 0', width: 'auto', padding: '4px 12px', fontSize: '12px' }}
            >
              {copied ? '✓ Copied' : '📋 Copy Code'}
            </button>
          </div>
        </div>

        {/* Enter Remote Token Form */}
        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
            CONNECT TO A PEER CODE:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. 7X9K2P"
              maxLength={6}
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value.toUpperCase())}
              style={{
                flex: 1,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-strong)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontFamily: 'monospace',
                fontSize: '18px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              className="send-btn"
              style={{ borderRadius: '8px', width: 'auto', padding: '0 16px', fontSize: '14px', fontWeight: 600 }}
              disabled={inputToken.trim().length < 4}
            >
              Pair
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
