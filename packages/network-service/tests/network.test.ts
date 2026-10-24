import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import {
  SignalingServer,
  PairingManager,
} from '../src/index.js';
import { DatabaseManager, ContactRepository } from '@lynq/storage';
import { SignalingEnvelope, generateUUID, PairingRequest } from '@lynq/core';

describe('@lynq/network-service tests', () => {
  describe('SignalingServer', () => {
    let server: SignalingServer;
    const testPort = 19445;

    beforeEach(async () => {
      server = new SignalingServer({ port: testPort });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('handles client connection, ping-pong, and message routing', async () => {
      // Connect client Alice
      const aliceWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
      await new Promise((resolve) => aliceWs.on('open', resolve));

      // Connect client Bob
      const bobWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
      await new Promise((resolve) => bobWs.on('open', resolve));

      // Alice sends ping
      const pingMsg: SignalingEnvelope = {
        id: generateUUID(),
        type: 'ping',
        senderId: 'alice',
        recipientId: 'server',
        timestamp: Date.now(),
        payload: null,
      };

      const pongPromise = new Promise<SignalingEnvelope>((resolve) => {
        aliceWs.on('message', (data) => {
          resolve(JSON.parse(data.toString('utf8')));
        });
      });

      aliceWs.send(JSON.stringify(pingMsg));
      const pongResponse = await pongPromise;
      expect(pongResponse.type).toBe('pong');

      // Bob registers
      const bobReg: SignalingEnvelope = {
        id: generateUUID(),
        type: 'ping',
        senderId: 'bob',
        recipientId: 'server',
        timestamp: Date.now(),
        payload: null,
      };
      bobWs.send(JSON.stringify(bobReg));
      // Give server a few ms to register Bob
      await new Promise((r) => setTimeout(r, 50));

      expect(server.getConnectedClients()).toContain('alice');
      expect(server.getConnectedClients()).toContain('bob');

      // Alice sends message to Bob
      const bobReceivePromise = new Promise<SignalingEnvelope>((resolve) => {
        bobWs.on('message', (data) => {
          const parsed = JSON.parse(data.toString('utf8'));
          if (parsed.type === 'msg:send') {
            resolve(parsed);
          }
        });
      });

      const directMsg: SignalingEnvelope = {
        id: generateUUID(),
        type: 'msg:send',
        senderId: 'alice',
        recipientId: 'bob',
        timestamp: Date.now(),
        payload: { text: 'Hello via LYNQ signaling!' },
      };

      aliceWs.send(JSON.stringify(directMsg));
      const received = await bobReceivePromise;
      expect(received.senderId).toBe('alice');
      expect(received.recipientId).toBe('bob');
      expect((received.payload as any).text).toBe('Hello via LYNQ signaling!');

      aliceWs.close();
      bobWs.close();
    });

    it('rejects identity spoofing when client attempts to forge senderId', async () => {
      const aliceWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
      await new Promise((resolve) => aliceWs.on('open', resolve));

      const bobWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
      await new Promise((resolve) => bobWs.on('open', resolve));

      // Alice authenticates as 'alice'
      aliceWs.send(
        JSON.stringify({
          id: generateUUID(),
          type: 'ping',
          senderId: 'alice',
          recipientId: 'server',
          timestamp: Date.now(),
          payload: null,
        })
      );

      // Bob authenticates as 'bob'
      bobWs.send(
        JSON.stringify({
          id: generateUUID(),
          type: 'ping',
          senderId: 'bob',
          recipientId: 'server',
          timestamp: Date.now(),
          payload: null,
        })
      );
      await new Promise((r) => setTimeout(r, 50));

      let securityViolationTriggered = false;
      server.on('securityViolation', (violation) => {
        if (violation.type === 'identity_spoofing') {
          securityViolationTriggered = true;
          expect(violation.boundUid).toBe('alice');
          expect(violation.attemptedSenderId).toBe('mallory_forged');
        }
      });

      let bobReceivedForged = false;
      bobWs.on('message', (data) => {
        const parsed = JSON.parse(data.toString('utf8'));
        if (parsed.senderId === 'mallory_forged') {
          bobReceivedForged = true;
        }
      });

      const aliceErrorPromise = new Promise<any>((resolve) => {
        aliceWs.on('message', (data) => {
          const parsed = JSON.parse(data.toString('utf8'));
          if (parsed.type === 'error' && parsed.payload?.code === 'IDENTITY_SPOOFING_REJECTED') {
            resolve(parsed);
          }
        });
      });

      // Alice attempts to send a message claiming to be 'mallory_forged'
      const spoofedMsg: SignalingEnvelope = {
        id: generateUUID(),
        type: 'msg:send',
        senderId: 'mallory_forged',
        recipientId: 'bob',
        timestamp: Date.now(),
        payload: { text: 'Spoofed message!' },
      };
      aliceWs.send(JSON.stringify(spoofedMsg));

      const errResponse = await aliceErrorPromise;
      expect(errResponse.payload.code).toBe('IDENTITY_SPOOFING_REJECTED');
      expect(securityViolationTriggered).toBe(true);

      // Verify Bob never receives the forged message
      await new Promise((r) => setTimeout(r, 100));
      expect(bobReceivedForged).toBe(false);

      aliceWs.close();
      bobWs.close();
    });

    it('enforces recipient authorization policy when authorizer rejects communication', async () => {
      // Create server with restrictive authorizer: alice can only message bob, not charlie
      const authServer = new SignalingServer({
        port: 19446,
        authorizer: (senderId, recipientId) => {
          if (senderId === 'alice' && recipientId === 'charlie') return false;
          return true;
        },
      });
      await authServer.start();

      const aliceWs = new WebSocket('ws://127.0.0.1:19446');
      const charlieWs = new WebSocket('ws://127.0.0.1:19446');
      await Promise.all([
        new Promise((r) => aliceWs.on('open', r)),
        new Promise((r) => charlieWs.on('open', r)),
      ]);

      // Authenticate
      aliceWs.send(JSON.stringify({ id: generateUUID(), type: 'ping', senderId: 'alice', recipientId: 'server', timestamp: Date.now(), payload: null }));
      charlieWs.send(JSON.stringify({ id: generateUUID(), type: 'ping', senderId: 'charlie', recipientId: 'server', timestamp: Date.now(), payload: null }));
      await new Promise((r) => setTimeout(r, 50));

      let charlieReceived = false;
      charlieWs.on('message', () => {
        charlieReceived = true;
      });

      const aliceErrorPromise = new Promise<any>((resolve) => {
        aliceWs.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'error' && parsed.payload?.code === 'UNAUTHORIZED_RECIPIENT') {
            resolve(parsed);
          }
        });
      });

      aliceWs.send(
        JSON.stringify({
          id: generateUUID(),
          type: 'msg:send',
          senderId: 'alice',
          recipientId: 'charlie',
          timestamp: Date.now(),
          payload: { text: 'Unauthorized ping' },
        })
      );

      const err = await aliceErrorPromise;
      expect(err.payload.code).toBe('UNAUTHORIZED_RECIPIENT');
      await new Promise((r) => setTimeout(r, 80));
      expect(charlieReceived).toBe(false);

      aliceWs.close();
      charlieWs.close();
      await authServer.stop();
    });

    it('validates incoming envelope schema and drops malformed envelopes', async () => {
      const clientWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
      await new Promise((r) => clientWs.on('open', r));

      let violationFired = false;
      server.on('securityViolation', (v) => {
        if (v.type === 'invalid_envelope') violationFired = true;
      });

      // Send malformed JSON (missing type and recipientId)
      clientWs.send(JSON.stringify({ senderId: 'attacker' }));
      await new Promise((r) => setTimeout(r, 80));

      expect(violationFired).toBe(true);
      clientWs.close();
    });

    it('rejects unauthenticated clients when authenticator is configured and token is invalid', async () => {
      const authPort = 19447;
      const secureServer = new SignalingServer({
        port: authPort,
        requireAuth: true,
        authenticator: (auth) => {
          return auth.token === 'VALID_SECRET_TOKEN';
        },
      });
      await secureServer.start();

      let authFailedFired = false;
      secureServer.on('securityViolation', (v) => {
        if (v.type === 'auth_failed') authFailedFired = true;
      });

      const untrustedWs = new WebSocket(`ws://127.0.0.1:${authPort}`);
      await new Promise((r) => untrustedWs.on('open', r));

      const errorPromise = new Promise<any>((resolve) => {
        untrustedWs.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      // Try registering with an invalid token
      untrustedWs.send(
        JSON.stringify({
          id: generateUUID(),
          type: 'auth:register',
          senderId: 'mallory',
          recipientId: 'server',
          timestamp: Date.now(),
          payload: { token: 'INVALID_TOKEN' },
        })
      );

      const errResp = await errorPromise;
      expect(errResp.payload?.code).toBe('AUTH_FAILED');
      expect(authFailedFired).toBe(true);

      untrustedWs.close();
      await secureServer.stop();
    });

    it('rejects presence impersonation when peer tries to broadcast presence for a different UID', async () => {
      const clientWs = new WebSocket(`ws://127.0.0.1:${testPort}`);
      await new Promise((r) => clientWs.on('open', r));

      // Authenticate/bind connection as 'alice'
      clientWs.send(
        JSON.stringify({
          id: generateUUID(),
          type: 'ping',
          senderId: 'alice',
          recipientId: 'server',
          timestamp: Date.now(),
          payload: null,
        })
      );
      await new Promise((r) => setTimeout(r, 50));

      let presenceSpoofingFired = false;
      server.on('securityViolation', (v) => {
        if (v.type === 'presence_spoofing') {
          presenceSpoofingFired = true;
          expect(v.boundUid).toBe('alice');
          expect(v.attemptedUid).toBe('bob');
        }
      });

      // Alice tries to update presence claiming to be 'bob'
      clientWs.send(
        JSON.stringify({
          id: generateUUID(),
          type: 'presence:update',
          senderId: 'alice',
          recipientId: '*',
          timestamp: Date.now(),
          payload: { uid: 'bob', username: 'BobImpersonated', status: 'online' },
        })
      );
      await new Promise((r) => setTimeout(r, 80));

      expect(presenceSpoofingFired).toBe(true);
      clientWs.close();
    });

    it('fails closed when authorizer is missing in production environment', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const prodPort = 19448;
        const prodServer = new SignalingServer({ port: prodPort });
        await prodServer.start();

        const client1 = new WebSocket(`ws://127.0.0.1:${prodPort}`);
        const client2 = new WebSocket(`ws://127.0.0.1:${prodPort}`);
        await Promise.all([
          new Promise((r) => client1.on('open', r)),
          new Promise((r) => client2.on('open', r)),
        ]);

        // Connect
        client1.send(JSON.stringify({ id: generateUUID(), type: 'ping', senderId: 'u1', recipientId: 'server', timestamp: Date.now(), payload: null }));
        client2.send(JSON.stringify({ id: generateUUID(), type: 'ping', senderId: 'u2', recipientId: 'server', timestamp: Date.now(), payload: null }));
        await new Promise((r) => setTimeout(r, 50));

        const errorPromise = new Promise<any>((resolve) => {
          client1.on('message', (d) => {
            const parsed = JSON.parse(d.toString());
            if (parsed.type === 'error' && parsed.payload?.code === 'UNAUTHORIZED_RECIPIENT') {
              resolve(parsed);
            }
          });
        });

        // Client 1 attempts to message Client 2 without configured authorizer
        client1.send(
          JSON.stringify({
            id: generateUUID(),
            type: 'msg:send',
            senderId: 'u1',
            recipientId: 'u2',
            timestamp: Date.now(),
            payload: { text: 'Unauthorized in production' },
          })
        );

        const errResp = await errorPromise;
        expect(errResp.payload?.code).toBe('UNAUTHORIZED_RECIPIENT');

        client1.close();
        client2.close();
        await prodServer.stop();
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  describe('PairingManager', () => {
    let dbManager: DatabaseManager;
    let contactRepo: ContactRepository;
    let pairingManager: PairingManager;

    beforeEach(() => {
      dbManager = new DatabaseManager(':memory:');
      contactRepo = new ContactRepository(dbManager.getRawDb());
      pairingManager = new PairingManager(
        'host_uid',
        'HostUser',
        '192.168.1.100',
        8080,
        {
          deviceId: 'host_dev',
          deviceName: 'Host Linux PC',
          platform: 'linux',
          appVersion: '0.1.0',
        },
        contactRepo
      );
    });

    afterEach(() => {
      dbManager.close();
    });

    it('generates pairing token and validates valid request', () => {
      const invite = pairingManager.createPairingInvitation();
      expect(invite.token).toHaveLength(6);
      expect(invite.qrPayload).toContain(invite.token);
      expect(invite.qrPayload).toContain('LYNQ_PAIR_V1');

      const request: PairingRequest = {
        pairingToken: invite.token,
        requesterUid: 'guest_peer',
        requesterUsername: 'GuestUser',
        requesterIp: '192.168.1.105',
        requesterPort: 8081,
        deviceInfo: {
          deviceId: 'guest_dev',
          deviceName: "Guest's Laptop",
          platform: 'linux',
          appVersion: '0.1.0',
        },
        timestamp: Date.now(),
        expiresAt: invite.expiresAt,
      };

      const result = pairingManager.verifyPairingRequest(request);
      expect(result.approved).toBe(true);

      const contact = contactRepo.getContact('guest_peer');
      expect(contact).not.toBeNull();
      expect(contact?.isPaired).toBe(true);
      expect(contact?.username).toBe('GuestUser');
    });

    it('rejects invalid pairing token', () => {
      pairingManager.createPairingInvitation();

      const request: PairingRequest = {
        pairingToken: 'WRONG9',
        requesterUid: 'guest_peer',
        requesterUsername: 'GuestUser',
        requesterIp: '192.168.1.105',
        requesterPort: 8081,
        deviceInfo: {
          deviceId: 'guest_dev',
          deviceName: "Guest's Laptop",
          platform: 'linux',
          appVersion: '0.1.0',
        },
        timestamp: Date.now(),
        expiresAt: Date.now() + 60000,
      };

      const result = pairingManager.verifyPairingRequest(request);
      expect(result.approved).toBe(false);
      expect(result.error).toBe('Invalid pairing token');
    });
  });
});
