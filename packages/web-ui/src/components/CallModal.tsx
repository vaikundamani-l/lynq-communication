import React from 'react';
import { CallSession } from '@lynq/core';

interface CallModalProps {
  callSession: CallSession | null;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  callSession,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
  onToggleVideo,
}) => {
  if (!callSession || callSession.status === 'ended' || callSession.status === 'rejected') {
    return null;
  }

  const formatDuration = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isIncoming = callSession.status === 'ringing';
  const isConnected = callSession.status === 'connected';
  const isVideo = callSession.type === 'video';

  const peerName = isIncoming ? callSession.callerName : callSession.calleeName;
  const initial = (peerName ? peerName[0] : '?').toUpperCase();

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        style={{
          width: isVideo && isConnected ? '640px' : '400px',
          padding: '24px',
          textAlign: 'center',
          borderRadius: '20px',
        }}
      >
        {/* Header / Peer Identification */}
        <div style={{ marginBottom: '20px' }}>
          <div
            className="avatar"
            style={{
              width: '72px',
              height: '72px',
              fontSize: '28px',
              margin: '0 auto 12px',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {initial}
          </div>

          <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>{peerName}</h3>

          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {isIncoming && `Incoming ${callSession.type === 'video' ? 'Video' : 'Voice'} Call...`}
            {callSession.status === 'initiating' && 'Calling...'}
            {isConnected && (
              <span style={{ color: 'var(--status-online)', fontWeight: 600 }}>
                {formatDuration(callSession.durationSeconds)} • Connected
              </span>
            )}
          </div>
        </div>

        {/* Video / Visual Stream Area */}
        {isConnected && isVideo && (
          <div
            style={{
              position: 'relative',
              height: '280px',
              background: '#000000',
              borderRadius: '12px',
              marginBottom: '20px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Remote Video Feed Simulation */}
            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              🎥 Remote Video Stream (Direct WebRTC Track)
            </div>

            {/* PiP Local Video Preview */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                width: '100px',
                height: '75px',
                background: '#1f2937',
                borderRadius: '8px',
                border: '2px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                color: 'white',
              }}
            >
              {callSession.isVideoMuted ? 'Camera Off' : 'You (PiP)'}
            </div>
          </div>
        )}

        {/* Incoming Call Buttons: Accept / Decline */}
        {isIncoming ? (
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '16px' }}>
            <button
              onClick={onReject}
              style={{
                background: 'var(--accent-danger)',
                color: 'white',
                border: 'none',
                width: '120px',
                height: '44px',
                borderRadius: '22px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              ✕ Decline
            </button>
            <button
              onClick={onAccept}
              style={{
                background: 'var(--status-online)',
                color: 'white',
                border: 'none',
                width: '120px',
                height: '44px',
                borderRadius: '22px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              ✓ Accept
            </button>
          </div>
        ) : (
          /* Active Call Control Action Bar */
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', alignItems: 'center' }}>
            <button
              onClick={onToggleMute}
              className="rail-btn"
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                background: callSession.isAudioMuted ? 'var(--accent-danger)' : 'var(--bg-active)',
                color: 'white',
                fontSize: '20px',
              }}
              title={callSession.isAudioMuted ? 'Unmute' : 'Mute'}
            >
              {callSession.isAudioMuted ? '🔇' : '🎤'}
            </button>

            {isVideo && (
              <button
                onClick={onToggleVideo}
                className="rail-btn"
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: callSession.isVideoMuted ? 'var(--accent-danger)' : 'var(--bg-active)',
                  color: 'white',
                  fontSize: '20px',
                }}
                title={callSession.isVideoMuted ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {callSession.isVideoMuted ? '🚫' : '📹'}
              </button>
            )}

            <button
              onClick={onHangup}
              style={{
                background: 'var(--accent-danger)',
                color: 'white',
                border: 'none',
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                fontSize: '22px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-md)',
              }}
              title="End Call"
            >
              📞
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
