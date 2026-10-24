import { describe, it, expect, vi } from 'vitest';
import { P2PTransportRouter, LynqPeerConnection } from '../src/index.js';
import { Message, generateUUID, SignalingEnvelope } from '@lynq/core';

describe('@lynq/p2p-engine tests', () => {
  it('routes messages through signaling fallback when DataChannel is connecting', () => {
    const sentSignaling: SignalingEnvelope[] = [];
    const mockSender = {
      sendSignalingEnvelope: vi.fn((env: SignalingEnvelope) => {
        sentSignaling.push(env);
        return true;
      }),
    };

    const router = new P2PTransportRouter('user_alice', mockSender);

    const msg: Message = {
      id: generateUUID(),
      senderId: 'user_alice',
      receiverId: 'user_bob',
      conversationId: 'user_alice_user_bob',
      conversationType: 'direct',
      type: 'text',
      content: 'Testing P2P fallback message',
      timestamp: Date.now(),
      status: 'pending',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    const result = router.routeMessage('user_bob', msg);
    expect(result).toBe('signaling_relay');
    expect(mockSender.sendSignalingEnvelope).toHaveBeenCalled();
    expect(sentSignaling).toHaveLength(1);
    expect(sentSignaling[0].type).toBe('msg:send');
    expect((sentSignaling[0].payload as Message).content).toBe('Testing P2P fallback message');
  });

  it('routes typing indicators and read receipts', () => {
    const sentSignaling: SignalingEnvelope[] = [];
    const mockSender = {
      sendSignalingEnvelope: vi.fn((env: SignalingEnvelope) => {
        sentSignaling.push(env);
        return true;
      }),
    };

    const router = new P2PTransportRouter('user_alice', mockSender);

    // Send typing
    router.routeTyping('user_bob', 'conv_1', true);
    expect(sentSignaling[0].type).toBe('msg:typing');
    expect((sentSignaling[0].payload as any).isTyping).toBe(true);

    // Send read receipt
    const msgId = generateUUID();
    router.routeReadReceipt('user_bob', msgId);
    expect(sentSignaling[1].type).toBe('msg:ack');
    expect((sentSignaling[1].payload as any).status).toBe('read');
    expect((sentSignaling[1].payload as any).messageId).toBe(msgId);

    // Send reaction
    router.routeReaction('user_bob', msgId, '❤️', 'add');
    expect(sentSignaling[2].type).toBe('msg:react');
    expect((sentSignaling[2].payload as any).emoji).toBe('❤️');
  });

  it('routes edits and deletions', () => {
    const sentSignaling: SignalingEnvelope[] = [];
    const mockSender = {
      sendSignalingEnvelope: vi.fn((env: SignalingEnvelope) => {
        sentSignaling.push(env);
        return true;
      }),
    };

    const router = new P2PTransportRouter('user_alice', mockSender);
    const msgId = generateUUID();

    router.routeEdit('user_bob', msgId, 'Updated text');
    expect(sentSignaling[0].type).toBe('msg:edit');
    expect((sentSignaling[0].payload as any).content).toBe('Updated text');

    router.routeDelete('user_bob', msgId);
    expect(sentSignaling[1].type).toBe('msg:delete');
    expect((sentSignaling[1].payload as any).messageId).toBe(msgId);
  });

  it('buffers early ICE candidates and flushes them when remote description is set', async () => {
    const addedCandidates: any[] = [];

    class MockRTCPeerConnection {
      remoteDescription: any = null;
      connectionState = 'new';
      onicecandidate: any = null;
      onconnectionstatechange: any = null;
      ondatachannel: any = null;

      async setRemoteDescription(desc: any) {
        this.remoteDescription = desc;
      }
      async createAnswer() {
        return { type: 'answer', sdp: 'dummy-answer-sdp' };
      }
      async setLocalDescription(_desc: any) {}
      async addIceCandidate(cand: any) {
        if (!this.remoteDescription) {
          throw new Error('InvalidStateError: remoteDescription not set');
        }
        addedCandidates.push(cand);
      }
      close() {}
    }

    class MockRTCIceCandidate {
      candidate: string;
      constructor(init: any) {
        this.candidate = init.candidate;
      }
    }

    const origPC = (globalThis as any).RTCPeerConnection;
    const origCand = (globalThis as any).RTCIceCandidate;
    (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
    (globalThis as any).RTCIceCandidate = MockRTCIceCandidate;

    try {
      const conn = new LynqPeerConnection('alice', 'bob', {
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onAck: vi.fn(),
        onReadReceipt: vi.fn(),
        onTyping: vi.fn(),
        onReaction: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onSignalNeeded: vi.fn(),
      });

      conn.initialize(false);

      // 1. Send candidate BEFORE remote description is set
      await conn.handleRemoteIceCandidate({ candidate: 'candidate:1 1 UDP ...' });
      expect(addedCandidates).toHaveLength(0); // must be buffered, not immediately added

      // 2. Set remote offer
      await conn.handleRemoteOffer('mock-offer-sdp');

      // 3. Verify queued candidate was drained and added successfully
      expect(addedCandidates).toHaveLength(1);
      expect(addedCandidates[0].candidate).toBe('candidate:1 1 UDP ...');

      // 4. Send next candidate AFTER remote description is set
      await conn.handleRemoteIceCandidate({ candidate: 'candidate:2 1 UDP ...' });
      expect(addedCandidates).toHaveLength(2);
      expect(addedCandidates[1].candidate).toBe('candidate:2 1 UDP ...');

      conn.close();
    } finally {
      (globalThis as any).RTCPeerConnection = origPC;
      (globalThis as any).RTCIceCandidate = origCand;
    }
  });
});
