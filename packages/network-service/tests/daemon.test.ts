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

  it('rejects direct messages from unpaired peers to the daemon', async () => {
    // Unpaired peer Eve connects
    const eveWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise((resolve) => eveWs.on('open', resolve));

    // Register Eve
    eveWs.send(
      JSON.stringify({
        id: 'reg-eve',
        type: 'ping',
        senderId: 'eve_unpaired_uid',
        recipientId: 'server',
        timestamp: Date.now(),
        payload: null,
      })
    );
    await new Promise((r) => setTimeout(r, 60));

    // Eve is saved as discovered contact by discovery, but isPaired is false
    daemon.contactRepo.upsertContact({
      uid: 'eve_unpaired_uid',
      username: 'Eve',
      ipAddress: '127.0.0.1',
      port: 19550,
      status: 'online',
      lastSeen: Date.now(),
      isPaired: false,
    });

    const errorPromise = new Promise<any>((resolve) => {
      eveWs.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'error' && parsed.payload?.code === 'UNAUTHORIZED_RECIPIENT') {
          resolve(parsed);
        }
      });
    });

    // Eve attempts to send a direct message to Alice daemon
    eveWs.send(
      JSON.stringify({
        id: 'msg-eve-1',
        type: 'msg:send',
        senderId: 'eve_unpaired_uid',
        recipientId: daemon.profile.uid,
        timestamp: Date.now(),
        payload: { id: 'msg-eve-1', content: 'Spam from unpaired peer', senderId: 'eve_unpaired_uid', receiverId: daemon.profile.uid },
      })
    );

    const err = await errorPromise;
    expect(err.payload.code).toBe('UNAUTHORIZED_RECIPIENT');

    eveWs.close();
  });

  it('accepts direct messages from paired peers to the daemon', async () => {
    // Paired peer Charlie connects
    const charlieWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
    await new Promise((resolve) => charlieWs.on('open', resolve));

    // Register Charlie
    charlieWs.send(
      JSON.stringify({
        id: 'reg-charlie',
        type: 'ping',
        senderId: 'charlie_paired_uid',
        recipientId: 'server',
        timestamp: Date.now(),
        payload: null,
      })
    );
    await new Promise((r) => setTimeout(r, 60));

    // Charlie is registered as a paired contact
    daemon.contactRepo.upsertContact({
      uid: 'charlie_paired_uid',
      username: 'Charlie',
      ipAddress: '127.0.0.1',
      port: 19550,
      status: 'online',
      lastSeen: Date.now(),
      isPaired: true,
      pairingToken: 'PAIR123',
    });

    const ackPromise = new Promise<any>((resolve) => {
      charlieWs.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'msg:ack') {
          resolve(parsed);
        }
      });
    });

    // Charlie sends direct message to Alice daemon
    charlieWs.send(
      JSON.stringify({
        id: 'msg-charlie-1',
        type: 'msg:send',
        senderId: 'charlie_paired_uid',
        recipientId: daemon.profile.uid,
        timestamp: Date.now(),
        payload: {
          id: 'msg-charlie-1',
          content: 'Hello paired friend!',
          senderId: 'charlie_paired_uid',
          receiverId: daemon.profile.uid,
          timestamp: Date.now(),
        },
      })
    );

    const ack = await ackPromise;
    expect(ack.payload.messageId).toBe('msg-charlie-1');
    expect(ack.payload.status).toBe('delivered');

    charlieWs.close();
  });

  it('authenticates remote clients correctly via authenticateClient', () => {
    // 1. Localhost address
    expect(
      daemon.authenticateClient({ uid: 'any_uid' }, { _socket: { remoteAddress: '127.0.0.1' } } as any)
    ).toBe(true);
    expect(
      daemon.authenticateClient({ uid: 'any_uid' }, { _socket: { remoteAddress: '::1' } } as any)
    ).toBe(true);

    // 2. Remote address without credentials fails
    expect(
      daemon.authenticateClient({ uid: 'remote_stranger' }, { _socket: { remoteAddress: '10.96.0.50' } } as any)
    ).toBe(false);

    // 3. Remote address with valid pairing token succeeds
    const invitation = daemon.pairingManager.createPairingInvitation();
    expect(
      daemon.authenticateClient(
        { uid: 'remote_peer', token: invitation.token },
        { _socket: { remoteAddress: '10.96.0.50' } } as any
      )
    ).toBe(true);

    // 4. Remote address with invalid pairing token fails
    expect(
      daemon.authenticateClient(
        { uid: 'remote_peer', token: 'WRONG_TOKEN' },
        { _socket: { remoteAddress: '10.96.0.50' } } as any
      )
    ).toBe(false);

    // 5. Remote address with paired contact and matching token succeeds
    daemon.contactRepo.upsertContact({
      uid: 'paired_remote',
      username: 'PairedRemote',
      ipAddress: '10.96.0.50',
      port: 4848,
      status: 'online',
      lastSeen: Date.now(),
      isPaired: true,
      pairingToken: 'REMOTE_TOKEN_999',
    });
    expect(
      daemon.authenticateClient(
        { uid: 'paired_remote', token: 'REMOTE_TOKEN_999' },
        { _socket: { remoteAddress: '10.96.0.50' } } as any
      )
    ).toBe(true);
  });
});
