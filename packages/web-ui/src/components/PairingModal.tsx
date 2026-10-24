import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  myToken: string;
  qrPayload: string;
  onPairWithToken: (token: string) => void;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  myToken,
  qrPayload,
  onPairWithToken,
}) => {
  const [inputToken, setInputToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (qrPayload) {
      QRCode.toDataURL(qrPayload, {
        width: 180,
        margin: 1,
        color: {
          dark: '#005c4b',
          light: '#ffffff',
        },
      })
        .then((url: string) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(''));
    }
  }, [qrPayload]);

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
          <h3 className="modal-title">Device Pairing & Authentication</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'gray', fontSize: '20px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Pair with nearby devices on your local network to verify peer identity and allow secure direct file transfers.
        </p>

        {/* QR Code and Token Row */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
          {qrDataUrl && (
            <div
              style={{
                background: '#ffffff',
                padding: '12px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.25)',
                border: '2px solid rgba(16, 185, 129, 0.4)',
              }}
            >
              <img src={qrDataUrl} alt="Pairing QR Code" style={{ width: '130px', height: '130px', display: 'block', borderRadius: '4px' }} />
            </div>
          )}

          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Your Pairing Code
            </label>
            <div className="token-display-box" style={{ margin: '6px 0', padding: '10px' }}>
              <div className="token-digits" style={{ fontSize: '24px' }}>{myToken || 'LYNQ01'}</div>
            </div>
            <button
              onClick={handleCopy}
              className="action-btn"
              style={{ width: '100%', height: '36px', fontSize: '12.5px', fontWeight: 600, borderRadius: '8px', background: 'var(--bg-active)' }}
            >
              {copied ? '✓ Copied to Clipboard' : '📋 Copy Code'}
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
                borderRadius: '12px',
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
              className="modal-btn primary"
              style={{ borderRadius: '12px', minWidth: '120px', padding: '0 18px', fontSize: '13.5px', fontWeight: 700 }}
              disabled={inputToken.trim().length < 4}
            >
              Verify & Pair
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
