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
import { GroupManager } from './group/GroupManager.js';

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
  public groupManager: GroupManager;

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
      authorizer: (senderId: string, recipientId: string, type: string) => {
        return this.authorizeMessage(senderId, recipientId, type);
      },
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
      ipAddress,
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

    this.groupManager = new GroupManager(
      uid,
      username,
      this.groupRepo,
      this.messageRepo,
      this.queueManager,
      this.signalingServer
    );

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
    this.udpDiscovery.on('warning', (err) => {
      console.warn('UdpDiscovery non-fatal warning:', err?.message || err);
    });

    this.udpDiscovery.on('error', (err) => {
      console.warn('UdpDiscovery error handled:', err?.message || err);
    });

    this.udpDiscovery.on('peerFound', (contact: Contact) => {
      this.contactRepo.upsertContact(contact);
      this.emit('contactDiscovered', contact);
    });

    this.udpDiscovery.on('peerLost', (uid: string) => {
      this.contactRepo.updatePresence(uid, 'offline');
      this.emit('contactLost', uid);
    });

    // Signaling server incoming messages
    this.signalingServer.on('error', (err) => {
      console.warn('SignalingServer internal error (non-fatal):', err);
    });

    this.signalingServer.on('securityViolation', (violation) => {
      console.warn('SignalingServer security violation detected and blocked:', violation);
      this.emit('securityViolation', violation);
    });

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
    try {
      if (envelope.type === 'msg:send') {
        const message = envelope.payload as Message;
        if (message && message.id) {
          if (!message.conversationId) {
            message.conversationId = [message.senderId || envelope.senderId, message.receiverId || envelope.recipientId]
              .sort()
              .join('_');
          }
          if (!message.conversationType) {
            message.conversationType = 'direct';
          }
          if (!message.timestamp) {
            message.timestamp = Date.now();
          }
          if (!message.type) {
            message.type = 'text';
          }
          message.status = 'delivered';

          try {
            this.messageRepo.saveMessage(message);
          } catch (dbErr) {
            console.warn('Failed to save message to SQLite:', dbErr);
          }

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
          try {
            this.messageRepo.updateMessageStatus(ack.messageId, ack.status);
          } catch (dbErr) {
            console.warn('Failed to update message status in SQLite:', dbErr);
          }
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
          try {
            const msg = this.messageRepo.getMessageById(reactPayload.messageId);
            if (msg) {
              const reactions = msg.reactions || {};
              const currentList = reactions[reactPayload.emoji] || [];
              if (reactPayload.action === 'add' && !currentList.includes(reactPayload.userId)) {
                reactions[reactPayload.emoji] = [...currentList, reactPayload.userId];
              } else if (reactPayload.action === 'remove') {
                reactions[reactPayload.emoji] = currentList.filter((u: string) => u !== reactPayload.userId);
                if (reactions[reactPayload.emoji].length === 0) {
                  delete reactions[reactPayload.emoji];
                }
              }
              this.messageRepo.updateReactions(reactPayload.messageId, reactions);
            }
          } catch (dbErr) {
            console.warn('Failed to update reaction in SQLite:', dbErr);
          }
        }
        this.emit('messageReaction', reactPayload);
      } else if (envelope.type === 'msg:edit') {
        const editPayload = envelope.payload as { messageId: string; content: string; editedAt: number };
        if (editPayload?.messageId && editPayload?.content) {
          try {
            this.messageRepo.editMessage(editPayload.messageId, editPayload.content, editPayload.editedAt);
          } catch (dbErr) {
            console.warn('Failed to edit message in SQLite:', dbErr);
          }
        }
        this.emit('messageEdited', editPayload);
      } else if (envelope.type === 'msg:delete') {
        const delPayload = envelope.payload as { messageId: string };
        if (delPayload?.messageId) {
          try {
            this.messageRepo.deleteMessage(delPayload.messageId);
          } catch (dbErr) {
            console.warn('Failed to delete message in SQLite:', dbErr);
          }
        }
        this.emit('messageDeleted', delPayload);
      } else if (envelope.type === 'msg:sync_request') {
        const payload = (envelope.payload || {}) as { conversationId?: string; limit?: number };
        let history: Message[] = [];
        try {
          if (payload?.conversationId) {
            history = this.messageRepo.getConversationMessages(payload.conversationId, payload.limit || 100);
          } else {
            history = this.messageRepo.getRecentMessages(payload?.limit || 200);
          }
        } catch (dbErr) {
          console.warn('Failed to query messages for sync in SQLite:', dbErr);
        }

        this.signalingServer.sendToClient(envelope.senderId, {
          id: generateUUID(),
          type: 'msg:sync_response',
          senderId: this.profile.uid,
          recipientId: envelope.senderId,
          timestamp: Date.now(),
          payload: history,
        });
      }
    } catch (err) {
      console.warn('Error handling incoming envelope in daemon:', err);
    }
  }

  private authorizeMessage(senderId: string, recipientId: string, type: string): boolean {
    // 1. Local daemon user is always authorized to send
    if (senderId === this.profile.uid) {
      return true;
    }

    // 2. Incoming messages targeting this daemon
    if (recipientId === this.profile.uid) {
      // Protocol negotiation, signaling, and delivery acknowledgements are permitted
      if (
        type === 'ping' ||
        type === 'msg:ack' ||
        type === 'msg:read' ||
        type.startsWith('pairing:') ||
        type.startsWith('webrtc:') ||
        type.startsWith('call:') ||
        type.startsWith('transfer:')
      ) {
        return true;
      }

      // Check contact repository
      const contact = this.contactRepo.getContact(senderId);
      if (contact) {
        return true;
      }

      // Drop unauthorized private message injections from unknown peers
      return false;
    }

    // 3. Broadcast presence announcements
    if (recipientId === '*') {
      return type === 'presence:update';
    }

    // 4. Third-party transit: permit only if both peers are recognized contacts
    const senderContact = this.contactRepo.getContact(senderId);
    const recipientContact = this.contactRepo.getContact(recipientId);
    return !!(senderContact && recipientContact);
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
