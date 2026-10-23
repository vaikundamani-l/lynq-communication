import { describe, it, expect, vi } from 'vitest';
import { CallSessionEngine, MediaTransportBridge } from '../src/index.js';
import { SignalingEnvelope } from '@lynq/core';

describe('CallSessionEngine (WebRTC Voice & Video Calling)', () => {
  it('manages complete call lifecycle from invitation to hangup', async () => {
    const sentSignaling: SignalingEnvelope[] = [];
    const mockTransport: MediaTransportBridge = {
      sendSignaling: vi.fn((env: SignalingEnvelope) => {
        sentSignaling.push(env);
        return true;
      }),
    };

    const callerEngine = new CallSessionEngine('alice', 'Alice', mockTransport);
    const calleeEngine = new CallSessionEngine('bob', 'Bob', mockTransport);

    // 1. Alice calls Bob (Voice Call)
    const callSession = await callerEngine.initiateCall('bob', 'Bob', 'voice');
    expect(callSession.status).toBe('initiating');
    expect(callSession.callerId).toBe('alice');
    expect(callSession.calleeId).toBe('bob');
    expect(sentSignaling).toHaveLength(1);
    expect(sentSignaling[0].type).toBe('call:invite');

    // 2. Bob handles incoming invite
    calleeEngine.handleIncomingInvite(callSession);
    expect(calleeEngine.currentCall?.status).toBe('ringing');
    expect(sentSignaling).toHaveLength(2);
    expect(sentSignaling[1].type).toBe('call:ring');

    // 3. Bob accepts the call
    await calleeEngine.acceptCall();
    expect(calleeEngine.currentCall?.status).toBe('connected');
    expect(sentSignaling).toHaveLength(3);
    expect(sentSignaling[2].type).toBe('call:accept');

    // 4. Test Mute Controls
    const isMuted = calleeEngine.toggleMute();
    expect(isMuted).toBe(true);
    expect(calleeEngine.currentCall?.isAudioMuted).toBe(true);

    const isVideoMuted = calleeEngine.toggleVideo();
    expect(isVideoMuted).toBe(true);
    expect(calleeEngine.currentCall?.isVideoMuted).toBe(true);

    // 5. Alice ends the call
    callerEngine.currentCall!.status = 'connected';
    callerEngine.hangup('normal_hangup');
    expect(callerEngine.currentCall?.status).toBe('ended');
    expect(sentSignaling[3].type).toBe('call:hangup');
  });

  it('handles call rejection correctly', async () => {
    const sentSignaling: SignalingEnvelope[] = [];
    const mockTransport: MediaTransportBridge = {
      sendSignaling: vi.fn((env: SignalingEnvelope) => {
        sentSignaling.push(env);
        return true;
      }),
    };

    const callerEngine = new CallSessionEngine('alice', 'Alice', mockTransport);
    const calleeEngine = new CallSessionEngine('bob', 'Bob', mockTransport);

    const call = await callerEngine.initiateCall('bob', 'Bob', 'video');
    calleeEngine.handleIncomingInvite(call);

    calleeEngine.rejectCall('busy');
    expect(calleeEngine.currentCall?.status).toBe('rejected');
    expect(calleeEngine.currentCall?.endReason).toBe('busy');
    expect(sentSignaling.some((e) => e.type === 'call:reject')).toBe(true);
  });
});
