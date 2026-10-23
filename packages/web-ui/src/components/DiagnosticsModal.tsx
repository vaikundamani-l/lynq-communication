import React, { useState } from 'react';
import { Contact } from '@lynq/core';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  networkStatus: { connected: boolean; url: string };
  contacts: Contact[];
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  onClose,
  networkStatus,
  contacts,
}) => {
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  if (!isOpen) return null;

  const runPingTest = async () => {
    setIsPinging(true);
    setPingResult('Testing local WebSocket round-trip...');
    const start = performance.now();
    try {
      const ws = new WebSocket(networkStatus.url);
      ws.onopen = () => {
        const rtt = (performance.now() - start).toFixed(2);
        setPingResult(`✓ Success! Daemon responded in ${rtt} ms on ${networkStatus.url}`);
        ws.close();
        setIsPinging(false);
      };
      ws.onerror = () => {
        setPingResult(`✕ Connection error on ${networkStatus.url}. Verify daemon is running.`);
        setIsPinging(false);
      };
    } catch (err: any) {
      setPingResult(`✕ Error: ${err.message}`);
      setIsPinging(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ width: '540px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">Network Diagnostics & Troubleshooting</h3>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Status Overview */}
          <div style={{ background: 'var(--bg-active)', padding: '14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Local Networking Service:</span>
              <span
                style={{
                  color: networkStatus.connected ? 'var(--status-online)' : 'var(--accent-danger)',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                {networkStatus.connected ? '● CONNECTED' : '○ DISCONNECTED'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Signaling Endpoint: <code>{networkStatus.url}</code>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Discovery Ports: UDP <code>5555</code> (Broadcast), mDNS <code>_lynq._tcp.local</code>
            </div>
          </div>

          {/* Interactive Ping Test */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Latency Benchmark Test:</span>
              <button
                type="button"
                onClick={runPingTest}
                disabled={isPinging}
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {isPinging ? 'Pinging...' : '⚡ Run Ping Test'}
              </button>
            </div>
            {pingResult && (
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              >
                {pingResult}
              </div>
            )}
          </div>

          {/* Discovered LAN Peers */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
              Discovered LAN Peers ({contacts.length}):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {contacts.map((c) => (
                <div
                  key={c.uid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-card)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{c.username}</span> ({c.ipAddress}:{c.port})
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span style={{ color: c.status === 'online' ? 'var(--status-online)' : 'var(--text-muted)' }}>
                      {c.status}
                    </span>
                    <span>{c.isPaired ? '🔒 Paired' : '🔓 Unpaired'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Troubleshooting Guide */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>🛠️ Troubleshooting Checklist</div>
            <ol style={{ paddingLeft: '18px', margin: 0, color: 'var(--text-secondary)' }}>
              <li>Ensure both devices are connected to the same Wi-Fi router / subnet.</li>
              <li>Check your OS firewall allows UDP 5555 and TCP 4848:
                <br /><code>sudo ufw allow 5555/udp && sudo ufw allow 4848/tcp</code>
              </li>
              <li>If your router enforces "AP / Client Isolation", use QR code pairing with manual IP entry.</li>
            </ol>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
