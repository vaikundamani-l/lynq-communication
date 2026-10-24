import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { Contact, DeviceInfo } from '@lynq/core';

export interface UdpDiscoveryOptions {
  uid: string;
  username: string;
  port?: number;
  broadcastPort?: number;
  broadcastIntervalMs?: number;
  peerTimeoutMs?: number;
  deviceInfo: DeviceInfo;
}

export interface PeerDiscoveryPacket {
  protocol: 'LYNQ_DISCOVERY_V1';
  uid: string;
  username: string;
  port: number;
  status: 'online' | 'offline';
  deviceInfo: DeviceInfo;
  timestamp: number;
}

export class UdpDiscovery extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private peers = new Map<string, { contact: Contact; lastSeen: number }>();

  private uid: string;
  private username: string;
  private port: number;
  private broadcastPort: number;
  private broadcastIntervalMs: number;
  private peerTimeoutMs: number;
  private deviceInfo: DeviceInfo;

  constructor(options: UdpDiscoveryOptions) {
    super();
    this.uid = options.uid;
    this.username = options.username;
    this.port = options.port || 5555;
    this.broadcastPort = options.broadcastPort || 5555;
    this.broadcastIntervalMs = options.broadcastIntervalMs || 4000;
    this.peerTimeoutMs = options.peerTimeoutMs || 12000;
    this.deviceInfo = options.deviceInfo;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        this.emit('warning', err);
      });

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.socket.bind(this.port, () => {
        if (!this.socket) return;
        try {
          this.socket.setBroadcast(true);
          this.isRunning = true;

          // Start periodic broadcast
          this.broadcastPresence();
          this.timer = setInterval(() => this.broadcastPresence(), this.broadcastIntervalMs);

          // Periodic prune of timed out peers
          this.pruneTimer = setInterval(() => this.pruneInactivePeers(), 5000);

          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.peers.clear();
  }

  private broadcastPresence(): void {
    if (!this.socket || !this.isRunning) return;

    const packet: PeerDiscoveryPacket = {
      protocol: 'LYNQ_DISCOVERY_V1',
      uid: this.uid,
      username: this.username,
      port: this.port,
      status: 'online',
      deviceInfo: this.deviceInfo,
      timestamp: Date.now(),
    };

    const message = Buffer.from(JSON.stringify(packet));

    this.socket.send(message, 0, message.length, this.broadcastPort, '255.255.255.255', (err) => {
      if (err) {
        // Non-fatal broadcast warning (e.g. ENETUNREACH or momentary network interface change)
        this.emit('warning', err);
      }
    });
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const data = JSON.parse(msg.toString('utf8')) as PeerDiscoveryPacket;
      if (data.protocol !== 'LYNQ_DISCOVERY_V1') return;
      if (data.uid === this.uid) return; // ignore self

      const contact: Contact = {
        uid: data.uid,
        username: data.username,
        ipAddress: rinfo.address,
        port: data.port,
        status: data.status,
        lastSeen: Date.now(),
        deviceInfo: data.deviceInfo,
        isPaired: false,
      };

      const isNew = !this.peers.has(data.uid);
      this.peers.set(data.uid, { contact, lastSeen: Date.now() });

      if (isNew) {
        this.emit('peerFound', contact);
      } else {
        this.emit('peerHeartbeat', contact);
      }
    } catch {
      // ignore invalid packet
    }
  }

  private pruneInactivePeers(): void {
    const now = Date.now();
    for (const [uid, record] of this.peers.entries()) {
      if (now - record.lastSeen > this.peerTimeoutMs) {
        this.peers.delete(uid);
        this.emit('peerLost', uid);
      }
    }
  }

  public getDiscoveredPeers(): Contact[] {
    return Array.from(this.peers.values()).map((p) => p.contact);
  }
}
