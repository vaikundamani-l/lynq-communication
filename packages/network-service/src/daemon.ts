import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import {
  Contact,
  DeviceInfo,
  Message,
  generateUUID,
  SignalingEnvelope,
} from '@lynq/core';
import {
  DatabaseManager,
  MessageRepository,
  ContactRepository,
  GroupRepository,
  SettingsRepository,
} from '@lynq/storage';
import { UdpDiscovery } from './discovery/UdpDiscovery.js';
import { MdnsDiscovery } from './discovery/MdnsDiscovery.js';
import { SignalingServer } from './signaling/SignalingServer.js';
import { PairingManager } from './pairing/PairingManager.js';
import { MessageQueueManager } from './queue/MessageQueueManager.js';

export interface DaemonConfig {
  dataDir?: string;
  dbPath?: string;
  signalingPort?: number;
  udpDiscoveryPort?: number;
  username?: string;
}

export interface NodeProfile {
  uid: string;
  username: string;
  ipAddress: string;
  signalingPort: number;
  deviceInfo: DeviceInfo;
}

export class LynqDaemon extends EventEmitter {
  private config: DaemonConfig;
  private dbManager: DatabaseManager;
  public messageRepo: MessageRepository;
  public contactRepo: ContactRepository;
  public groupRepo: GroupRepository;
  public settingsRepo: SettingsRepository;

  public signalingServer: SignalingServer;
  public udpDiscovery: UdpDiscovery;
  public mdnsDiscovery: MdnsDiscovery;
  public pairingManager: PairingManager;
  public queueManager: MessageQueueManager;

  public profile: NodeProfile;
  private isRunning = false;

  constructor(config: DaemonConfig = {}) {
    super();
    this.config = config;

    // 1. Data directory & Database initialization
    const homeDir = os.homedir();
    const dataDir = config.dataDir || path.join(homeDir, '.lynq');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = config.dbPath || path.join(dataDir, 'lynq.db');
    this.dbManager = new DatabaseManager(dbPath);
    const rawDb = this.dbManager.getRawDb();

    this.messageRepo = new MessageRepository(rawDb);
    this.contactRepo = new ContactRepository(rawDb);
    this.groupRepo = new GroupRepository(rawDb);
    this.settingsRepo = new SettingsRepository(rawDb);

    // 2. Profile resolution
    let uid = this.settingsRepo.get('node_uid');
    if (!uid) {
      uid = generateUUID();
      this.settingsRepo.set('node_uid', uid);
    }

    const username = config.username || this.settingsRepo.get('username') || os.userInfo().username || 'LynqUser';
    this.settingsRepo.set('username', username);

    const signalingPort = config.signalingPort || 4848;
    const ipAddress = this.getLocalIp();

    const deviceInfo: DeviceInfo = {
      deviceId: uid,
      deviceName: os.hostname(),
      platform: this.detectPlatform(),
      appVersion: '0.1.0',
    };

    this.profile = {
      uid,
      username,
      ipAddress,
      signalingPort,
      deviceInfo,
    };

    // 3. Components
    this.signalingServer = new SignalingServer({
      port: signalingPort,
      host: '0.0.0.0',
    });

    this.udpDiscovery = new UdpDiscovery({
      uid,
      username,
      port: config.udpDiscoveryPort || 5555,
      broadcastPort: config.udpDiscoveryPort || 5555,
      deviceInfo,
    });

    this.mdnsDiscovery = new MdnsDiscovery({
      uid,
      username,
      port: signalingPort,
      deviceInfo,
    });

    this.pairingManager = new PairingManager(
      uid,
      username,
      ipAddress,
      signalingPort,
      deviceInfo,
      this.contactRepo
    );

    this.queueManager = new MessageQueueManager(this.messageRepo, this.signalingServer, {
      senderId: uid,
    });

    this.setupEventWiring();
  }

  private detectPlatform(): 'linux' | 'windows' | 'macos' | 'android' | 'ios' | 'web' {
    const p = os.platform();
    if (p === 'darwin') return 'macos';
    if (p === 'win32') return 'windows';
    return 'linux';
  }

  private getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (netList) {
        for (const net of netList) {
          if (net.family === 'IPv4' && !net.internal) {
            return net.address;
          }
        }
      }
    }
    return '127.0.0.1';
  }

  private setupEventWiring(): void {
    // Discovery peer found
    this.udpDiscovery.on('peerFound', (contact: Contact) => {
      this.contactRepo.upsertContact(contact);
      this.emit('contactDiscovered', contact);
    });

    this.udpDiscovery.on('peerLost', (uid: string) => {
      this.contactRepo.updatePresence(uid, 'offline');
      this.emit('contactLost', uid);
    });

    // Signaling server incoming messages
    this.signalingServer.on('message', (envelope: SignalingEnvelope) => {
      this.handleIncomingEnvelope(envelope);
    });

    // Client connection events
    this.signalingServer.on('clientConnected', (clientUid: string) => {
      if (this.isRunning && this.dbManager.isOpen()) {
        this.contactRepo.updatePresence(clientUid, 'online');
        this.queueManager.drainOutboxForPeer(clientUid);
      }
      this.emit('peerConnected', clientUid);
    });

    this.signalingServer.on('clientDisconnected', (clientUid: string) => {
      if (this.isRunning && this.dbManager.isOpen()) {
        this.contactRepo.updatePresence(clientUid, 'offline');
      }
      this.emit('peerDisconnected', clientUid);
    });
  }

  private handleIncomingEnvelope(envelope: SignalingEnvelope): void {
    if (envelope.type === 'msg:send') {
      const message = envelope.payload as Message;
      if (message && message.id) {
        // Mark as delivered since we received it locally
        message.status = 'delivered';
        this.messageRepo.saveMessage(message);

        // Send delivery ack back to sender
        this.signalingServer.sendToClient(envelope.senderId, {
          id: generateUUID(),
          type: 'msg:ack',
          senderId: this.profile.uid,
          recipientId: envelope.senderId,
          timestamp: Date.now(),
          payload: {
            messageId: message.id,
            status: 'delivered',
            recipientId: this.profile.uid,
            timestamp: Date.now(),
          },
        });

        this.emit('messageReceived', message);
      }
    } else if (envelope.type === 'msg:ack') {
      const ack = envelope.payload as { messageId: string; status: any };
      if (ack?.messageId && ack?.status) {
        this.messageRepo.updateMessageStatus(ack.messageId, ack.status);
        this.emit('messageAck', ack);
      }
    } else if (envelope.type === 'msg:typing') {
      this.emit('peerTyping', envelope.payload);
    } else if (envelope.type === 'msg:react') {
      const reactPayload = envelope.payload as {
        messageId: string;
        userId: string;
        emoji: string;
        action: 'add' | 'remove';
      };
      if (reactPayload?.messageId) {
        const msg = this.messageRepo.getMessageById(reactPayload.messageId);
        if (msg) {
          const reactions = msg.reactions || {};
          const currentList = reactions[reactPayload.emoji] || [];
          if (reactPayload.action === 'add' && !currentList.includes(reactPayload.userId)) {
            reactions[reactPayload.emoji] = [...currentList, reactPayload.userId];
          } else if (reactPayload.action === 'remove') {
            reactions[reactPayload.emoji] = currentList.filter((u) => u !== reactPayload.userId);
            if (reactions[reactPayload.emoji].length === 0) {
              delete reactions[reactPayload.emoji];
            }
          }
          this.messageRepo.updateReactions(reactPayload.messageId, reactions);
        }
      }
      this.emit('messageReaction', reactPayload);
    } else if (envelope.type === 'msg:edit') {
      const editPayload = envelope.payload as { messageId: string; content: string; editedAt: number };
      if (editPayload?.messageId && editPayload?.content) {
        this.messageRepo.editMessage(editPayload.messageId, editPayload.content, editPayload.editedAt);
      }
      this.emit('messageEdited', editPayload);
    } else if (envelope.type === 'msg:delete') {
      const delPayload = envelope.payload as { messageId: string };
      if (delPayload?.messageId) {
        this.messageRepo.deleteMessage(delPayload.messageId);
      }
      this.emit('messageDeleted', delPayload);
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    await this.signalingServer.start();

    try {
      await this.udpDiscovery.start();
    } catch (err) {
      console.warn('UDP discovery startup warning (port may be busy):', err);
    }

    try {
      this.mdnsDiscovery.start();
    } catch (err) {
      console.warn('mDNS discovery startup warning:', err);
    }

    this.isRunning = true;
    this.queueManager.start();
    this.emit('started', this.profile);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.queueManager.stop();
    this.udpDiscovery.stop();
    this.mdnsDiscovery.stop();
    await this.signalingServer.stop();
    this.dbManager.close();

    this.emit('stopped');
  }

  /**
   * Send a text message to a contact or group using the store-and-forward outbox
   */
  public async sendMessage(
    recipientId: string,
    content: string,
    conversationType: 'direct' | 'group' = 'direct',
    conversationId?: string
  ): Promise<Message> {
    const convId = conversationId || (conversationType === 'direct' 
      ? [this.profile.uid, recipientId].sort().join('_') 
      : recipientId);

    const message: Message = {
      id: generateUUID(),
      senderId: this.profile.uid,
      receiverId: recipientId,
      conversationId: convId,
      conversationType,
      type: 'text',
      content,
      timestamp: Date.now(),
      status: 'pending',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    // Enqueue message into store-and-forward outbox
    this.queueManager.enqueue(message);
    return message;
  }
}
