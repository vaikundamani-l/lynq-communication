import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'node:events';
import { SignalingEnvelope, generateUUID, RateLimiter } from '@lynq/core';

export interface SignalingServerOptions {
  port: number;
  host?: string;
  maxPayloadBytes?: number;
  rateLimitPerSec?: number;
}

export class SignalingServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WebSocket>(); // uid -> WebSocket
  private isRunning = false;
  private rateLimiter = new RateLimiter();
  private maxPayloadBytes: number;
  private rateLimitPerSec: number;

  constructor(private options: SignalingServerOptions) {
    super();
    this.maxPayloadBytes = options.maxPayloadBytes || 512 * 1024; // 512 KB
    this.rateLimitPerSec = options.rateLimitPerSec || 100;
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

    ws.on('message', (rawData) => {
      try {
        const rawStr = rawData.toString('utf8');
        if (rawStr.length > this.maxPayloadBytes) {
          this.emit('securityViolation', { type: 'payload_too_large', size: rawStr.length });
          return;
        }

        const envelope: SignalingEnvelope = JSON.parse(rawStr);

        // Register client on first message
        if (envelope.senderId && !clientUid) {
          clientUid = envelope.senderId;
          this.clients.set(clientUid, ws);
          this.emit('clientConnected', clientUid);
        }

        // Enforce rate limit per sender
        if (envelope.senderId) {
          const check = this.rateLimiter.checkLimit(envelope.senderId, this.rateLimitPerSec, 1000);
          if (!check.allowed) {
            this.emit('rateLimitExceeded', { senderId: envelope.senderId, remainingMs: check.resetMs });
            return;
          }
        }

        this.routeMessage(envelope, ws);
      } catch (err) {
        this.emit('error', err);
      }
    });

    ws.on('close', () => {
      if (clientUid) {
        this.clients.delete(clientUid);
        this.emit('clientDisconnected', clientUid);
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

    // Forward to destination recipient if connected
    const targetWs = this.clients.get(recipientId);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(JSON.stringify(envelope));
    }

    // Emit event locally for application handling
    this.emit('message', envelope);
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
