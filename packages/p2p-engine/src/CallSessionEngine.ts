import { EventEmitter } from './EventEmitter.js';
import {
  CallSession,
  CallType,
  CallStatus,
  generateUUID,
  SignalingEnvelope,
} from '@lynq/core';

export interface MediaTransportBridge {
  sendSignaling: (envelope: SignalingEnvelope) => boolean;
}

export class CallSessionEngine extends EventEmitter {
  public currentCall: CallSession | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  private timer: any = null;

  constructor(
    private myUid: string,
    private myUsername: string,
    private transport: MediaTransportBridge
  ) {
    super();
  }

  /**
   * Caller initiates an outgoing voice or video call.
   */
  public async initiateCall(calleeId: string, calleeName: string, type: CallType): Promise<CallSession> {
    if (this.currentCall && this.currentCall.status !== 'ended' && this.currentCall.status !== 'rejected') {
      throw new Error('A call is already in progress');
    }

    const callId = 'call_' + generateUUID();

    this.currentCall = {
      callId,
      callerId: this.myUid,
      callerName: this.myUsername,
      calleeId,
      calleeName,
      type,
      status: 'initiating',
      durationSeconds: 0,
      isAudioMuted: false,
      isVideoMuted: false,
      startedAt: Date.now(),
    };

    // Request camera/mic permissions explicitly before dialing
    await this.acquireLocalMedia(type);

    // Send invite to callee
    this.transport.sendSignaling({
      id: generateUUID(),
      type: 'call:invite',
      senderId: this.myUid,
      recipientId: calleeId,
      timestamp: Date.now(),
      payload: {
        ...this.currentCall,
      },
    });

    this.emit('callUpdated', this.currentCall);
    return this.currentCall;
  }

  /**
   * Callee handles incoming call invite.
   */
  public handleIncomingInvite(session: CallSession): void {
    if (this.currentCall && this.currentCall.status === 'connected') {
      // Send busy response
      this.transport.sendSignaling({
        id: generateUUID(),
        type: 'call:reject',
        senderId: this.myUid,
        recipientId: session.callerId,
        timestamp: Date.now(),
        payload: {
          callId: session.callId,
          reason: 'busy',
        },
      });
      return;
    }

    this.currentCall = {
      ...session,
      status: 'ringing',
    };

    // Notify caller that our phone is ringing
    this.transport.sendSignaling({
      id: generateUUID(),
      type: 'call:ring',
      senderId: this.myUid,
      recipientId: session.callerId,
      timestamp: Date.now(),
      payload: { callId: session.callId },
    });

    this.emit('incomingCall', this.currentCall);
    this.emit('callUpdated', this.currentCall);
  }

  /**
   * Callee accepts the call.
   */
  public async acceptCall(): Promise<void> {
    if (!this.currentCall) return;

    this.currentCall.status = 'connected';
    this.currentCall.connectedAt = Date.now();

    // Acquire mic and camera
    await this.acquireLocalMedia(this.currentCall.type);

    this.transport.sendSignaling({
      id: generateUUID(),
      type: 'call:accept',
      senderId: this.myUid,
      recipientId: this.currentCall.callerId,
      timestamp: Date.now(),
      payload: { callId: this.currentCall.callId },
    });

    this.startDurationTimer();
    this.emit('callUpdated', this.currentCall);
  }

  /**
   * Callee or caller rejects/declines the call.
   */
  public rejectCall(reason: string = 'declined'): void {
    if (!this.currentCall) return;

    const targetId = this.currentCall.callerId === this.myUid ? this.currentCall.calleeId : this.currentCall.callerId;

    this.currentCall.status = 'rejected';
    this.currentCall.endReason = reason;

    this.transport.sendSignaling({
      id: generateUUID(),
      type: 'call:reject',
      senderId: this.myUid,
      recipientId: targetId,
      timestamp: Date.now(),
      payload: { callId: this.currentCall.callId, reason },
    });

    this.cleanupMedia();
    this.emit('callUpdated', this.currentCall);
  }

  /**
   * Ends active call and calculates final duration.
   */
  public hangup(reason: string = 'ended'): void {
    if (!this.currentCall) return;

    const targetId = this.currentCall.callerId === this.myUid ? this.currentCall.calleeId : this.currentCall.callerId;

    this.currentCall.status = 'ended';
    this.currentCall.endedAt = Date.now();
    this.currentCall.endReason = reason;

    this.transport.sendSignaling({
      id: generateUUID(),
      type: 'call:hangup',
      senderId: this.myUid,
      recipientId: targetId,
      timestamp: Date.now(),
      payload: {
        callId: this.currentCall.callId,
        durationSeconds: this.currentCall.durationSeconds,
        reason,
      },
    });

    this.cleanupMedia();
    this.emit('callEnded', this.currentCall);
    this.emit('callUpdated', this.currentCall);
  }

  /**
   * Called when the remote party accepts the call.
   */
  public handleCallAccepted(callId: string): void {
    if (this.currentCall && this.currentCall.callId === callId) {
      this.currentCall.status = 'connected';
      this.currentCall.connectedAt = Date.now();
      this.startDurationTimer();
      this.emit('callUpdated', this.currentCall);
    }
  }

  /**
   * Called when the remote party rejects the call.
   */
  public handleCallRejected(callId: string, reason = 'rejected'): void {
    if (this.currentCall && this.currentCall.callId === callId) {
      this.currentCall.status = 'rejected';
      this.currentCall.endReason = reason;
      this.cleanupMedia();
      this.emit('callUpdated', this.currentCall);
    }
  }

  /**
   * Called when the remote party hangs up.
   */
  public handleRemoteHangup(callId: string, reason = 'ended'): void {
    if (this.currentCall && this.currentCall.callId === callId) {
      this.currentCall.status = 'ended';
      this.currentCall.endedAt = Date.now();
      this.currentCall.endReason = reason;
      this.cleanupMedia();
      this.emit('callEnded', this.currentCall);
      this.emit('callUpdated', this.currentCall);
    }
  }

  /**
   * Handles incoming signaling envelopes related to calling.
   */
  public handleSignalingEnvelope(envelope: SignalingEnvelope): void {
    const payload = envelope.payload as any;
    switch (envelope.type) {
      case 'call:invite':
        this.handleIncomingInvite(payload as CallSession);
        break;
      case 'call:accept':
        this.handleCallAccepted(payload?.callId);
        break;
      case 'call:reject':
        this.handleCallRejected(payload?.callId, payload?.reason);
        break;
      case 'call:hangup':
        this.handleRemoteHangup(payload?.callId, payload?.reason);
        break;
    }
  }

  /**
   * Toggle audio mute
   */
  public toggleMute(): boolean {
    if (!this.currentCall) return false;

    this.currentCall.isAudioMuted = !this.currentCall.isAudioMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.currentCall?.isAudioMuted;
      });
    }

    this.emit('callUpdated', this.currentCall);
    return this.currentCall.isAudioMuted;
  }

  /**
   * Toggle camera video
   */
  public toggleVideo(): boolean {
    if (!this.currentCall) return false;

    this.currentCall.isVideoMuted = !this.currentCall.isVideoMuted;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !this.currentCall?.isVideoMuted;
      });
    }

    this.emit('callUpdated', this.currentCall);
    return this.currentCall.isVideoMuted;
  }

  private async acquireLocalMedia(type: CallType): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // In non-browser environments, media acquisition is bypassed
      return;
    }

    const constraints: MediaStreamConstraints = {
      audio: { echoCancellation: true, noiseSuppression: true },
      video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  private startDurationTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.currentCall && this.currentCall.status === 'connected') {
        this.currentCall.durationSeconds += 1;
        this.emit('callDuration', this.currentCall.durationSeconds);
      }
    }, 1000);
  }

  private cleanupMedia(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Immediately stop hardware tracks (release camera & microphone)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => track.stop());
      this.remoteStream = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }
}
