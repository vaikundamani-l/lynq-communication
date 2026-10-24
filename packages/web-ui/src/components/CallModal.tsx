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
    <div className="modal-overlay call-modal-overlay">
      <div
        className={`modal-card call-card ${isVideo && isConnected ? 'video-mode' : ''}`}
      >
        {/* Glow ambient background rings */}
        <div className="call-ambient-glow" />

        {/* Peer Identification & Ringing Animation */}
        <div className="call-header-area">
          <div className="call-avatar-container">
            <div className={`call-avatar-halo ${isIncoming ? 'ringing-pulse' : ''}`} />
            <div className="avatar call-avatar">{initial}</div>
            {isConnected && <div className="call-online-dot" />}
          </div>

          <h3 className="call-peer-name">{peerName}</h3>

          <div className="call-status-badge">
            {isIncoming && (
              <span className="incoming-tag">
                🔔 Incoming {callSession.type === 'video' ? 'Video' : 'Voice'} Call...
              </span>
            )}
            {callSession.status === 'initiating' && (
              <span className="calling-tag">📞 Dialing peer on local LAN...</span>
            )}
            {isConnected && (
              <span className="connected-tag">
                <span className="live-dot" /> {formatDuration(callSession.durationSeconds)} • Direct P2P Encrypted
              </span>
            )}
          </div>
        </div>

        {/* Video / Visual Stream Area */}
        {isConnected && isVideo && (
          <div className="call-video-container">
            <div className="remote-video-placeholder">
              <span className="video-icon">🎥</span>
              <p>Direct WebRTC Video Stream Active</p>
              <span className="stream-resolution-badge">1080p • 60 FPS • LAN</span>
            </div>

            {/* PiP Local Video Preview */}
            <div className="pip-video-preview">
              <span>You</span>
            </div>
          </div>
        )}

        {/* Control Action Buttons */}
        <div className="call-actions-dock">
          {isIncoming ? (
            <div className="call-incoming-actions">
              <button
                onClick={onReject}
                className="call-ctrl-btn decline-btn"
                title="Decline Call"
              >
                <span>✕</span>
                <span className="ctrl-label">Decline</span>
              </button>
              <button
                onClick={onAccept}
                className="call-ctrl-btn accept-btn"
                title="Accept Call"
              >
                <span>📞</span>
                <span className="ctrl-label">Accept</span>
              </button>
            </div>
          ) : (
            <div className="call-connected-actions">
              <button
                onClick={onToggleMute}
                className={`call-ctrl-btn toggle-btn ${callSession.isAudioMuted ? 'active-mute' : ''}`}
                title={callSession.isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                <span>{callSession.isAudioMuted ? '🔇' : '🎙️'}</span>
                <span className="ctrl-label">{callSession.isAudioMuted ? 'Muted' : 'Mute'}</span>
              </button>

              {isVideo && (
                <button
                  onClick={onToggleVideo}
                  className={`call-ctrl-btn toggle-btn ${callSession.isVideoMuted ? 'active-mute' : ''}`}
                  title={callSession.isVideoMuted ? 'Turn Camera On' : 'Turn Camera Off'}
                >
                  <span>{callSession.isVideoMuted ? '🚫' : '📹'}</span>
                  <span className="ctrl-label">{callSession.isVideoMuted ? 'Camera Off' : 'Camera'}</span>
                </button>
              )}

              <button
                onClick={onHangup}
                className="call-ctrl-btn hangup-btn"
                title="End Call"
              >
                <span>📞</span>
                <span className="ctrl-label">Hang Up</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
