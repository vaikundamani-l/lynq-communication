import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { LynqDaemon } from '../src/index.js';
import { SignalingEnvelope, Message } from '@lynq/core';

describe('LynqDaemon Integration Test', () => {
  let daemon: LynqDaemon;
  const testPort = 19550;

  beforeEach(async () => {
    daemon = new LynqDaemon({
      signalingPort: testPort,
      udpDiscoveryPort: 19551,
      dbPath: ':memory:',
      username: 'AliceHost',
    });
    await daemon.start();
  });

  afterEach(async () => {
    await daemon.stop();
  });

  it('starts daemon with correct profile and routes messages with acks', async () => {
    expect(daemon.profile.username).toBe('AliceHost');
    expect(daemon.profile.signalingPort).toBe(testPort);

    // Connect remote peer Bob
    const bobWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise((resolve) => bobWs.on('open', resolve));

    // Register Bob
    const bobReg: SignalingEnvelope = {
      id: 'reg-bob',
      type: 'ping',
      senderId: 'bob_peer_uid',
      recipientId: 'server',
      timestamp: Date.now(),
      payload: null,
    };
    bobWs.send(JSON.stringify(bobReg));
    await new Promise((r) => setTimeout(r, 60));

    // Alice sends message to Bob
    const messagePromise = new Promise<SignalingEnvelope<Message>>((resolve) => {
      bobWs.on('message', (data) => {
        const env = JSON.parse(data.toString('utf8'));
        if (env.type === 'msg:send') {
          resolve(env);
        }
      });
    });

    const sentMessage = await daemon.sendMessage('bob_peer_uid', 'Hello from Alice daemon!');
    expect(sentMessage.content).toBe('Hello from Alice daemon!');
    expect(sentMessage.status).toBe('sent');

    const receivedEnvelope = await messagePromise;
    expect(receivedEnvelope.payload.content).toBe('Hello from Alice daemon!');

    // Bob sends delivery ack back
    const ackEnvelope: SignalingEnvelope = {
      id: 'ack-1',
      type: 'msg:ack',
      senderId: 'bob_peer_uid',
      recipientId: daemon.profile.uid,
      timestamp: Date.now(),
      payload: {
        messageId: sentMessage.id,
        status: 'delivered',
        recipientId: 'bob_peer_uid',
        timestamp: Date.now(),
      },
    };
    bobWs.send(JSON.stringify(ackEnvelope));
    await new Promise((r) => setTimeout(r, 60));

    // Check DB status is updated to delivered
    const updated = daemon.messageRepo.getMessageById(sentMessage.id);
    expect(updated?.status).toBe('delivered');

    bobWs.close();
  });
});
