import { Bonjour, Service } from 'bonjour-service';
import { EventEmitter } from 'node:events';
import { Contact, DeviceInfo } from '@lynq/core';

export interface MdnsOptions {
  uid: string;
  username: string;
  port: number;
  deviceInfo: DeviceInfo;
}

export class MdnsDiscovery extends EventEmitter {
  private bonjour: Bonjour | null = null;
  private publishedService: Service | null = null;
  private browser: any = null;
  private isRunning = false;

  private uid: string;
  private username: string;
  private port: number;
  private deviceInfo: DeviceInfo;

  constructor(options: MdnsOptions) {
    super();
    this.uid = options.uid;
    this.username = options.username;
    this.port = options.port;
    this.deviceInfo = options.deviceInfo;
  }

  public start(): void {
    if (this.isRunning) return;

    this.bonjour = new Bonjour();
    this.isRunning = true;

    // 1. Publish our service
    this.publishedService = this.bonjour.publish({
      name: `LYNQ-${this.username}-${this.uid.slice(0, 8)}`,
      type: 'lynq',
      port: this.port,
      txt: {
        uid: this.uid,
        username: this.username,
        platform: this.deviceInfo.platform,
        deviceName: this.deviceInfo.deviceName,
      },
    });

    // 2. Discover other LYNQ peers
    this.browser = this.bonjour.find({ type: 'lynq' }, (service: Service) => {
      const txt = (service.txt || {}) as Record<string, string>;
      const peerUid = txt.uid || service.name;

      // Skip self
      if (peerUid === this.uid) return;

      const contact: Contact = {
        uid: peerUid,
        username: txt.username || service.name,
        ipAddress: service.addresses?.[0] || service.host,
        port: service.port,
        status: 'online',
        lastSeen: Date.now(),
        deviceInfo: {
          deviceId: peerUid,
          deviceName: txt.deviceName || service.name,
          platform: (txt.platform as any) || 'linux',
          appVersion: '0.1.0',
        },
        isPaired: false,
      };

      this.emit('peerFound', contact);
    });
  }

  public stop(): void {
    this.isRunning = false;
    if (this.browser) {
      try {
        this.browser.stop();
      } catch {
        // ignore
      }
      this.browser = null;
    }
    if (this.publishedService) {
      try {
        this.publishedService.stop?.();
      } catch {
        // ignore
      }
      this.publishedService = null;
    }
    if (this.bonjour) {
      try {
        this.bonjour.destroy();
      } catch {
        // ignore
      }
      this.bonjour = null;
    }
  }
}
