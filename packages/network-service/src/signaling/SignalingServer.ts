import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'node:events';
import { SignalingEnvelope, generateUUID, RateLimiter } from '@lynq/core';

export interface SignalingAuthContext {
  uid: string;
  token?: string;
  deviceId?: string;
}

export interface SignalingServerOptions {
  port: number;
  host?: string;
  maxPayloadBytes?: number;
  rateLimitPerSec?: number;
  requireAuth?: boolean;
  authenticator?: (auth: SignalingAuthContext, ws: WebSocket) => boolean | Promise<boolean>;
  authorizer?: (senderId: string, recipientId: string, envelopeType: string) => boolean;
}

export class SignalingServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WebSocket>(); // uid -> WebSocket
  private clientMetadata = new Map<string, any>(); // uid -> metadata
  private isRunning = false;
  private rateLimiter = new RateLimiter();
  private maxPayloadBytes: number;
  private rateLimitPerSec: number;

  constructor(private options: SignalingServerOptions) {
    super();
    this.maxPayloadBytes = options.maxPayloadBytes || 64 * 1024 * 1024; // 64 MB LAN bound for high-throughput 20GB streaming
    this.rateLimitPerSec = options.rateLimitPerSec || 200;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.options.port,
          host: this.options.host || '0.0.0.0',
        });

        this.wss.on('connection', (ws: WebSocket, req) => {
          this.handleConnection(ws);
        });

        this.wss.on('listening', () => {
          this.isRunning = true;
          this.emit('listening', this.options.port);
          resolve();
        });

        this.wss.on('error', (err) => {
          this.emit('error', err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.isRunning = false;
      if (!this.wss) {
        resolve();
        return;
      }

      for (const client of this.clients.values()) {
        try {
          client.close();
        } catch {
          // ignore
        }
      }
      this.clients.clear();

      this.wss.close(() => {
        this.wss = null;
        resolve();
      });
    });
  }

  private handleConnection(ws: WebSocket): void {
    let clientUid: string | null = null;

    ws.on('message', async (rawData) => {
      try {
        const rawStr = rawData.toString('utf8');
        if (rawStr.length > this.maxPayloadBytes) {
          this.emit('securityViolation', { type: 'payload_too_large', size: rawStr.length });
          return;
        }

        const envelope: SignalingEnvelope = JSON.parse(rawStr);

        // Security check: validate complete envelope schema
        if (
          !envelope ||
          typeof envelope !== 'object' ||
          !envelope.senderId ||
          typeof envelope.senderId !== 'string' ||
          !envelope.id ||
          typeof envelope.id !== 'string' ||
          !envelope.type ||
          typeof envelope.type !== 'string' ||
          !envelope.recipientId ||
          typeof envelope.recipientId !== 'string'
        ) {
          this.emit('securityViolation', {
            type: 'invalid_envelope',
            reason: 'Missing or invalid id, type, senderId, or recipientId',
          });
          return;
        }

        // Validate timestamp sanity (reject envelopes claiming timestamps > 24 hours in the future)
        if (typeof envelope.timestamp === 'number') {
          const now = Date.now();
          if (envelope.timestamp > now + 86400000 || envelope.timestamp < now - 30 * 86400000) {
            this.emit('securityViolation', {
              type: 'invalid_timestamp',
              timestamp: envelope.timestamp,
              now,
            });
            return;
          }
        }

        // Validate text content payload boundary
        if (envelope.type === 'msg:send' && envelope.payload) {
          const content = (envelope.payload as any).content;
          if (typeof content === 'string' && content.length > 1024 * 1024) {
            this.emit('securityViolation', {
              type: 'message_too_large',
              contentLength: content.length,
            });
            return;
          }
        }

        // Connection-level Identity Binding and Anti-Spoofing Enforcement
        if (!clientUid) {
          // Initial registration for this WebSocket connection
          const candidateUid = envelope.senderId.trim();
          if (!candidateUid) {
            this.emit('securityViolation', { type: 'invalid_envelope', reason: 'Empty senderId' });
            return;
          }

          // Enforce authentication if authenticator or requireAuth is configured
          if (this.options.authenticator || this.options.requireAuth) {
            if (!this.options.authenticator) {
              // Secure default: if requireAuth is true but no authenticator provided, reject
              this.emit('securityViolation', {
                type: 'auth_failed',
                senderId: candidateUid,
                reason: 'Authentication required but no authenticator configured',
              });
              try {
                ws.send(
                  JSON.stringify({
                    id: generateUUID(),
                    type: 'error',
                    senderId: 'server',
                    recipientId: candidateUid,
                    timestamp: Date.now(),
                    payload: {
                      code: 'AUTH_REQUIRED',
                      message: 'Authentication required but no authenticator is configured on server',
                    },
                  })
                );
                ws.close(4001, 'Authentication required');
              } catch {}
              return;
            }

            const token = (envelope.payload as any)?.token;
            const deviceId = (envelope.payload as any)?.deviceId;
            const isAuth = await this.options.authenticator(
              { uid: candidateUid, token, deviceId },
              ws
            );

            if (!isAuth) {
              this.emit('securityViolation', {
                type: 'auth_failed',
                senderId: candidateUid,
                reason: 'Invalid or missing authentication credentials',
              });
              try {
                ws.send(
                  JSON.stringify({
                    id: generateUUID(),
                    type: 'error',
                    senderId: 'server',
                    recipientId: candidateUid,
                    timestamp: Date.now(),
                    payload: {
                      code: 'AUTH_FAILED',
                      message: 'Authentication failed: invalid token or credentials',
                    },
                  })
                );
                ws.close(4003, 'Authentication failed');
              } catch {}
              return;
            }
          }

          const existingWs = this.clients.get(candidateUid);
          if (existingWs && existingWs !== ws && existingWs.readyState === WebSocket.OPEN) {
            // Prevent takeover of an already connected peer's identity
            this.emit('securityViolation', {
              type: 'identity_conflict',
              senderId: candidateUid,
              reason: 'An active connection already exists for this UID',
            });
            try {
              ws.send(
                JSON.stringify({
                  id: generateUUID(),
                  type: 'error',
                  senderId: 'server',
                  recipientId: candidateUid,
                  timestamp: Date.now(),
                  payload: {
                    code: 'IDENTITY_CONFLICT',
                    message: `An active connection already exists for UID: ${candidateUid}`,
                  },
                })
              );
            } catch {
              // ignore send error
            }
            return;
          }

          clientUid = candidateUid;
          this.clients.set(clientUid, ws);
          this.emit('clientConnected', clientUid);

          // If this was an explicit auth:register handshake, acknowledge it
          if (envelope.type === 'auth:register') {
            try {
              ws.send(
                JSON.stringify({
                  id: generateUUID(),
                  type: 'auth:response',
                  senderId: 'server',
                  recipientId: clientUid,
                  timestamp: Date.now(),
                  payload: { authenticated: true, uid: clientUid },
                })
              );
            } catch {}
            return;
          }
        } else {
          // Connection is already bound to clientUid. Enforce that senderId matches exactly!
          if (envelope.senderId !== clientUid) {
            this.emit('securityViolation', {
              type: 'identity_spoofing',
              boundUid: clientUid,
              attemptedSenderId: envelope.senderId,
              messageType: envelope.type,
            });
            try {
              ws.send(
                JSON.stringify({
                  id: generateUUID(),
                  type: 'error',
                  senderId: 'server',
                  recipientId: envelope.senderId,
                  timestamp: Date.now(),
                  payload: {
                    code: 'IDENTITY_SPOOFING_REJECTED',
                    message: `Sender ID '${envelope.senderId}' does not match authenticated connection UID '${clientUid}'`,
                  },
                })
              );
            } catch {
              // ignore send error
            }
            return; // Drop message immediately
          }
        }

        // Enforce rate limit per authenticated sender
        const check = this.rateLimiter.checkLimit(clientUid, this.rateLimitPerSec, 1000);
        if (!check.allowed) {
          this.emit('rateLimitExceeded', { senderId: clientUid, remainingMs: check.resetMs });
          return;
        }

        this.routeMessage(envelope, ws);
      } catch (err) {
        this.emit('error', err);
      }
    });

    ws.on('close', () => {
      if (clientUid) {
        if (this.clients.get(clientUid) === ws) {
          this.clients.delete(clientUid);
          this.clientMetadata.delete(clientUid);
        }
        this.emit('clientDisconnected', clientUid);

        // Announce peer departure to all other connected clients
        this.broadcast({
          id: generateUUID(),
          type: 'presence:update',
          senderId: 'server',
          recipientId: '*',
          timestamp: Date.now(),
          payload: { uid: clientUid, status: 'offline' },
        });
      }
    });

    ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private routeMessage(envelope: SignalingEnvelope, senderWs: WebSocket): void {
    const { recipientId, type } = envelope;

    // Handle ping directly
    if (type === 'ping') {
      const pong: SignalingEnvelope = {
        id: generateUUID(),
        type: 'pong',
        senderId: 'server',
        recipientId: envelope.senderId,
        timestamp: Date.now(),
        payload: null,
      };
      senderWs.send(JSON.stringify(pong));
      return;
    }

    // Handle peer presence announcement & sync
    if (type === 'presence:update') {
      const peerInfo = envelope.payload as any;
      if (!peerInfo || typeof peerInfo !== 'object') {
        this.emit('securityViolation', {
          type: 'invalid_presence',
          reason: 'Malformed presence payload',
        });
        return;
      }

      // Presence spoofing prevention: peer cannot advertise presence for another UID
      if (peerInfo.uid && peerInfo.uid !== envelope.senderId) {
        this.emit('securityViolation', {
          type: 'presence_spoofing',
          boundUid: envelope.senderId,
          attemptedUid: peerInfo.uid,
          reason: 'Cannot update presence metadata on behalf of another user identity',
        });
        return;
      }

      // Enforce authenticated identity in presence payload
      peerInfo.uid = envelope.senderId;
      this.clientMetadata.set(envelope.senderId, peerInfo);

      // 1. Announce this peer to all other connected clients
      this.broadcast(
        {
          id: generateUUID(),
          type: 'presence:update',
          senderId: envelope.senderId,
          recipientId: '*',
          timestamp: Date.now(),
          payload: peerInfo,
        },
        envelope.senderId
      );

      // 2. Send the newly connected client the directory of all existing connected peers
      const currentPeers = Array.from(this.clientMetadata.entries())
        .filter(([uid]) => uid !== envelope.senderId)
        .map(([_, info]) => info);

      if (currentPeers.length > 0) {
        senderWs.send(
          JSON.stringify({
            id: generateUUID(),
            type: 'presence:list',
            senderId: 'server',
            recipientId: envelope.senderId,
            timestamp: Date.now(),
            payload: currentPeers,
          })
        );
      }
      return;
    }

    // Enforce recipient authorization on every private-message and signaling path
    if (recipientId !== 'server' && recipientId !== '*') {
      if (this.options.authorizer) {
        const allowed = this.options.authorizer(envelope.senderId, recipientId, type);
        if (!allowed) {
          this.emit('securityViolation', {
            type: 'unauthorized_recipient',
            senderId: envelope.senderId,
            recipientId,
            messageType: type,
          });
          try {
            senderWs.send(
              JSON.stringify({
                id: generateUUID(),
                type: 'error',
                senderId: 'server',
                recipientId: envelope.senderId,
                timestamp: Date.now(),
                payload: {
                  code: 'UNAUTHORIZED_RECIPIENT',
                  message: `Sender '${envelope.senderId}' is not authorized to communicate with recipient '${recipientId}'`,
                },
              })
            );
          } catch {
            // ignore
          }
          return;
        }
      } else if (process.env.NODE_ENV === 'production') {
        // Secure default: fail closed if authorizer is missing in production
        this.emit('securityViolation', {
          type: 'unauthorized_recipient',
          senderId: envelope.senderId,
          recipientId,
          messageType: type,
          reason: 'Missing authorization policy in production environment',
        });
        try {
          senderWs.send(
            JSON.stringify({
              id: generateUUID(),
              type: 'error',
              senderId: 'server',
              recipientId: envelope.senderId,
              timestamp: Date.now(),
              payload: {
                code: 'UNAUTHORIZED_RECIPIENT',
                message: 'No authorization policy configured for production relay',
              },
            })
          );
        } catch {
          // ignore
        }
        return;
      }
    }

    // Forward to destination recipient if connected
    const targetWs = this.clients.get(recipientId);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(JSON.stringify(envelope));
    }

    // Emit event locally for application handling
    this.emit('message', envelope);
  }

  public broadcast(envelope: SignalingEnvelope, excludeUid?: string): void {
    const data = JSON.stringify(envelope);
    for (const [uid, ws] of this.clients.entries()) {
      if (uid !== excludeUid && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch {
          // ignore send error
        }
      }
    }
  }

  public sendToClient(recipientId: string, envelope: SignalingEnvelope): boolean {
    const ws = this.clients.get(recipientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
      return true;
    }
    return false;
  }

  public getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }
}
